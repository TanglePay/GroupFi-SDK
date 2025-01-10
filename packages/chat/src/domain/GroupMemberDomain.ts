import { Inject, Singleton } from "typescript-ioc";
import { CombinedStorageService } from "../service/CombinedStorageService";
import { IClearCommandBase, ICommandBase, ICycle, IFetchPublicGroupMessageCommand, IRunnable, IIncludesAndExcludes, IInboxGroup } from "../types";
import { ThreadHandler } from "../util/thread";
import { LRUCache } from "../util/lru";
import { GroupFiService } from "../service/GroupFiService";
import { GroupConfig, GroupConfigPlus, EvmQualifyChangedEvent,EventGroupMemberChanged, EventGroupUpdateMinMaxToken,DomainGroupUpdateMinMaxToken, ImInboxEventTypeGroupMemberChanged,ImInboxEventTypeMarkChanged, ImInboxEventTypeEvmQualifyChanged, PushedEvent, EventGroupMarkChanged, ImInboxEventTypeMuteChanged, EventGroupMuteChanged, ImInboxEventTypeLikeChanged, EventGroupLikeChanged, EventGroupIsPublicChanged, ImInboxEventTypeGroupIsPublicChanged, isGroupIdEqual, GroupStateSyncSchemaVersion, BasicOutputWrapper} from "groupfi-sdk-core";
import { objectId, bytesToHex, compareHex } from "groupfi-sdk-utils";
import { Channel } from "../util/channel";
import { EventSourceDomain } from "./EventSourceDomain";
import EventEmitter from "events";
import { IConversationDomainCmdFetchPublicGroupMessage, IConversationDomainCmdFetchPublicGroupMessageBatch } from "./ConversationDomain";
import { SharedContext } from "./SharedContext";
import { GroupStateSyncStorageExtended } from "groupfi-sdk-client";
import { 
    ImInboxEventTypeGroupStateSync, 
    EventGroupStateSyncChanged 
} from "groupfi-sdk-core";
import { IBasicOutput } from "@iota/iota.js";

export const StoragePrefixGroupMinMaxToken = 'GroupMemberDomain.groupMinMaxToken';
export interface IGroupMember {
    groupId: string;
    memberAddressList: {addr:string,publicKey:string}[];
}
export const EventGroupMemberChangedKey = 'GroupMemberDomain.groupMemberChanged';
export const EventGroupMemberChangedLiteKey = 'GroupMemberDomain.groupMemberChangedLite';
export const EventGroupMarkChangedLiteKey = 'GroupMemberDomain.groupMarkChangedLite'
export const EventForMeGroupConfigChangedKey = 'GroupMemberDomain.forMeGroupConfigChanged';
export const EventMarkedGroupConfigChangedKey = 'GroupMemberDomain.markedGroupConfigChanged';
export const EventGroupMuteChangedLiteKey = 'GroupMemberDomain.groupMuteChangedLite'
export const EventGroupLikeChangedLiteKey = 'GroupMemberDomain.groupLikeChangedLite'
export const EventGroupIsPublicChangedKey = 'GroupMemberDomain.groupIsPublicChanged';

@Singleton
export class GroupMemberDomain implements ICycle, IRunnable {
    private _lruCache: LRUCache<IGroupMember>;
    private _evmQualifyCache: LRUCache<{addr:string,publicKey:string}[]>;
    private _processingGroupIds: Map<string,NodeJS.Timeout>;
    private _inChannel: Channel<PushedEvent|EventGroupUpdateMinMaxToken>;
    private _groupMemberDomainCmdChannel: Channel<IClearCommandBase<any>> = new Channel<IClearCommandBase<any>>();
    private _forMeGroupConfigs: undefined | GroupConfigPlus[] = undefined

    @Inject
    private _context:SharedContext;

    // get for me group Configs
    get forMeGroupConfigs() {
        // if isLoggedIn, return all for me group configs, else return only public group configs
        // return this._context.isLoggedIn ? this._forMeGroupConfigs : this._forMeGroupConfigs?.filter(({isPublic}) => isPublic);
        // regardless of whether the user is logged in, do not filter public groups.
        // The Chat module also displays private groups.
        return this._forMeGroupConfigs
    }
    // get marked group configs
    get markedGroupConfigs() {
        // if isLoggedIn, return all marked group configs, else return empty array
        return this._context.isLoggedIn ? this._markedGroupConfigs : [];
    }
    private _markedGroupConfigs:GroupConfig[] | undefined = undefined;

    _onIncludesAndExcludesChangedHandler: () => void;
    _onLoggedInHandler: () => void;
    // isCanRefreshForMeGroupConfigs
    _isCanRefreshForMeGroupConfigs(): boolean {
        if (!this._context.isIncludeGroupNamesSet) {
            return false
        }
        if (this._context.userBrowseMode) {
            return true
        }
        return !!this._context.walletAddress
        // return !!this._context.proxyAddress
    }

    _lastTimeRefreshForMeGroupConfigs: number = 0;

    _lastTimeUpdateAllGroupIdsWithinContext: number = 0;

    _isCanUpdateAllGroupIdsWithinContext(): boolean {
        return this._isCanRefreshForMeGroupConfigs() || this._isCanRefreshMarkedGroupConfigs()
        // return this._context.isIncludeGroupNamesSet;
    }
    _isShouldUpdateAllGroupIdsWithinContext(): boolean {
        return Date.now() - this._lastTimeUpdateAllGroupIdsWithinContext > 60 * 1000;
    }
    private _dirtyGroupIds: Set<string> = new Set<string>();

    // Mark a group as dirty
    _markGroupIdAsDirty(groupId: string) {
        this._dirtyGroupIds.add(groupId);
    }

    // Adjusted batchFetchGroupIsPublic method
    async batchFetchGroupIsPublic(groupIds: string[]): Promise<{ [key: string]: boolean }> {
        let result: { [key: string]: boolean } = {};

        if (groupIds.length > 0) {
            try {
                // Batch check for public status using the groupFiService
                result = await this.groupFiService.batchFetchGroupIsPublic(groupIds) as Record<string, boolean>;

                // Update the result and cache
                for (const groupId in result) {
                    this._isGroupPublic.set(groupId, result[groupId]);
                }
                // Emit event at the end of batch refresh
                this._events.emit(EventGroupIsPublicChangedKey, { groupIds: groupIds, status: result });
            } catch (error) {
                console.error('Error in batchFetchGroupIsPublic:', error);
            }
        }

        return result;
    }

    // Function to refresh dirty group IDs, returns true if processed, false if not
    async _refreshDirtyGroupIds(): Promise<boolean> {
        if (this._dirtyGroupIds.size > 0) {
            const groupIdsToRefresh = Array.from(this._dirtyGroupIds);
            await this.batchFetchGroupIsPublic(groupIdsToRefresh);
            this._dirtyGroupIds.clear();
            return true; // Processed dirty group IDs
        }
        return false; // No dirty group IDs to process
    }

    // Handle EventGroupIsPublicChanged event
    _handleGroupIsPublicChangedEvent(event: EventGroupIsPublicChanged) {
        const { groupId } = event;
        
        // Mark the groupId as dirty
        this._markGroupIdAsDirty(groupId);
    }

    async _actualUpdateAllGroupIdsWithinContext() {
        const groupIds = this._getAllGroupIds();
        this._context.setAllGroupIds(groupIds, 'GroupMemberDomain','_actualUpdateAllGroupIdsWithinContext');
        this._lastTimeUpdateAllGroupIdsWithinContext = Date.now();
    }
    async tryUpdateAllGroupIdsWithinContext() {
        if (!this._isCanUpdateAllGroupIdsWithinContext()) {
            return false;
        }
        if (this._isShouldUpdateAllGroupIdsWithinContext()) {
            await this._actualUpdateAllGroupIdsWithinContext();
            return true;
        }
        return false;
    }
    // isShouldRefreshForMeGroupConfigs
    _isShouldRefreshForMeGroupConfigs(): boolean {
        return Date.now() - this._lastTimeRefreshForMeGroupConfigs > 60 * 1000;
    }

    // actualRefreshForMeGroupConfigs
    async _actualRefreshForMeGroupConfigs() {
        try {
            // log entering _actualRefreshForMeGroupConfigs
            const includesAndExcludes = this._context.includesAndExcludes;
            console.log('entering _actualRefreshForMeGroupConfigs', includesAndExcludes);
            const start = Date.now()
            console.log('===>test start _actualRefreshForMeGroupConfigs', Date.now())
            let configs: GroupConfigPlus[] = []
            if (includesAndExcludes.length > 0) {
                const promises: Promise<any>[] = [
                    ...(!this.isGroupStateSyncInited() ? [
                        this._fetchGroupState()
                    ] : []),
                    this.groupFiService.fetchForMeGroupConfigsWithoutProcessGroupConfigBeforeReturn({includes:includesAndExcludes})
                ];
                
                const results = await Promise.all(promises);
                configs = results[results.length - 1];
                console.log('===>test end _actualRefreshForMeGroupConfigs cost', Date.now(), Date.now() - start)
            }
            this._forMeGroupConfigs = configs;
            // get public group ids
            const publicGroupIds = configs.filter(({isPublic}) => isPublic).map(({groupId}) => groupId);
            const cmd:IFetchPublicGroupMessageCommand = {
                type: 'publicGroupOnBoot',
                groupIds: publicGroupIds
            }
            this._groupMemberDomainCmdChannel.push(cmd);
            this._lastTimeRefreshForMeGroupConfigs = Date.now();
            // emit event
            this._events.emit(EventForMeGroupConfigChangedKey,configs);
        } catch(error) {
            console.error('_actualRefreshForMeGroupConfigs error', error)
            throw error
        }
    }

    _isStartRefreshForMeGroupConfigs:boolean = false
    // try refresh public group configs, return is actual refreshed
    async tryRefreshForMeGroupConfigs() {
        if (!this._isCanRefreshForMeGroupConfigs()) {
            return false;
        }
        if (this._isShouldRefreshForMeGroupConfigs()) {
            if (!this._isStartRefreshForMeGroupConfigs) {
                this._context.setIsForMeGroupsLoading(true, 'tryRefreshForMeGroupConfigs', 'start loading forme groups')
            }
            this._isStartRefreshForMeGroupConfigs = true
            await this._actualRefreshForMeGroupConfigs();
            this._context.setIsForMeGroupsLoading(false, 'tryRefreshForMeGroupConfigs', 'forme groups loaded')
            return true;
        }
        return false;
    }

    // same sets of functions for marked group configs
    _isCanRefreshMarkedGroupConfigs(): boolean {
        return this._context.isLoggedIn;
    }

    _lastTimeRefreshMarkedGroupConfigs: number = 0;
    _isShouldRefreshMarkedGroupConfigs(): boolean {
        return (Date.now() - this._lastTimeRefreshMarkedGroupConfigs) > 60 * 1000;
    }

    async _actualRefreshMarkedGroupConfigs() {
        // log entering _actualRefreshMarkedGroupConfigs
        console.log('entering _actualRefreshMarkedGroupConfigs');
        
        const promises: Promise<any>[] = [
            // case lasttimerefreshAddressStatusMap is 0, refresh address status for all groups
            ...(this._lastTimeRefreshAddressStatusMap.size === 0 ? [
                this.tryRefreshAddressStatusForAll()
            ] : []),
            this.groupFiService.fetchAddressMarkedGroupConfigs()
        ];

        const configs = (await Promise.all(promises))[promises.length - 1];

        this._markedGroupConfigs = configs;
        this._lastTimeRefreshMarkedGroupConfigs = Date.now();
        // emit event
        this._events.emit(EventMarkedGroupConfigChangedKey,configs);
    }

    _getAllGroupIds() {
        // merge for me group ids and marked group ids
        const allGroupIds = [...this._getForMeGroupIds(),...this._getMarkedGroupIds()];
        // Remove duplicate group IDs.
        return [...new Set(allGroupIds)]
    }

    
    _getForMeGroupIds() {
        // if isLoggedIn, return all for me group ids, else return only public group ids from for me group configs
        // if (this._context.isLoggedIn) {
        //     return (this._forMeGroupConfigs ?? []).map(({groupId}) => groupId);
        // } else {
        //     return (this._forMeGroupConfigs ?? []).filter(({isPublic}) => isPublic).map(({groupId}) => groupId);
        // }   
        // Regardless of whether the user is logged in, do not filter public groups.
        // The Chat module also displays private groups.
        return (this._forMeGroupConfigs ?? []).map(({groupId}) => groupId)
    }
    _getMarkedGroupIds() {
        // if isLoggedIn, return all marked group ids, else return empty array
        if (this._context.isLoggedIn) {
            return (this._markedGroupConfigs ?? []).map(({groupId}) => groupId);
        } else {
            return [];
        }
    }
    async tryRefreshMarkedGroupConfigs() {
        if (!this._isCanRefreshMarkedGroupConfigs()) {
            return false;
        }
        if (this._isShouldRefreshMarkedGroupConfigs()) {
            await this._actualRefreshMarkedGroupConfigs();
            return true;
        }
        return false;
    }

    // getter for groupMemberDomainCmdChannel
    get groupMemberDomainCmdChannel() {
        return this._groupMemberDomainCmdChannel;
    }

    
    private _isGroupPublic: Map<string,boolean> = new Map<string,boolean>();

    private _markedGroupIds: Set<string> = new Set<string>();

    private _conversationDomainCmdChannel: Channel<ICommandBase<any>>;
    set conversationDomainCmdChannel(value: Channel<ICommandBase<any>>) {
        this._conversationDomainCmdChannel = value;
    }
    // group max min token
    private _groupMaxMinTokenLruCache: LRUCache<{max?:string,min?:string}>;

    _isGroupMaxMinTokenCacheDirtyGroupIds: Set<string> = new Set<string>();

    // try update group max min token
    async tryUpdateGroupMaxMinToken(groupId: string, {max,min}:{max?:string,min?:string}) {
        // compare token using compareHex
        let old = (await this.getGroupMaxMinToken(groupId)) || {};
        if (max && (!old.max || compareHex(max,old.max) > 0)) {
            old.max = max;
            // set dirty
            this._isGroupMaxMinTokenCacheDirtyGroupIds.add(groupId);
        }
        if (min && (!old.min || compareHex(min,old.min) < 0)) {
            old.min = min;
            // set dirty
            this._isGroupMaxMinTokenCacheDirtyGroupIds.add(groupId);
        }
    }

    // get key for group max min token
    _getGroupMaxMinTokenKey(groupId: string) {
        return `${StoragePrefixGroupMinMaxToken}.${groupId}`;
    }
    // get group max min token
    async getGroupMaxMinToken(groupId: string): Promise<{max?:string,min?:string}|null> {
        const key = this._getGroupMaxMinTokenKey(groupId);
        return await this.combinedStorageService.get(key,this._groupMaxMinTokenLruCache);
    }
    @Inject
    private eventSourceDomain: EventSourceDomain;

    @Inject
    private groupFiService: GroupFiService;

    private _events: EventEmitter = new EventEmitter();

    cacheClear() {
        if (this._lruCache) {
            this._lruCache.clear();
        }
        if (this._processingGroupIds) {
            // clear all pending refresh
            for (const timeoutHandle of this._processingGroupIds.values()) {
                clearTimeout(timeoutHandle);
            }
            this._processingGroupIds.clear();
        }
        if (this._groupMaxMinTokenLruCache) {
            this._groupMaxMinTokenLruCache.clear();
        }
        // _forMeGroupIdsLastUpdateTimestamp reset all time to 0
        // if (this._forMeGroupIdsLastUpdateTimestamp) {
        //     for (const groupId in this._forMeGroupIdsLastUpdateTimestamp) {
        //         this._forMeGroupIdsLastUpdateTimestamp[groupId] = 0;
        //     }
        // }
        this._forMeGroupIdsLastUpdateTimestamp = {}
        
        if (this._isGroupMaxMinTokenCacheDirtyGroupIds) {
            this._isGroupMaxMinTokenCacheDirtyGroupIds.clear();
        }
        if (this._groupMaxMinTokenLruCache) {
            this._groupMaxMinTokenLruCache.clear();
        }
        if (this._evmQualifyCache) {
            this._evmQualifyCache.clear();
        }
        // clear for me group configs
        this._forMeGroupConfigs = undefined

        // clear marked group configs
        this._markedGroupConfigs = []

        if (this._markedGroupIds) {
            this._markedGroupIds.clear();
        }

        if (this._addressStatusCache) {
            Object.keys(this._addressStatusCache).forEach(type => {
                this._addressStatusCache[type as keyof typeof this._addressStatusCache] = {};
            });
        }
        
        // Clear the refresh timestamps
        this._lastTimeRefreshAddressStatusMap.clear();

        // Clear group state syncs - initialize with default structure instead of undefined
        this._groupStateSyncs = {
            schemaVersion: GroupStateSyncSchemaVersion,
            items: []
        };
        this._isGroupStateSyncInited = false;
        this._isGroupStateSyncOutputUsed = false;
    }
    async bootstrap(): Promise<void> {
        this.threadHandler = new ThreadHandler(this.poll.bind(this), 'GroupMemberDomain', 100);
        this._lruCache = new LRUCache<IGroupMember>(100);
        this._evmQualifyCache = new LRUCache<{addr:string,publicKey:string}[]>(100);
        this._groupMaxMinTokenLruCache = new LRUCache<{max?:string,min?:string}>(100);
        this._onIncludesAndExcludesChangedHandler = () => {
            this._lastTimeRefreshForMeGroupConfigs = 0;
            this._lastTimeUpdateAllGroupIdsWithinContext = 0;
        }
        this._onLoggedInHandler = () => {
            if (this._context.isLoggedIn) {
                this._lastTimeRefreshMarkedGroupConfigs = 0;
            }
            this._lastTimeUpdateAllGroupIdsWithinContext = 0;
        }
        this._inChannel = this.eventSourceDomain.outChannelToGroupMemberDomain;
        this.eventSourceDomain.setGroupMemberDomain(this);  
        // log
        console.log('GroupMemberDomain bootstraped');
    }
    @Inject
    private combinedStorageService: CombinedStorageService;

    private threadHandler: ThreadHandler;
    async start() {
        this._processingGroupIds = new Map<string,NodeJS.Timeout>();
        this._processedPublicGroupIds = new Set<string>()
        this._context.clearIsForMeGroupsLoading('GroupMemberDomain','thread start')

        this._lastTimeRefreshForMeGroupConfigs = 0
        this._isStartRefreshForMeGroupConfigs = false
        this._lastTimeRefreshMarkedGroupConfigs = 0

        this._forMeGroupConfigs = undefined
        this._markedGroupConfigs = undefined
        
        // initial address qualified group configs
        this.threadHandler.start();
        // log
        console.log('GroupMemberDomain started');
    }

    async resume() {
        this._context.onIncludesAndExcludesChanged(this._onIncludesAndExcludesChangedHandler.bind(this));
        this._context.onLoginStatusChanged(this._onLoggedInHandler.bind(this));
        this.threadHandler.resume();
    }

    async pause() {
        this._context.offIncludesAndExcludesChanged(this._onIncludesAndExcludesChangedHandler.bind(this));
        this._context.offLoginStatusChanged(this._onLoggedInHandler.bind(this));
        this.persistDirtyGroupMaxMinToken();

        this.threadHandler.pause();
    }

    async stop() {
        this.cacheClear()
        await this.threadHandler.drainAndStop();
    }

    async destroy() {
        this.threadHandler.destroy();
        this.cacheClear();
        //@ts-ignore
        this._lruCache = undefined;
        //@ts-ignore
        this._processingGroupIds = undefined;
    }
    _forMeGroupIdsLastUpdateTimestamp: Record<string,number> = {};
    _processedPublicGroupIds: Set<string>;

    async poll(): Promise<boolean> {
        const cmd = this._groupMemberDomainCmdChannel.poll();
        if (cmd) {
            // log
            console.log(`GroupMemberDomain poll ${JSON.stringify(cmd)}`);
            if (cmd.type === 'publicGroupOnBoot') {
                let { groupIds } = cmd as IFetchPublicGroupMessageCommand;
                for (const groupId of groupIds) {
                    console.log('_processedPublicGroupIds has groupId?', groupId, this._processedPublicGroupIds.has(groupId))
                }
                // filter groupIds that are already processed
                groupIds = groupIds.filter(groupId => !this._processedPublicGroupIds.has(groupId));
                if (groupIds.length === 0) {
                    return false;
                }
                // update processedPublicGroupIds
                groupIds.map(groupId => this._processedPublicGroupIds.add(groupId));
                await Promise.all([
                    this._refreshMarkedGroupAsync(),
                    ...groupIds.map(groupId => this._refreshGroupPublicAsync(groupId))]);
                // log _markedGroupIds
                console.log('_markedGroupIds',this._markedGroupIds);
                this._forMeGroupIdsLastUpdateTimestamp = {};
                for (const groupId of groupIds) {
                    this._forMeGroupIdsLastUpdateTimestamp[groupId] = 0;
                }
            }
            return false;
        }

        const isForMeConfigUpdated = await this.tryRefreshForMeGroupConfigs();
        if (isForMeConfigUpdated) {
            return false;
        }
        const isMarkedConfigUpdated = await this.tryRefreshMarkedGroupConfigs();
        if (isMarkedConfigUpdated) {
            return false;
        }
        const isMuteMapUpdated = await this.tryRefreshMuteMap();
        if (isMuteMapUpdated) {
            return false;
        }
        
        const isAllGroupIdsUpdated = await this.tryUpdateAllGroupIdsWithinContext();
        if (isAllGroupIdsUpdated) {
            return false;
        }

        const isAddressStatusUpdated = await this.tryRefreshAddressStatusForAll();
        if (isAddressStatusUpdated) {
            return false;
        }

        const event = this._inChannel.poll();
        if (event) {
            // log
            console.log(`GroupMemberDomain poll ${JSON.stringify(event)}`);
            const { type } = event;
            if (type === ImInboxEventTypeGroupMemberChanged) {
                console.log('mqtt event ImInboxEventTypeGroupMemberChanged', event)
                const { groupId, isNewMember, address, timestamp } = event as EventGroupMemberChanged;
                const profile = await this.groupFiService.getProfileFromNameMappingCache(address)
                if (profile?.name) {
                    event.name = profile.name
                } 
                if (profile?.avatar) {
                    event.avatar = profile.avatar
                }
                this._events.emit(EventGroupMemberChangedLiteKey, event);
                this._lastTimeRefreshMarkedGroupConfigs = 0;
                // log event emitted
                console.log(EventGroupMemberChangedLiteKey,{ groupId, isNewMember, address })
                this._refreshGroupMember(groupId);
            } else if (type === DomainGroupUpdateMinMaxToken) {
                console.log('==> mqtt event DomainGroupUpdateMinMaxToken', event)
                const { groupId, min,max } = event as EventGroupUpdateMinMaxToken;
                this.tryUpdateGroupMaxMinToken(groupId,{min,max});
            } else if (type === ImInboxEventTypeMarkChanged) {
                const { groupId, isNewMark} = event as EventGroupMarkChanged
                this._lastTimeRefreshMarkedGroupConfigs = 0;
                this._events.emit(EventGroupMarkChangedLiteKey, event)
            } else if (type === ImInboxEventTypeEvmQualifyChanged) {
                const { groupId } = event as EvmQualifyChangedEvent
                this._refreshGroupEvmQualify(groupId);
            } else if (type === ImInboxEventTypeMuteChanged) {
                const { groupId, isMuted } = event as EventGroupMuteChanged
                this._events.emit(EventGroupMuteChangedLiteKey, event)
            } else if (type === ImInboxEventTypeLikeChanged) {
                this._events.emit(EventGroupLikeChangedLiteKey, event as EventGroupLikeChanged)
            } else if (type === ImInboxEventTypeGroupIsPublicChanged) {
                this._handleGroupIsPublicChangedEvent(event as EventGroupIsPublicChanged);
            } else if (type === ImInboxEventTypeGroupStateSync) {
                await this._handleGroupStateSyncChangedEvent(event as EventGroupStateSyncChanged);
            }
            return false;
        } 
        // handle dirty group max min token
        if (this._isGroupMaxMinTokenCacheDirtyGroupIds.size > 0) {
            // log
            console.log('GroupMemberDomain poll dirty group max min token');
            this.persistDirtyGroupMaxMinToken();
            return false;
        } 
        
        const isGroupPublicRefreshed = await this._refreshDirtyGroupIds();
        if (isGroupPublicRefreshed) {
            return false;
        }
        await this._checkForMeGroupIdsLastUpdateTimestamp();

        return true;
    }
    // persist dirty group max min token
    persistDirtyGroupMaxMinToken() {
        if (this._isGroupMaxMinTokenCacheDirtyGroupIds.size === 0) {
            return;
        }
        for (const groupId of this._isGroupMaxMinTokenCacheDirtyGroupIds) {
            const key = this._getGroupMaxMinTokenKey(groupId);
            const value = this._groupMaxMinTokenLruCache.getOrDefault(groupId,{});
            this.combinedStorageService.setSingleThreaded(key,value,this._groupMaxMinTokenLruCache);
        }
        this._isGroupMaxMinTokenCacheDirtyGroupIds.clear();
    }
    async _checkForMeGroupIdsLastUpdateTimestamp() {
        const now = Date.now();
        const groupIdsToUpdate: string[] = [];

        for (const groupId in this._forMeGroupIdsLastUpdateTimestamp) {
            if (now - this._forMeGroupIdsLastUpdateTimestamp[groupId] > 60 * 1000) {
                const isGroupPublic = await this.isGroupPublic(groupId);
                const isGroupMarked = this._markedGroupIds.has(groupId);
                
                // log groupId, isGroupPublic, isGroupMarked
                console.log(groupId, isGroupPublic, isGroupMarked);
                
                if (isGroupPublic && !isGroupMarked) {
                    groupIdsToUpdate.push(groupId);
                }
                this._forMeGroupIdsLastUpdateTimestamp[groupId] = now;
            }
        }

        if (groupIdsToUpdate.length > 0) {
            const cmd: IConversationDomainCmdFetchPublicGroupMessageBatch = {
                type: 3,
                groupIds: groupIdsToUpdate
            };
            // log cmd
            console.log('_checkForMeGroupIdsLastUpdateTimestamp batch cmd', cmd);
            this._conversationDomainCmdChannel.push(cmd);
        }
    }
    on(key: string, callback: (event: any) => void) {
        this._events.on(key, callback)
    }
    off(key: string, callback: (event: any) => void) {
        this._events.off(key, callback)
    }
    // Add generic once method
    once(key: string, callback: (event: any) => void) {
        this._events.once(key, callback)
    }
    _getGroupMemberKey(groupId: string) {
        return `GroupMemberDomain.groupMember.${groupId}`;
    }
    _getGroupEvmQualifyKey(groupId: string) {
        return `GroupMemberDomain.groupEvmQualify.${groupId}`;
    }
    _refreshGroupMember(groupId: string) {
        // log
        console.log(`GroupMemberDomain refreshGroupMember ${groupId}`);
        const key = this._getGroupMemberKey(groupId);
        if (this._processingGroupIds.has(key)) {
            return false;
        }
        const handle = setTimeout(async () => {
            await this._refreshGroupMemberInternal(groupId);
        }, 0);
        this._processingGroupIds.set(key,handle);
        return true;
        
    }
    _refreshGroupEvmQualify(groupId: string) {
        const key = this._getGroupEvmQualifyKey(groupId);
        if (this._processingGroupIds.has(key)) {
            return false;
        }
        const handle = setTimeout(async () => {
            await this._refreshGroupEvmQualifyInternal(groupId);
        }, 0);
        this._processingGroupIds.set(key,handle);
        return true;
    }
    // get key for group member
    _getKeyForGroupMember(groupId: string) {
        return `GroupMemberDomain.groupMember.${groupId}`;
    }
    // get key for group public
    _getKeyForGroupPublic(groupId: string) {
        return `GroupMemberDomain.groupPublic.${groupId}`;
    }
    // get key for group marked
    _getKeyForGroupMarked() {
        return `GroupMemberDomain.groupMarked`;
    }

    async _refreshGroupMemberAsync(groupId: string) {
        groupId = this._gid(groupId);
        // log
        console.log(`GroupMemberDomain refreshGroupMember ${groupId}`);
        const key = this._getKeyForGroupMember(groupId);
        if (this._processingGroupIds.has(key)) {
            return false;
        }
        this._processingGroupIds.set(key,0 as any);
        // log actual refresh
        console.log(`GroupMemberDomain refreshGroupMember ${groupId} actual refresh`);
        await this._refreshGroupMemberInternal(groupId);
    }

    // refresh group qualified async
    async _refreshGroupEvmQualifyAsync(groupId: string) {
        const key = this._getGroupEvmQualifyKey(groupId);
        if (this._processingGroupIds.has(key)) {
            return false;
        }
        this._processingGroupIds.set(key,0 as any);
        await this._refreshGroupEvmQualifyInternal(groupId);
    }
    async _refreshGroupMemberInternal(groupId: string) {
        groupId = this._gid(groupId);
        try {
            const groupMemberList = await this.groupFiService.loadGroupMemberAddresses2(groupId) as {ownerAddress:string,publicKey:string}[];
            const groupMember: IGroupMember = {
                groupId,
                memberAddressList: groupMemberList.map(({ownerAddress,publicKey}) => ({addr:ownerAddress,publicKey}))
            };
            this.combinedStorageService.setSingleThreaded(this._getGroupMemberKey(groupId), groupMember, this._lruCache);                
            // emit event
            this._events.emit(EventGroupMemberChangedKey, {groupId});
        } catch (e) {
            console.error('_refreshGroupMemberInternal',e);
        } finally {
            const key = this._getKeyForGroupMember(groupId);
            this._processingGroupIds.delete(key);
        }
    }
    // refresh group evm qualify internal
    async _refreshGroupEvmQualifyInternal(groupId: string) {
        // log entering refreshGroupEvmQualifyInternal
        console.log('entering refreshGroupEvmQualifyInternal',groupId);
        const key = this._getGroupEvmQualifyKey(groupId);
        try {
            const groupQualifyList = await this.groupFiService.getPluginGroupEvmQualifiedList(groupId);
            this.combinedStorageService.setSingleThreaded(key, groupQualifyList, this._evmQualifyCache);
        } catch (e) {
            console.error('refreshGroupEvmQualifyInternal',e);
        } finally {
            this._processingGroupIds.delete(key);
        }
    }
    _gid(groupId: string) {
        return this.groupFiService.addHexPrefixIfAbsent(groupId);
    }
    // refresh is group public async
    async _refreshGroupPublicAsync(groupId: string) {
        // log entering _refreshGroupPublicAsync
        console.log('entering _refreshGroupPublicAsync',groupId);
        groupId = this._gid(groupId);
        const key = this._getKeyForGroupPublic(groupId);
        if (this._processingGroupIds.has(key)) {
            return false;
        }
        this._processingGroupIds.set(key,0 as any);
        await this._refreshGroupPublicInternal(groupId);
    }
    // refresh is group public
    async _refreshGroupPublicInternal(groupId: string) {
        // log entering _refreshGroupPublicInternal
        console.log('entering _refreshGroupPublicInternal',groupId);
        try {
            const isGroupPublic = await this.groupFiService.isGroupPublic(groupId);
            this._isGroupPublic.set(groupId,isGroupPublic);
        } catch (e) {
            console.error(e);
        } finally {
            const key = this._getKeyForGroupPublic(groupId);
            this._processingGroupIds.delete(key);
        }
    }
    // refresh marked group async
    async _refreshMarkedGroupAsync() {
        if (!this._isCanRefreshMarkedGroupConfigs()) {
            return
        }
        const key = this._getKeyForGroupMarked();
        if (this._processingGroupIds.has(key)) {
            return false;
        }
        this._processingGroupIds.set(key,0 as any);
        await this._refreshMarkedGroupInternal();
    }
    async _refreshMarkedGroupInternal() {
        try {
            const groupIds = await this.groupFiService.fetchAddressMarkedGroups();
            this._markedGroupIds = new Set(groupIds.map(this._gid.bind(this)));
        } catch (e) {
            console.error(e);
        } finally {
            const key = this._getKeyForGroupMarked();
            this._processingGroupIds.delete(key);
        }
    }
    async getGroupMember(groupId: string): Promise<{addr:string,publicKey:string}[] | undefined> {
        groupId = this._gid(groupId);
        const key = this._getGroupMemberKey(groupId);
        const groupMember = await this.combinedStorageService.get(key, this._lruCache);
        //TODO remove
        // log key groupMember
        console.log('getGroupMember',key,groupMember);
        if (groupMember) {
            return groupMember.memberAddressList;
        } else {
            return undefined;
        }
    }
    async getGroupEvmQualify(groupId: string): Promise<{addr:string,publicKey:string}[] | undefined> {
        const key = this._getGroupEvmQualifyKey(groupId);
        const groupQualifyList = await this.combinedStorageService.get(key, this._evmQualifyCache);
        if (groupQualifyList) {
            return groupQualifyList;
        } else {
            return undefined;
        }
    }
    // get is group public
    async isGroupPublic(groupId: string): Promise<boolean | undefined> {
        groupId = this._gid(groupId);
        if (this._isGroupPublic.has(groupId)) {
            return this._isGroupPublic.get(groupId);
        } else {
            return undefined;
        }
    }

    // isGroupPublicLite
    isGroupPublicLite(groupId: string): boolean {
        groupId = this._gid(groupId);
        if (!this._isGroupPublic.has(groupId)) {
            return false;
        }
        return this._isGroupPublic.get(groupId)!;
    }
    isAnnouncementGroup(groupId: string) {
        groupId = this._gid(groupId);
        // const isForMeGroup = this._forMeGroupConfigs?.find(formeGroup => formeGroup.groupId === groupId)
        const isForMeGroup = this._forMeGroupConfigs?.find(formeGroup => isGroupIdEqual(groupId, formeGroup.groupId))
        if (isForMeGroup === undefined) {
            return false
        }
        const announcement = this._context._getProperty<IIncludesAndExcludes[]>('announcement')
        for (const group of announcement) {
            // if (isForMeGroup.dappGroupId === group.groupId) {
            //     return true
            // }
            if (isGroupIdEqual(group.groupId, isForMeGroup.groupId)) {
                return true
            }
        }
        return false
    }

    // Add these near the top with other private fields
    private _lastTimeRefreshMuteMap: number = 0;
    private _isStartRefreshMuteMap: boolean = false;

    // Add these methods after other similar refresh methods
    _isCanRefreshMuteMap(): boolean {
        return this._context.isLoggedIn;
    }

    _isShouldRefreshMuteMap(): boolean {
        return Date.now() - this._lastTimeRefreshMuteMap > 60 * 1000;
    }

    async tryRefreshMuteMap() {
        if (!this._isCanRefreshMuteMap()) {
            return false;
        }
        if (this._isShouldRefreshMuteMap()) {
            try {
                await this.groupFiService.tryRefreshUserMuteGroupAddresses();
                this._lastTimeRefreshMuteMap = Date.now();
                return true;
            } catch (error) {
                console.error('Error refreshing mute map:', error);
                return false;
            }
        }
        return false;
    }

    // Add these near the top with other private fields
    private _addressStatusCache: {
        isGroupPublic: Record<string, boolean>;
        muted: Record<string, boolean>;
        isQualified: Record<string, boolean>;
        marked: Record<string, boolean>;
    } = {
        isGroupPublic: {},
        muted: {},
        isQualified: {},
        marked: {}
    };

    private _lastTimeRefreshAddressStatusMap: Map<string, number> = new Map();

    // Update the _isShouldRefreshAddressStatus method to take groupId
    private _isShouldRefreshAddressStatus(groupId: string): boolean {
        const lastTime = this._lastTimeRefreshAddressStatusMap.get(groupId) || 0;
        return Date.now() - lastTime > 60 * 1000;
    }

    _isCanRefreshAddressStatus(): boolean {
        return !!this._context.walletAddress;
    }

    // Update to handle all groups
    async tryRefreshAddressStatusForAll(): Promise<boolean> {
        if (!this._isCanRefreshAddressStatus()) {
            return false;
        }

        // Get all group IDs
        const allGroupIds = this._getAllGroupIds();
        let hasUpdates = false;

        // Add any new group IDs to the timestamp map with time 0
        for (const groupId of allGroupIds) {
            if (!this._lastTimeRefreshAddressStatusMap.has(groupId)) {
                this._lastTimeRefreshAddressStatusMap.set(groupId, 0);
            }
        }

        // Filter groups that need updating and refresh them in parallel
        const groupsToUpdate = allGroupIds.filter(groupId => this._isShouldRefreshAddressStatus(groupId));
        if (groupsToUpdate.length > 0) {
            await Promise.all(groupsToUpdate.map(async groupId => {
                await this._actualRefreshAddressStatus(groupId);
                this._events.emit(this.getAddressStatusChangedEventKey(groupId));
            }));
            hasUpdates = true;
        }

        return hasUpdates;
    }

    private async _actualRefreshAddressStatus(groupId: string) {
        const statusTypes = [
            {
                type: 'muted' as const,
                func: () => this.groupFiService.isBlackListed(groupId)
            },
            {
                type: 'isQualified' as const,
                func: () => this.groupFiService.isQualified(groupId)
            },
            {
                type: 'marked' as const,
                func: () => this.groupFiService.marked(groupId)
            }
        ];

        try {
            const results = await Promise.all(statusTypes.map(item => item.func()));
            
            statusTypes.forEach((item, i) => {
                this._addressStatusCache[item.type][groupId] = results[i];
            });

            // Update last refresh time for this specific group
            this._lastTimeRefreshAddressStatusMap.set(groupId, Date.now());
        } catch (error) {
            console.error('Error refreshing address status:', error);
            throw error;
        }
    }

    getAddressStatusInGroup(groupId: string): {
        muted: boolean;
        isQualified: boolean;
        marked: boolean;
    } | undefined {
        // Return undefined if any status is not in cache
        if (!(groupId in this._addressStatusCache.muted) || 
            !(groupId in this._addressStatusCache.isQualified) || 
            !(groupId in this._addressStatusCache.marked)) {
            return undefined;
        }

        return {
            muted: this._addressStatusCache.muted[groupId],
            isQualified: this._addressStatusCache.isQualified[groupId],
            marked: this._addressStatusCache.marked[groupId]
        };
    }

    // Reset last refresh time for address status for a specific group
    resetAddressStatusLastTimeForGroup(groupId: string) {
        this._lastTimeRefreshAddressStatusMap.set(groupId, 0);
    }

    // Add method to get the event key for a specific groupId
    getAddressStatusChangedEventKey(groupId: string): string {
        return `GroupMemberDomain.addressStatusChanged.${groupId}`;
    }

    // Add this method after the getAddressStatusInGroup method
    setAddressStatusInGroup(groupId: string, type: keyof typeof this._addressStatusCache, newValue: boolean) {
        // Validate the type parameter
        if (!(type in this._addressStatusCache)) {
            console.error(`Invalid status type: ${type}`);
            return;
        }

        // Update the cache value
        this._addressStatusCache[type][groupId] = newValue;

        // Emit the status changed event for this group
        this._events.emit(this.getAddressStatusChangedEventKey(groupId));
    }

    // Add this method
    removeAllListeners(eventKey: string) {
        this._events.removeAllListeners(eventKey);
    }

    // Add these near the top with other private fields
    private _groupStateSyncs: GroupStateSyncStorageExtended = {
        schemaVersion: GroupStateSyncSchemaVersion,
        items: []
    };
    private _isGroupStateSyncOutputUsed: boolean = false;

    // Add these near the top with other private fields
    private _isGroupStateSyncInited: boolean = false;

    // Add these methods after other similar methods

    // Get all group state syncs with their timestamps
    async getAllGroupStateTimestamps(): Promise<Record<string, number>> {
        const timestamps: Record<string, number> = {};
        if (this._groupStateSyncs.items) {
            for (const item of this._groupStateSyncs.items) {
                timestamps[item.groupId] = item.lastTimeReadLatestMessageTimestamp;
            }
        }
        return timestamps;
    }

    // Updates timestamps in memory and returns if changes were made
    updateGroupStateTimestampsInMemory(groups: { groupId: string; lastTimeReadLatestMessageTimestamp?: number }[]): boolean {
        // Convert current state to timestamps map
        const currentTimestamps: Record<string, number> = {};
        this._groupStateSyncs.items.forEach(item => {
            if (item && item.groupId) {
                currentTimestamps[item.groupId] = item.lastTimeReadLatestMessageTimestamp;
            }
        });

        let hasChanges = false;

        // Update timestamps in place if needed
        for (const group of groups) {
            if (!group || !group.groupId) continue;
            
            // Prefix the groupId using _gid method
            const prefixedGroupId = this._gid(group.groupId);
            const timestamp = group.lastTimeReadLatestMessageTimestamp ?? 0;

            if (!currentTimestamps[prefixedGroupId] || currentTimestamps[prefixedGroupId] < timestamp) {
                currentTimestamps[prefixedGroupId] = timestamp;
                hasChanges = true;
            } else if (currentTimestamps[prefixedGroupId] > timestamp) {
                // Update the group's timestamp if current state has a newer timestamp
                group.lastTimeReadLatestMessageTimestamp = currentTimestamps[prefixedGroupId];
            }
        }

        // Update internal state if changes detected
        if (hasChanges) {
            this._groupStateSyncs.items = Object.entries(currentTimestamps).map(([groupId, timestamp]) => ({
                groupId,
                lastTimeReadLatestMessageTimestamp: timestamp
            }));
        }

        return hasChanges;
    }

    syncGroupStateTimestamps(groups: { groupId: string; lastTimeReadLatestMessageTimestamp?: number }[]): {created: IBasicOutput[], consumed: BasicOutputWrapper[]} {
        this.updateGroupStateTimestampsInMemory(groups);
        
        // log enter
        console.log('GroupMemberDomain syncGroupStateTimestamps, enter, this._isGroupStateSyncOutputUsed', this._isGroupStateSyncOutputUsed);
        if (!this._isGroupStateSyncOutputUsed) {
            this._isGroupStateSyncOutputUsed = true;
            return this.groupFiService.persistGroupStateSyncs(this._groupStateSyncs.items, this._groupStateSyncs.outputWrapper);
        }
        
        return {created: [], consumed: []};
    }

    async _handleGroupStateSyncChangedEvent(event: EventGroupStateSyncChanged) {
        try {
            // Refresh the group state when a sync event is received
            // log
            console.log('GroupMemberDomain _handleGroupStateSyncChangedEvent', event)
            await this._fetchGroupState();
        } catch (error) {
            console.error('Error handling group state sync event:', error);
        }
    }

    // Add this method after other group state sync related methods
    isGroupStateSyncInited(): boolean {
        return this._isGroupStateSyncInited;
    }

    // Update the _fetchGroupState method
    async _fetchGroupState(): Promise<void> {
        try {
            const newGroupStateSyncs = await this.groupFiService.getAllGroupStateSyncs();
            console.log('Fetched group state syncs:newGroupStateSyncs', newGroupStateSyncs, 'this._groupStateSyncs', this._groupStateSyncs, 'is outputid changed', this._groupStateSyncs.outputWrapper?.outputId != newGroupStateSyncs?.outputWrapper?.outputId);
            if (newGroupStateSyncs) {
                // case outputid changed, compare to newGroupStateSyncs
                if (this._groupStateSyncs.outputWrapper && this._groupStateSyncs.outputWrapper.outputId != newGroupStateSyncs.outputWrapper?.outputId) {
                    this._isGroupStateSyncOutputUsed = false;
                    // log reset
                    console.log('GroupMemberDomain _fetchGroupState, outputId changed, reset _isGroupStateSyncOutputUsed to false');
                }
                this._groupStateSyncs = newGroupStateSyncs;
                this._isGroupStateSyncInited = true; // Set to true after successful fetch
            }
        } catch (error) {
            console.error('Error fetching group state syncs:', error);
        }
    }
}