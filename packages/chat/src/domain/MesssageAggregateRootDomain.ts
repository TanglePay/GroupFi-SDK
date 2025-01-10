import { Inject, Singleton } from "typescript-ioc";
import { ConversationDomain, HeadKey, MessageFetchDirection } from "./ConversationDomain";
import { InboxDomain } from "./InboxDomain";
import { MessageHubDomain } from "./MessageHubDomain";
import { EventSourceDomain } from "./EventSourceDomain";
import { UserProfileDomain } from "./UserProfileDomain";
import { ProxyModeDomain } from "./ProxyModeDomain";

import { ICycle,  StorageAdaptor, WalletType, ShimmerMode, ImpersonationMode, DelegationMode, ModeInfo } from "../types";
import { LocalStorageRepository } from "../repository/LocalStorageRepository";
import { GroupFiService } from "../service/GroupFiService";
import { EventGroupMemberChanged, GroupFiSDKObj, IMessage, isGroupIdEqual } from "groupfi-sdk-core";
import { EventItemFromFacade } from "groupfi-sdk-core";
import { EventGroupMemberChangedLiteKey, GroupMemberDomain, EventGroupMarkChangedLiteKey, EventForMeGroupConfigChangedKey, EventMarkedGroupConfigChangedKey, EventGroupMuteChangedLiteKey, EventGroupLikeChangedLiteKey, EventGroupMemberChangedKey, EventGroupIsPublicChangedKey } from "./GroupMemberDomain";
import { AquiringPublicKeyEventKey, DelegationModeNameNftChangedEventKey, NotEnoughCashTokenEventKey, OutputSendingDomain, PairXChangedEventKey, PublicKeyChangedEventKey, VoteOrUnVoteGroupLiteEventKey } from "./OutputSendingDomain";

import { Mode, IIncludesAndExcludes, Profile } from '../types'
import { SharedContext } from "./SharedContext";
import { prefixedGroupIdToGroupId } from "groupfi-sdk-core";

import { stripHexPrefix, tracer } from 'groupfi-sdk-utils'


// serving as a facade for all message related domain, also in charge of bootstraping
// after bootstraping, each domain should subscribe to the event, then push event into array for buffering, and 
// triggering a handle function call to drain the array when there isn't any such function call in progress
// subscriber should be notified when state is changed, and should be able to retrieve the new state via function call

export type MessageInitStatus = 'uninit' | 'bootstraped' | 'loadedFromStorageWaitApiCallToCatchUp' | 'catchedUpViaApiCallWaitForPushService' | 'startListeningPushService' | 'inited';

export {HeadKey} from './ConversationDomain'
@Singleton
export class MessageAggregateRootDomain implements ICycle {


    @Inject
    private inboxDomain: InboxDomain;
    @Inject
    private eventSourceDomain: EventSourceDomain;
    @Inject
    private messageHubDomain: MessageHubDomain;
    @Inject
    private conversationDomain: ConversationDomain;
    @Inject
    private groupMemberDomain: GroupMemberDomain;
    @Inject
    private outputSendingDomain: OutputSendingDomain;
    @Inject
    private localStorageRepository: LocalStorageRepository;
    // inject groupfi service
    @Inject
    private groupFiService: GroupFiService;
    @Inject
    private userProfile: UserProfileDomain
    @Inject
    private proxyModeDomain: ProxyModeDomain

    @Inject
    private _context: SharedContext

    private _cycleableDomains: ICycle[]
    setStorageAdaptor(storageAdaptor: StorageAdaptor) {
        this.localStorageRepository.setStorageAdaptor(storageAdaptor);
        this.groupFiService.setupGroupFiSDKFacadeStorage(storageAdaptor)
    }
    async setStorageKeyPrefix(address: string) {
        const addressHash = this.groupFiService.sha256Hash(address);
        const storageKeyPrefix = `groupfi.2.${addressHash}.`;
        this.localStorageRepository.setStorageKeyPrefix(storageKeyPrefix);
    }
    async connectWallet(walletType: WalletType, metaMaskAccountFromDapp: string | undefined): Promise<{
        address: string;
        mode: Mode;
        nodeId: number | undefined;
    }> {
        const res = await this.groupFiService.bootstrap(walletType, metaMaskAccountFromDapp);
        await this.setStorageKeyPrefix(res.address);
        return res
    }
    async browseModeSetupClient() {
        await this.groupFiService.browseModeSetupClient()
    }
    async bootstrap() {
        tracer.startStep('MessageAggregateRootDomain', 'bootstrap')
        this._cycleableDomains = [this.eventSourceDomain, this.outputSendingDomain, this.messageHubDomain, this.inboxDomain, this.conversationDomain, this.groupMemberDomain];
        //this._cycleableDomains = [this.eventSourceDomain, this.messageHubDomain, this.inboxDomain]
        for (const domain of this._cycleableDomains) {
            await domain.bootstrap();
        }
        tracer.endStep('MessageAggregateRootDomain', 'bootstrap')
    }
    _groupMemberChangedCallback: (param:{groupId: string,isNewMember:boolean,address:string}) => void
    async joinGroup(groupId:string) {
        groupId = prefixedGroupIdToGroupId(groupId)
        this.outputSendingDomain.joinGroup(groupId)
        return new Promise((resolve,reject)=>{
            this._groupMemberChangedCallback = ({groupId:groupIdFromEvent,isNewMember,address}:{groupId:string,isNewMember:boolean,address:string}) => {
                // log event key and params
                console.log(EventGroupMemberChangedLiteKey, 'in callback',{groupId:groupIdFromEvent,isNewMember,address}, groupId)

                const fn = () => {
                    if(isGroupIdEqual(groupId, groupIdFromEvent) && isNewMember) {
                        const currentAddress = this.groupFiService.getCurrentAddress()
                        if (this.groupFiService.addHexPrefixIfAbsent(currentAddress) === this.groupFiService.addHexPrefixIfAbsent(address)) {
                            this.groupMemberDomain.off(EventGroupMemberChangedLiteKey,this._groupMemberChangedCallback)
                            this.groupMemberDomain.setAddressStatusInGroup(groupId, 'marked', true)
                            resolve({})
                        }
                    }
                }
                fn()
            }
            this.groupMemberDomain.on(EventGroupMemberChangedLiteKey,this._groupMemberChangedCallback)
        })
    }
    async leaveGroup(groupId: string) {
        groupId = prefixedGroupIdToGroupId(groupId)
        this.outputSendingDomain.leaveGroup(groupId, false)
        return new Promise((resolve, reject) => {
            this._groupMemberChangedCallback = ({groupId: groupIdFromEvent, isNewMember, address}) => {
                const currentAddress = this.groupFiService.getCurrentAddress()
                if(isGroupIdEqual(groupId, groupIdFromEvent) && !isNewMember && address === currentAddress) {
                    this.groupMemberDomain.off(EventGroupMemberChangedLiteKey, this._groupMemberChangedCallback)
                    this.groupMemberDomain.setAddressStatusInGroup(groupId, 'marked', false)
                    resolve({})
                }
            }
            this.groupMemberDomain.on(EventGroupMemberChangedLiteKey, this._groupMemberChangedCallback)
        })
    }
    _groupMarkChangedCallback: (param:{groupId: string,isNewMark:boolean}) => void
    async markGroup(groupId: string) {
        groupId = prefixedGroupIdToGroupId(groupId)
        this.outputSendingDomain.markGroup(groupId)
        return new Promise((resolve, reject) => {
            this._groupMarkChangedCallback = ({groupId: groupIdFromEvent, isNewMark}) => {
                // if (this.groupFiService.addHexPrefixIfAbsent(groupId) === groupIdFromEvent && isNewMark) {
                if (isGroupIdEqual(groupId, groupIdFromEvent) && isNewMark) {
                    this.groupMemberDomain.off(EventGroupMarkChangedLiteKey, this._groupMarkChangedCallback)
                    this.groupMemberDomain.resetAddressStatusLastTimeForGroup(groupId)
                    resolve({})
                }
            }
            this.groupMemberDomain.on(EventGroupMarkChangedLiteKey, this._groupMarkChangedCallback)
        })
    } 
    async unMarkGroup(groupId: string) {
        groupId = prefixedGroupIdToGroupId(groupId)
        this.outputSendingDomain.leaveGroup(groupId, true)
        return new Promise((resolve, reject) => {
            this._groupMarkChangedCallback = ({groupId: groupIdFromEvent, isNewMark}) => {
                // if (this.groupFiService.addHexPrefixIfAbsent(groupId) === groupIdFromEvent && !isNewMark) {
                if (isGroupIdEqual(groupId, groupIdFromEvent) && !isNewMark) {
                    this.groupMemberDomain.off(EventGroupMarkChangedLiteKey, this._groupMarkChangedCallback)
                    this.groupMemberDomain.resetAddressStatusLastTimeForGroup(groupId)
                    resolve({})
                }
            }
            this.groupMemberDomain.on(EventGroupMarkChangedLiteKey, this._groupMarkChangedCallback)
        })
    }
    _voteOrUnVoteGroupChangedCallback: (params: {outputId: string, groupId: string}) => void
    async voteOrUnVoteGroup(groupId: string, vote: number | undefined): Promise<{outputId: string}> {
        groupId = prefixedGroupIdToGroupId(groupId)
        this.outputSendingDomain.voteOrUnvoteGroup(groupId, vote)
        return new Promise((resolve, reject) => {
            this._voteOrUnVoteGroupChangedCallback = ({outputId, groupId: groupIdFromEvent}) => {
                // if (groupIdFromEvent === groupId) {
                if (isGroupIdEqual(groupId, groupIdFromEvent)) {
                    this.outputSendingDomain.off(VoteOrUnVoteGroupLiteEventKey, this._voteOrUnVoteGroupChangedCallback)
                    resolve({
                        outputId
                    })
                }
            }
            this.outputSendingDomain.on(VoteOrUnVoteGroupLiteEventKey, this._voteOrUnVoteGroupChangedCallback)
        })
    }
    _muteOrUnMuteGroupMemberChangedCallback: (params: {groupId: string, isMuted: boolean}) => void
    async muteOrUnmuteGroupMember(groupId: string, address: string, isMuteOperation: boolean) {
        groupId = prefixedGroupIdToGroupId(groupId)
        this.outputSendingDomain.muteOrUnmuteGroupMember(groupId, address, isMuteOperation)
        return new Promise((resolve, reject) => {
            this._muteOrUnMuteGroupMemberChangedCallback = ({groupId: groupIdFromEvent, isMuted}) => {
                // if (groupId === groupIdFromEvent && isMuteOperation === isMuted) {
                if (isGroupIdEqual(groupId, groupIdFromEvent) && isMuteOperation === isMuted) {
                    this.groupMemberDomain.off(EventGroupMuteChangedLiteKey, this._muteOrUnMuteGroupMemberChangedCallback)
                    resolve({})
                }
            }
            this.groupMemberDomain.on(EventGroupMuteChangedLiteKey, this._muteOrUnMuteGroupMemberChangedCallback)
        })
    }
    _likeOrUnLikeGroupMemberChangedCallback: (params: {groupId: string, isLiked: boolean}) => void
    async likeOrUnLikeGroupMember(groupId: string, address: string, isLikeOperation: boolean) {
        groupId = prefixedGroupIdToGroupId(groupId)
        this.outputSendingDomain.likeOrUnLikeGroupMember(groupId, address, isLikeOperation)
        return new Promise((resolve, reject) => {
            this._likeOrUnLikeGroupMemberChangedCallback = ({groupId: groupIdFromEvent, isLiked}) => {
                // if (groupId === groupIdFromEvent && isLikeOperation === isLiked) {
                if (isGroupIdEqual(groupId, groupIdFromEvent) && isLikeOperation === isLiked) {
                    this.groupMemberDomain.off(EventGroupLikeChangedLiteKey, this._likeOrUnLikeGroupMemberChangedCallback)
                    resolve({})
                }
            }
            this.groupMemberDomain.on(EventGroupLikeChangedLiteKey, this._likeOrUnLikeGroupMemberChangedCallback)
        })
    }
    onGroupMemberChangedLite(callback: (param: EventGroupMemberChanged) => void) {    
        this.groupMemberDomain.on(EventGroupMemberChangedLiteKey, callback)
    }
    offGroupMemberChangedLite(callback: (param: EventGroupMemberChanged) => void) { 
        this.groupMemberDomain.off(EventGroupMemberChangedLiteKey,callback)
    }
    onGroupMemberChanged(callback: (params: {groupId: string}) => void) {
        this.groupMemberDomain.on(EventGroupMemberChangedKey, callback)
    }
    offGroupMemberChanged(callback: (params: {groupId: string}) => void) {
        this.groupMemberDomain.off(EventGroupMemberChangedKey, callback)
    }
    async start(): Promise<void> {
        tracer.startStep('MessageAggregateRootDomain', 'start')
        this._cycleableDomains = [this.outputSendingDomain, this.groupMemberDomain, this.inboxDomain, this.conversationDomain, this.messageHubDomain, this.eventSourceDomain]
        for (const domain of this._cycleableDomains) {
            await domain.start();
        }
        tracer.endStep('MessageAggregateRootDomain', 'start')
        tracer.dumpLogs()
    }
    gidEquals(groupId1: string, groupId2: string) {
        return this.groupFiService.addHexPrefixIfAbsent(groupId1) === this.groupFiService.addHexPrefixIfAbsent(groupId2)
    }
    gid(groupId: string) {
        return this.groupFiService.addHexPrefixIfAbsent(groupId)
    }
    // resume all domains
    async resume(): Promise<void> {
        for (const domain of this._cycleableDomains) {
            await domain.resume();
        }
    }
    // pause all domains
    async pause(): Promise<void> {
        const reversedCycleableDomains = [...this._cycleableDomains].reverse()
        for (const domain of reversedCycleableDomains) {
            await domain.pause();
        }
    }
    // stop all domains
    async stop(): Promise<void> {
        const reversedCycleableDomains = [...this._cycleableDomains].reverse()
        for (const domain of reversedCycleableDomains) {
            await domain.stop();
        }
    }
    // destroy all domains
    async destroy(): Promise<void> {
        for (const domain of this._cycleableDomains) {
            await domain.destroy();
        }
    }
    async getInboxList() {
        return await this.inboxDomain.getInbox();
    }

    async getOneBatchUserProfile(addressList: string[]) {
        return await this.userProfile.getOneBatchUserProfile(addressList)
    }

    // getLatestConversationMessageList
    async getLatestConversationMessageList(groupId: string, size = 3): Promise<{
        messages: IMessage[],
    }> {
        groupId = prefixedGroupIdToGroupId(groupId)
        const {messages} = await this.getConversationMessageListFromLatest({groupId,key:HeadKey,size})
        return {
            messages
        }
    }
    async getConversationMessageListFromLatest({groupId,messageId,key,size}:{groupId: string, key: string,messageId?:string, size?: number}): Promise<{
        messages: IMessage[],
        directionMostMessageId?: string,
        chunkKeyForDirectMostMessageId: string
    }> {
        groupId = prefixedGroupIdToGroupId(groupId)
        return await this.getConversationMessageList({groupId,key,messageId, direction:'tail',size})
    }
    async getConversationMessageList({groupId,key,messageId, direction,size}:{groupId: string, key: string, messageId?:string,direction:MessageFetchDirection, size?: number}): Promise<{
        messages: IMessage[],
        directionMostMessageId?: string,
        chunkKeyForDirectMostMessageId: string
    }> {
        groupId = prefixedGroupIdToGroupId(groupId)
        return await this.conversationDomain.getMessageList({groupId,key,messageId,direction,size})
    }
    async setupGroupFiMqttConnection(connect:any) {
        await this.groupFiService.setupGroupFiMqttConnection(connect);
    }
    getIsHasPublicKey() {
        return this.outputSendingDomain.isHasPublicKey
    }
    async sendMessageToGroup(
        groupId: string,
        message: string
      ): Promise<{ messageSent: IMessage, blockId: string }>
      {
          groupId = prefixedGroupIdToGroupId(groupId)
          return await this.outputSendingDomain.sendMessageToGroup(groupId,message)
      }
    onIsHasPublicKeyChanged(callback: (param:{isHasPublicKey: boolean}) => void) {
        this.outputSendingDomain.on(PublicKeyChangedEventKey,callback)
    }

    onIsHasPublicKeyChangedOnce(callback: (param:{isHasPublicKey: boolean}) => void) {
        this.outputSendingDomain.once(PublicKeyChangedEventKey,callback)
        return () => this.outputSendingDomain.off(PublicKeyChangedEventKey, callback)
    }
    offIsHasPublicKeyChanged(callback: (param:{isHasPublicKey: boolean}) => void) {
        this.outputSendingDomain.off(PublicKeyChangedEventKey,callback)
    }
    onNotEnoughCashToken(callback: () => void) {
        this.outputSendingDomain.on(NotEnoughCashTokenEventKey,callback)
    }
    offNotEnoughCashToken(callback: () => void) {
        this.outputSendingDomain.off(NotEnoughCashTokenEventKey,callback)
    }
    onAquiringPublicKeyOnce(callback: () => void) {
        this.outputSendingDomain.once(AquiringPublicKeyEventKey,callback)
        return () => this.outputSendingDomain.off(AquiringPublicKeyEventKey, callback)
    }
    offAquiringPublicKey(callback: () => void) {
        this.outputSendingDomain.off(AquiringPublicKeyEventKey,callback)
    }
    onInboxReady(callback: () => void) {
        this.inboxDomain.onInboxReady(callback);
    }
    offInboxReady(callback: () => void) {
        this.inboxDomain.offInboxReady(callback);
    }
    onInboxDataChanged(callback: () => void) {
        this.inboxDomain.onInboxUpdated(callback);
    }
    offInboxDataChanged(callback: () => void) {
        this.inboxDomain.offInboxUpdated(callback);
    }
    onInboxLoaded(callback: () => void) {
        this.inboxDomain.onInboxLoaded(callback);
    }
    offInboxLoaded(callback: () => void) {
        this.inboxDomain.offInboxLoaded(callback);
    }
    onConversationDataChanged(groupId: string, callback: () => void) {
        groupId = prefixedGroupIdToGroupId(groupId)
        this.conversationDomain.onGroupDataUpdated(groupId, callback);
    }
    offConversationDataChanged(groupId: string, callback: () => void) {
        groupId = prefixedGroupIdToGroupId(groupId)
        this.conversationDomain.offGroupDataUpdated(groupId, callback);
    }
    getInbox() {
        return this.inboxDomain.getInbox();
    }
    async clearUnreadCount(groupId: string) {
        groupId = prefixedGroupIdToGroupId(groupId)
        groupId = stripHexPrefix(groupId)
        this.inboxDomain.clearUnreadCount(groupId)
    }
    async setUnreadCount(groupId: string, unreadCount: number, lastTimeReadLatestMessageTimestamp: number) {
        groupId = prefixedGroupIdToGroupId(groupId)
        groupId = groupId = stripHexPrefix(groupId)
        this.inboxDomain.setUnreadCount(groupId, unreadCount, lastTimeReadLatestMessageTimestamp)
    }
    async enteringGroupByGroupId(groupId: string) {
        groupId = prefixedGroupIdToGroupId(groupId)
        const isEvm = this.proxyModeDomain.getMode() !== ShimmerMode
        const tasks = [ 
            this.groupMemberDomain._refreshGroupMemberAsync(groupId),
            this.groupMemberDomain._refreshGroupPublicAsync(groupId),
        ]
        if (isEvm) {
            tasks.push(this.groupMemberDomain._refreshGroupEvmQualifyAsync(groupId))
        }
        await Promise.all(tasks);
        this.conversationDomain.setCurrentGroupIdOnUi(groupId)
        this.outputSendingDomain.enterGroup(groupId)
        if (this._context.isWalletConnected) {
            this.groupFiService.enablePreparedRemainderHint()
        }
    }
   
    // async handleGroupScrollToDirectionEnd({groupId, direction} : {groupId: string, direction: MessageFetchDirection}) {
    async handleConversationGroupScrollToDirectionEnd({groupId, direction} : {groupId: string, direction: MessageFetchDirection}) {
        // await this.conversationDomain.handleGroupScrollToDirectionEnd({groupId, direction})
    }
    // navigate away from group
    navigateAwayFromGroup(groupId: string) {
        groupId = prefixedGroupIdToGroupId(groupId)
        this.conversationDomain.setCurrentGroupIdOnUi(undefined)
        // check is wallet connected
        if (this._context.isWalletConnected) {
            this.groupFiService.disablePreparedRemainderHint()
        }
    }
        
    getGroupFiService() {
        return this.groupFiService
    }

    // Check cash token
    getIsHasEnoughCashToken() {
        return this.outputSendingDomain.isHasEnoughCashToken
    }

    // get for me group Configs
    getForMeGroupConfigs() {
        // When forMeGroupConfigs is undefined, it must return undefined
        // This indicates that forMeGroupConfigs has not started loading yet
        if (this.groupMemberDomain.forMeGroupConfigs === undefined) {
            return undefined
        }
        const forMeGroupConfigs = this.groupMemberDomain.forMeGroupConfigs??[]
        const forMeGroupConfigsProcessed = forMeGroupConfigs.map(GroupFiSDKObj.processGroupConfigBeforeReturn)      
        console.log('getForMeGroupConfigs before processed', forMeGroupConfigs, 'after processed', forMeGroupConfigsProcessed)  
        return forMeGroupConfigsProcessed
    }
    
    onRegisterStatusChanged(callback: () => void) {
        this._context.onRegisterStatusChanged(callback)
    }
    offRegisterStatusChanged(callback: () => void) {
        this._context.offRegisterStatusChanged(callback)
    }

    // isWalletConnected
    isWalletConnected() {
        return this._context.isWalletConnected
    }
    onWalletConnectedChanged(callback: () => void) {
        this._context.onWalletConnectedChanged(callback)
    }
    offWalletConnectedChanged(callback: () => void) {
        this._context.offWalletConnectedChanged(callback)
    }
    // onForMeGroupConfigsChanged
    onForMeGroupConfigsChanged(callback: () => void) {
        this.groupMemberDomain.on(EventForMeGroupConfigChangedKey, callback)
    }
    offForMeGroupConfigsChanged(callback: () => void) {
        this.groupMemberDomain.off(EventForMeGroupConfigChangedKey, callback)
    }
    // onMarkedGroupConfigsChanged
    onMarkedGroupConfigsChanged(callback: () => void) {
        this.groupMemberDomain.on(EventMarkedGroupConfigChangedKey, callback)
    }
    offMarkedGroupConfigsChanged(callback: () => void) {
        this.groupMemberDomain.off(EventMarkedGroupConfigChangedKey, callback)
    }
    // get marked group Configs
    getMarkedGroupConfigs() {
        if (this.groupMemberDomain.markedGroupConfigs === undefined) {
            return undefined
        }
        return this.groupMemberDomain.markedGroupConfigs.map(GroupFiSDKObj.processGroupConfigBeforeReturn)
    }
    getIsHasPairX() {
        return this.outputSendingDomain.isHasPairX
    }

    getIsHasDelegationModeNameNft() {
        return this.outputSendingDomain.isHasDelegationModeNameNft
    }

    onIsHasPairXChanged(callback: () => void) { 
        this.outputSendingDomain.on(PairXChangedEventKey, callback)
        return () => this.outputSendingDomain.off(PairXChangedEventKey, callback)
    }

    onIsHasDelegationModeNameNftChanged(callback: () => void) {
        this.outputSendingDomain.on(DelegationModeNameNftChangedEventKey, callback)
        return () => this.outputSendingDomain.off(DelegationModeNameNftChangedEventKey, callback)
    }

    onHasEnoughCashTokenOnce(callback: () => void) {
        return this.outputSendingDomain.onHasEnoughCashTokenOnce(callback)
    }

    onNotHasEnoughCashTokenOnce(callback: () => void) {
        return this.outputSendingDomain.onNotHasEnoughCashTokenOnce(callback)   
    }

    onSentMessage(message:EventItemFromFacade) {
        this.eventSourceDomain._onNewEventItem(message);
    }
    listenningTPAccountChanged(callback: (params: {address: string, mode: Mode, nodeId: number}) => void) {
        return this.groupFiService.listenningTPAccountChanged(({address, mode, nodeId, isAddressChanged}) => {
            // if (isAddressChanged) {
            //     this._switchAddress(address)
            // }
            callback({address, mode, nodeId})
        })
    }
    async onMetaMaskAccountChanged(account: string) {
        await this.groupFiService.onMetaMaskAccountChange(account)
        // this._switchAddress(account)
    }

    onLoginStatusChanged(callback: () => void) {
        this._context.onLoginStatusChanged(callback)
    }
    offLoginStatusChanged(callback: () => void) {
        this._context.offLoginStatusChanged(callback)
    }
    isRegistered() {
        return this._context.isRegistered
    }
    isLoggedIn() {
        return this._context.isLoggedIn
    }
    isEncryptionPublicKeySet() {
        return this._context.isEncryptionPublicKeySet
    }
    isSignatureSet() {
        return this._context.isSignatureSet
    }
    registerPairX() {
        this.outputSendingDomain.registerPairX()
    }
    login() {
        this.outputSendingDomain.login()
    }
    onNameChanged(callback: () => void) {
        this._context.onNameChanged(callback)
    }
    offNameChanged(callback: () => void) {
        this._context.offNameChanged(callback)
    }

    setDappIncluding({includes, announcement}: {includes?: IIncludesAndExcludes[], announcement?: IIncludesAndExcludes[]}) {
        this.listenGroups(includes)
        this.setAnnouncement(announcement)
        // if (includes) {
        //     const isChanged = this._context.setIncludesAndExcludes(includes,'MessageAggregateRootDomain setDappInlcuding', 'from dapp')
        //     if (isChanged) {
        //         this._context.setIsForMeGroupsLoading(true, 'MessageAggregateRootDomain setDappInlcuding', 'includes changed')
        //     }
        // }
        // if (announcement) {
        //     this._context.setAnnouncement(announcement)
        // }
    }

    listenGroups(includes?: IIncludesAndExcludes[]) {
        if (includes) {
            const isChanged = this._context.setIncludesAndExcludes(includes, 'MessageAggregateRootDomain', 'listenGroups')
            if (isChanged) {
                this._context.setIsForMeGroupsLoading(true, 'MessageAggregateRootDomain', 'listenGroups changed')
            }
        }
    }

    // Add additional includes
    listenGroupsAdd(includes?: IIncludesAndExcludes[]) {
        if (includes) {
            const isChanged = this._context.addIncludesAndExcludes(includes, 'MessageAggregateRootDomain', 'listenGroupsAdd')
            // If the includes setting has changed compared to the last time, set IsForMeGroupsLoading to true.
            if (isChanged) {
                this._context.setIsForMeGroupsLoading(true, 'MessageAggregateRootDomain', 'listenGroupsAdd changed')
            }
        }
    }

    setAnnouncement(announcement?: IIncludesAndExcludes[]) {
        if (announcement) {
            this._context.setAnnouncement(announcement)
        }
    }

    setUserBrowseMode(isBrowseMode: boolean) {
        this._context.setUserBrowseMode(isBrowseMode, 'MessageAggregateRootDomain setUserBrowseMode', 'from dapp')
    }
    isUserBrowseMode(): boolean {
        return this._context.userBrowseMode
    }
    // isWaitForLogin
    isWaitForLogin() {
        return this._context.isWaitForLogin
    }

    onWalletAddressChanged(callback: () => void) {
        this._context.onWalletAddressChanged(callback)
    }
    offWalletAddressChanged(callback: () => void) {
        this._context.offWalletAddressChanged(callback)
    }
    setWalletAddress(walletAddress: string, why: string) {
        this._context.setWalletAddress(walletAddress, 'MessageAggregateRootDomain setWalletAddress', why)
    }
    getIsPairXSet() {
        return this._context.isPairXSet
    }
    onPairXChanged(callback: () => void) {
        this._context.onPairXChanged(callback)
    }
    offPairXChanged(callback: () => void) {
        this._context.offPairXChanged(callback)
    }
    isForMeGroupsLoading() {
        return this._context.isForMeGroupsLoading
    }
    onIsForMeGroupsLoadingChanged(callback: () => void) {
        this._context.onIsForMeGroupsLoadingChanged(callback)
    }
    offIsForMeGroupsLoadingChanged(callback: () => void) {
        this._context.offIsForMeGroupsLoadingChanged(callback)
    }
    getAnnouncement() {
        return this._context.announcement
    }
    getFieldValue<T>(fieldName: string) {
        return this._context._getProperty<T>(fieldName)
    }
    onFieldChanged(fieldName: string, callback: () => void) {
        this._context.onPropertyChanged(fieldName, callback)
    }
    offFieldChanged(fieldName: string, callback: () => void) {
        this._context.offPropertyChanged(fieldName, callback)
    }
    isAnnouncementGroup(groupId: string) {
        groupId = prefixedGroupIdToGroupId(groupId)
        return this.groupMemberDomain.isAnnouncementGroup(groupId)
    }
    getProfileList() {
        return this.outputSendingDomain.getProfileList()
    }
    setProfile(profile: Profile, shouldMint: boolean) {
        this.outputSendingDomain.setProfile(profile, shouldMint)
    }
    getSelfProfile() {
        return this._context.getProfile()
    }

    async getGroupMember(groupId: string) {
        groupId = prefixedGroupIdToGroupId(groupId)
        return await this.groupMemberDomain.getGroupMember(groupId)
    }

    async isGroupPublic(groupId: string) {
        groupId = prefixedGroupIdToGroupId(groupId)
        return await this.groupMemberDomain.isGroupPublic(groupId)
    }

    onGroupIsPublicChanged(callback:() => void) {
        this.groupMemberDomain.on(EventGroupIsPublicChangedKey, callback)
    }

    offGroupIsPublicChanged(callback:() => void) {
        this.groupMemberDomain.off(EventGroupIsPublicChangedKey, callback)
    }

    getAddressStatusInGroup(groupId: string): {
        muted: boolean;
        isQualified: boolean;
        marked: boolean;
    } | undefined {
        groupId = prefixedGroupIdToGroupId(groupId)
        return this.groupMemberDomain.getAddressStatusInGroup(groupId);
    }

    // Updated to use getAddressStatusChangedEventKey for specific group
    onAddressStatusInGroupChangedOnce(groupId: string, callback: () => void) {
        groupId = prefixedGroupIdToGroupId(groupId)
        const eventKey = this.groupMemberDomain.getAddressStatusChangedEventKey(groupId)
        this.groupMemberDomain.removeAllListeners(eventKey)
        return this.groupMemberDomain.once(eventKey, callback)
    }

    setAddressStatusInGroup(groupId: string, type: 'muted' | 'isQualified' | 'marked', newValue: boolean) {
        groupId = prefixedGroupIdToGroupId(groupId)
        return this.groupMemberDomain.setAddressStatusInGroup(groupId, type, newValue);
    }


}