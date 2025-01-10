import { Inject, Singleton } from "typescript-ioc";
import { IMessage, GroupFiSDKObj } from 'groupfi-sdk-core'
import { LocalStorageRepository } from "../repository/LocalStorageRepository";
import { MessageHubDomain } from "./MessageHubDomain";
import { GROUP_STATE_PERSIST_KEY, ICycle, IInboxMessage, IRunnable } from "../types";
import { Channel } from "../util/channel";
import { ThreadHandler } from "../util/thread";
import EventEmitter from "events";
import { LRUCache } from "../util/lru";
import { CombinedStorageService } from "../service/CombinedStorageService";
import { IInboxGroup } from "../types";
import { getCurrentEpochInSeconds, sleepYield } from "groupfi-sdk-utils";
import { GroupMemberDomain } from "./GroupMemberDomain";
import { clearAll, clearByKey, throttle, debounce } from "../util/misc";
import { GroupFiService } from "../service/GroupFiService";
// maintain list of groupid, order matters
// maintain state of each group, including group name, last message, unread count, etc
// restore from local storage on start, then update on new message from inbox message hub domain
export const InboxListStoreKey = 'InboxDomain.groupIdsList';
export const InboxGroupStorePrefix = 'InboxDomain.group.';
export const EventInboxLoaded = 'InboxDomain.loaded';
export const EventInboxReady = 'InboxDomain.ready';
export const EventInboxUpdated = 'InboxDomain.updated';
export const MaxGroupInInbox = 500;
export const MaxUnReadInInbox = 20

@Singleton
export class InboxDomain implements ICycle, IRunnable {

    @Inject
    private combinedStorageService: CombinedStorageService;

    @Inject
    private groupFiService: GroupFiService;
    @Inject
    private groupMemberDomain: GroupMemberDomain;
    @Inject
    private localStorageRepository: LocalStorageRepository;
    private _events: EventEmitter = new EventEmitter();
    private _groupIdsList: string[] = [];
    private _groups: LRUCache<IInboxGroup>;
    private _pendingGroupIdsListUpdate: boolean = false;
    private _pendingGroupsUpdateGroupIds: Set<string> = new Set<string>();
    private _firstUpdateEmitted: boolean = false;
    private _syncGroupDebounces: Map<string, Function> = new Map();

    cacheClear() {
        if (this._groups) {
            this._groups.clear();
        }
    }
    getGroupStoreKey(groupId: string) {
        return `${InboxGroupStorePrefix}${groupId}`;
    }
    private threadHandler: ThreadHandler;
    async start() {
        this.switchAddress()
        this.threadHandler.start();
    }
    
    async resume() {
        this.threadHandler.resume();
    }

    async pause() {
        this.threadHandler.pause();
    }

    async stop() {
        this.cacheClear()
        await this.threadHandler.drainAndStop();
    }

    async destroy() {
        this.threadHandler.destroy();
        this._syncGroupDebounces.clear();
        //@ts-ignore
        this._groups = undefined;
    }

    _getDefaultGroup(groupId: string): IInboxGroup {
        const groupConfig = GroupFiSDKObj._groupIdToGroupMeta(groupId) 
        return {
            groupId,
            dappGroupId: groupConfig?.dappGroupId,
            latestMessage: undefined,
            unreadCount: 0
        }
    }

    async _loadGroupIdsListFromLocalStorage() {
        const groupIdsListRaw = await this.localStorageRepository.get(InboxListStoreKey);
        // log method and groupIdsListRaw
        console.log('_loadGroupIdsListFromLocalStorage', groupIdsListRaw);
        if (groupIdsListRaw) {
            this._groupIdsList = JSON.parse(groupIdsListRaw) as string[]
        }
    }
    async _saveGroupIdsListToLocalStorage() {
        // log method and groupIdsList
        console.log('_saveGroupIdsListToLocalStorage',this._groupIdsList);
        await this.localStorageRepository.set(InboxListStoreKey, JSON.stringify(this._groupIdsList));
    }
    async _adjustGroupIdsList(groupId: string, latestMessageTimestamp: number) {
        const newList = []
        let positionFounded = false
        for(const id of this._groupIdsList) {
            if (id === groupId) {
                continue
            }
            if (positionFounded) {
                newList.push(id)
                continue
            }
            const group = await this.getGroup(id)
            const timestamp = group.latestMessage?.timestamp
            if (timestamp === undefined || latestMessageTimestamp >= timestamp) {
                positionFounded = true
                newList.push(groupId)
            }
            newList.push(id)
        }
        if (!newList.includes(groupId)) {
            newList.push(groupId)
        }

        // truncate new list to max length
        newList.length = Math.min(newList.length, MaxGroupInInbox);
        // update list
        this._groupIdsList = newList;
        this._pendingGroupIdsListUpdate = true;
    }
    async _moveGroupIdToFront(groupId: string) {
        // make a new list
        const newList = [groupId];
        // loop through old list, add all other group id to new list
        for (const oldGroupId of this._groupIdsList) {
            if (oldGroupId !== groupId) {
                newList.push(oldGroupId);
            }
        }
        // truncate new list to max length
        newList.length = Math.min(newList.length, MaxGroupInInbox);
        // update list
        this._groupIdsList = newList;
        this._pendingGroupIdsListUpdate = true;
    }

    async getGroup(groupId: string) {
        const key = this.getGroupStoreKey(groupId);
        let group = await this.combinedStorageService.get(key, this._groups);
        if (!group) {
            group = this._getDefaultGroup(groupId);
            this._groups.put(key, group);
        }
        this._syncGroupDebounced(groupId);
        return group;
    }
    _getGroupFromCacheOnly(groupId: string) {
        const key = this.getGroupStoreKey(groupId);
        const group = this._groups.get(key);
        if (group) {
            return group;
        } else {
            return undefined;
        }
    }
    setGroup(groupId: string, group: IInboxGroup, delay?: number) {
        const key = this.getGroupStoreKey(groupId);
        this.combinedStorageService.setSingleThreaded(key, group, this._groups);
        this._syncGroupDebounced(groupId, delay);
    }
    _persistGroupIfInCache(groupId: string) {
        const group = this._getGroupFromCacheOnly(groupId);
        if (group) {
            this.setGroup(groupId, group);
        }
    }
    async clearUnreadCount(groupId: string) {
        const group = await this.getGroup(groupId);
        group.unreadCount = 0;
        group.lastTimeReadLatestMessageTimestamp = group.latestMessage?.timestamp??0;
        const currentTime = getCurrentEpochInSeconds() + 3
        group.lastTimeReadLatestMessageTimestamp = Math.max(currentTime, group.lastTimeReadLatestMessageTimestamp)
        // log set group from clearUnreadCount, with group
        console.log('InboxDomain set group from clearUnreadCount', JSON.stringify(group));
        this.setGroup(groupId, group);
    }

    async setUnreadCount(groupId: string, unreadCount: number, lastTimeReadLatestMessageTimestamp: number) {
        const group = await this.getGroup(groupId);
        group.unreadCount = unreadCount
        const currentTime = getCurrentEpochInSeconds() + 15
        group.lastTimeReadLatestMessageTimestamp = Math.max(currentTime, lastTimeReadLatestMessageTimestamp)
        this.setGroup(groupId, group);
        clearByKey(GROUP_STATE_PERSIST_KEY)
        this._syncGroupState(groupId, 20);
    }
    
    async poll(): Promise<boolean> {
        // poll from in channel
        const messageStruct = this._inChannel.poll();

        if (messageStruct) {
            // log messageStruct
            console.log('InboxDomain messageStruct', messageStruct);
            //{messageId:string, groupId:string, sender:string, message:string, timestamp:number}
            const { groupId, sender, message, timestamp, name } = messageStruct;
            const group = await this.getGroup(groupId);

            const latestMessage: IInboxMessage = {
                sender,
                message,
                timestamp,
                name
            }
            let isDataChanged = false;
            const isNewMessageEarlierThanCurrentLatestMessage = group.latestMessage !== undefined && timestamp < group.latestMessage.timestamp
            if(!isNewMessageEarlierThanCurrentLatestMessage) {
                group.latestMessage = latestMessage
                // this._moveGroupIdToFront(groupId)
                this._adjustGroupIdsList(groupId, timestamp)
                this._pendingGroupsUpdateGroupIds.add(groupId);
                isDataChanged = true;
            }
            // update unread count if unread count is less than max and message's timestamp is later than last time read
            if (group.unreadCount <= MaxUnReadInInbox && timestamp > (group.lastTimeReadLatestMessageTimestamp??0)) {
                // log unread count increase, timestamp, lastTimeReadLatestMessageTimestamp
                group.unreadCount++
                this._pendingGroupsUpdateGroupIds.add(groupId);
                isDataChanged = true;
            }
            if (isDataChanged) {
                this._events.emit(EventInboxUpdated);
                // log event
                console.log('InboxDomain event emitted' );
            }
            await sleepYield(); 
            return false;
        } else {
            let dataChanged = false;
            if (this._pendingGroupIdsListUpdate) {
                this._pendingGroupIdsListUpdate = false;
                await this._saveGroupIdsListToLocalStorage();
                dataChanged = true;
            }
            if (this._pendingGroupsUpdateGroupIds.size > 0) {
                const groupIds = Array.from(this._pendingGroupsUpdateGroupIds);
                this._pendingGroupsUpdateGroupIds.clear();
                for (const groupId of groupIds) {
                    this._persistGroupIfInCache(groupId);
                }
                dataChanged = true;
            }
            if (dataChanged) {
                this._events.emit(EventInboxUpdated);
                // log event
                console.log('InboxDomain event emitted', EventInboxUpdated);
            }
            return true;
        }
    }

    onInboxReady(callback: () => void) {
        this._events.on(EventInboxReady, callback);
    }
    offInboxReady(callback: () => void) {
        this._events.off(EventInboxReady, callback);
    }
    onInboxUpdated(callback: () => void) {
        this._events.on(EventInboxUpdated, callback);
    }
    offInboxUpdated(callback: () => void) {
        this._events.off(EventInboxUpdated, callback);
    }
    onInboxLoaded(callback: () => void) {
        this._events.on(EventInboxLoaded, callback);
    }
    offInboxLoaded(callback: () => void) {
        this._events.off(EventInboxLoaded, callback);
    }
    @Inject
    private messageHubDomain: MessageHubDomain;
    
    private _inChannel: Channel<IMessage>;
    async bootstrap() {
        this.threadHandler = new ThreadHandler(this.poll.bind(this), 'InboxDomain', 100);
        this._inChannel = this.messageHubDomain.outChannelToInbox;
        this._groups = new LRUCache<IInboxGroup>(100);
        console.log('InboxDomain bootstraped')
    }

    async switchAddress() {
        await this._loadGroupIdsListFromLocalStorage();
        this._events.emit(EventInboxUpdated);
        clearAll();
        console.log('InboxDomain event emitted', EventInboxLoaded);
    }

    async getInbox() {
        const groupIds = this._groupIdsList;
        const groups: IInboxGroup[] = await Promise.all(groupIds.map((groupId) => this.getGroup(groupId)));
        return groups;
    }

    private _syncGroupState(groupId: string, delay?: number) {
        const fn = () => {
            // get all groups
            const groups = this._groups.values();
            
            return this.groupMemberDomain.syncGroupStateTimestamps(groups);
        }
        const groups = this._groups.values();
        const hasChanges = this.groupMemberDomain.updateGroupStateTimestampsInMemory(groups);
        // log 
        console.log('InboxDomain syncGroupDebounced,groupId', groupId, 'hasChanges', hasChanges, 'groups', groups);
        if (hasChanges) {
            // 1 minute
            this.groupFiService.addLowPriorityTask(
                GROUP_STATE_PERSIST_KEY,
                fn,
                delay
            )
        }
    }

    private _syncGroupDebounced(groupId: string, delay?: number) {
        delay = delay ?? 60;
        const debouncedFn = debounce(
            () => {
                this._syncGroupState(groupId, delay);
            },
            1, // 1 second debounce time
            GROUP_STATE_PERSIST_KEY
        );
        debouncedFn();
    }
}
