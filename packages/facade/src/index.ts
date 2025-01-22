import IotaSDK from 'tanglepaysdk-client';
import {
  GroupFiSDKObj,
  ShimmerBech32Addr,
  Address,
  IMessage,
  IMMessage,
  IGroupUserReputation,
  IMUserMuteGroupMember,
  PushedNewMessage,
  PushedValue,
  EventItemFromFacade,
  ImInboxEventTypeNewMessage,
  ImInboxEventTypeGroupMemberChanged,
  InboxItemResponse,
  ImInboxEventTypeMarkChanged,
  IIncludesAndExcludes,
  ImInboxEventTypeMuteChanged,
  ImInboxEventTypeLikeChanged,
  isUniversalProfileAddress,
  getEvmOrSolanaAddressType,
  ImInboxEventTypeProfileChangedEvent,
  ImInboxEventTypeGroupIsPublicChanged,
  GroupConfigPlus,
  NodeManager,
  prefixedGroupIdToGroupId,
  PublicMessageBatchResponse,
  isGroupIdEqual,
  GroupStateSyncItem,
  BasicOutputWrapper,
  ImInboxEventTypeGroupStateSync,
  StorageFacade,
  GroupConfig
}   from 'groupfi-sdk-core';
import GroupfiWalletEmbedded from 'groupfi-walletembed';

import {
  SimpleDataExtended,
  objectId,
  generateSMRPair,
  bytesToHex,
  getCurrentEpochInSeconds,
  tracer,
} from 'groupfi-sdk-utils';
import {
  GroupfiSdkClient,
  IProxyModeRequestAdapter,
  AddressMappingStore,
  nameMappingCache,
  GroupStateSyncStorageExtended
} from 'groupfi-sdk-client';
import { Web3 } from 'web3';
import smrPurchaseAbi from './contractAbi/smr-purchase';
import { utf8ToHex } from 'groupfi-sdk-utils';

import {
  WalletType,
  TransactionRes,
  Mode,
  ShimmerMode,
  ImpersonationMode,
  TanglePayWallet,
  MetaMaskWallet,
  DelegationMode,
  ModeInfo,
  PairX,
  Profile
} from './types';

import {
  ShimmerModeRequestAdapter,
  ImpersonationModeRequestAdapter,
  DelegationModeRequestAdapter,
} from './client/clientMode';
import auxiliaryService from './auxiliaryService';
import { AuxiliaryService, config, ChainList, ChainInfo } from './auxiliaryService';
import { IBasicOutput } from '@iota/iota.js';

interface TaskOutputs {
  created: IBasicOutput[];
  consumed: BasicOutputWrapper[];
}

interface LowPriorityTask {
  task: () => TaskOutputs;
  expireTime: number;
}

export { SimpleDataExtended };
export * from './types';

const TP_SHIMMER_MAINNET_ID = 102;

// Prefix text displayed to the user during the pairx signing process.
const PAIRX_SIGN_PREFIX_TEXT = 'Creating account... '

// Add this constant near the top of the file
const CHAIN_LIST_STORAGE_KEY = 'groupfi_chain_list';

class GroupFiSDKFacade {
  private _address: string | undefined;
  private _proxyAddress: string | undefined;
  private _nodeId: number | undefined;
  private _mode: Mode | undefined;
  private _pairX: PairX | undefined;

  private _mqttConnected: boolean = false;

  private _lastTimeSdkRequestResultSent: number = 0;
  private _lastTimeSdkRequestResultReceived: number = 0;

  // Instance of the AuxiliaryService class
  private _auxiliaryService = new AuxiliaryService();

  // A storage solution like browser localStorage or other custom storage mechanisms.
  private _storage: StorageFacade | null = null

  private _lowPriorityTasks: Map<string, LowPriorityTask> = new Map();

  // Add this near the top of the file with other private fields
  private _initializationPromise: Promise<void> | null = null;

  // Returns the current mode if it is defined.
  get currentMode() {
    if (this._mode === undefined) {
      throw new Error('Mode is undefined.');
    }
    return this._mode;
  }

  
  // Generates a unique identifier for an object.
  // - This method uses the `objectId` function to compute a deterministic hash for the given object.
  // - The resulting identifier ensures consistency across objects with the same key-value pairs,
  //   regardless of their order in the input.
  getObjectId(obj: Record<string, SimpleDataExtended>) {
    return objectId(obj);
  }

  // Cache for storing information about which users are muted by a specific user, organized by group.
  private _muteMap:
    | {
        [groupId: string]: string[];
      }
    | undefined = undefined;

  // A promise that resolves to the mute map.
  // - This is used for lazy initialization or when fetching the mute information asynchronously.
  // - If the data is not yet available in `_muteMap`, this promise ensures it can be retrieved.
  private _muteMapPromise: Promise<{
    [groupId: string]: string[];
  }> | null = null

  // Updates the _muteMap for a specific group and user.
  async _updateMuteMap(groupId: string, addressHash: string) {
    // Ensure `_muteMap` is initialized.
    await this._ensureMuteMap()
    // Retrieve the list of muted members for the specified group.
    const groupMutedMembers = this._muteMap![groupId];
    // If no mute list exists for the group, create a new one with the given `addressHash`.
    if (groupMutedMembers === undefined) {
      this._muteMap![groupId] = [addressHash];
      return;
    }
    // If the user is already muted, remove them from the mute list.
    if (groupMutedMembers.includes(addressHash)) {
      this._muteMap![groupId] = groupMutedMembers.filter(
        (member) => member !== addressHash
      );
    } else { // Otherwise, add the user to the mute list.
      this._muteMap![groupId].push(addressHash);
    }
  }

  // Retrieves and constructs the mute map asynchronously.
  async _getMuteMapPromise() {
    return this.getAllUserMuteGroupMembers().then(allUserMuteGroupMembers => allUserMuteGroupMembers.reduce(
      (acc: { [groupId: string]: string[] }, { groupId, addrSha256Hash }) => {
        acc[groupId] = [...(acc[groupId] ?? []), addrSha256Hash];
        return acc;
      },
      {}
    ))
  }

  // Ensures that the `_muteMap` is initialized and ready for use.
  async _ensureMuteMap() {
    if (this._muteMap !== undefined) {
      return
    }
    if (this._muteMapPromise === null) {
      this._muteMapPromise = this._getMuteMapPromise()
    }
    this._muteMap = await this._muteMapPromise
    this._muteMapPromise = null
  }

  // Checks if a specific user is muted in a given group based on the mute map.
  async getIsMutedFromMuteMap(groupId: string, address: string) {
    groupId = prefixedGroupIdToGroupId(groupId);
    await this._ensureMuteMap()
    const addressHash = GroupFiSDKObj._addHexPrefixIfAbsent(
      GroupFiSDKObj._sha256Hash(address)
    );
    const mutedAddressHash = this._muteMap![groupId] ?? [];
    return mutedAddressHash.includes(addressHash);
  }

  // Fetches all group members liked by the current user, organized by group.
  async getAllUserLikeGroupMembers() {
    this._ensureWalletConnected();
    return await this._client!.getAllUserLikeGroupMembers(this._address!)
  }

  // Determines if a message from a specific sender in a group should be filtered (muted).
  async filterMutedMessage(groupId: string, sender: string) {
    return await this.getIsMutedFromMuteMap(groupId, sender);
  }

  async handlePushedMessage(
    pushed: PushedNewMessage
  ): Promise<IMessage | undefined> {
    const { type, groupId } = pushed;

    if (type === ImInboxEventTypeNewMessage) {
      const { sender, meta } = pushed;

      // call client getMessageFromMetafeaturepayloadAndSender({ address: addr, data: pushed.meta, senderAddressBytes: pushed.sender })
      const res =
        (await this._client!.getMessageFromMetafeaturepayloadAndSender({
          address: this._address!,
          data: meta,
          senderAddressBytes: sender,
        })) as
          | { messageId: string; message: IMMessage; sender: string }
          | undefined;
      this._lastTimeSdkRequestResultReceived = Date.now();
      if (res === undefined) {
        return undefined;
      }
      const resUnwrapped = res as {
        messageId: string;
        message: IMMessage;
        sender: string;
      };
      const message: IMessage = this._client!.convertIMMessageToIMessage({
        imMessage: resUnwrapped.message,
        messageId: resUnwrapped.messageId,
        sender: resUnwrapped.sender,
        // Mqtt lacks a milestoneTimestamp; use the receiver's timestamp instead.
        milestoneTimestamp: getCurrentEpochInSeconds()
      })
      // const message: IMessage = {
      //   type: ImInboxEventTypeNewMessage,
      //   messageId: resUnwrapped.messageId,
      //   groupId: resUnwrapped.message.groupId,
      //   sender: resUnwrapped.sender,
      //   message: resUnwrapped.message.data,
      //   timestamp: resUnwrapped.message.timestamp,
      //   name: undefined
      // };

      if (this._mode !== ShimmerMode) {
        const evmAddress = await AddressMappingStore.getEvmAddress(
          message.sender
        );
        message.sender = evmAddress;
      }

      const profile = await this.getProfileFromNameMappingCache(message.sender)
      if (profile?.name) {
        message.name = profile.name
      }
      if (profile?.avatar) {
        message.avatar = profile.avatar
      }

      console.log('*****Enter handlePushedMessage filter');
      const filtered = await this.filterMutedMessage(groupId, message.sender);
      console.log(
        '*****handlePushedMessage filter end',
        filtered,
        groupId,
        message.sender
      );
      if (filtered) {
        console.log('pushed message filtered', groupId, message);
        return undefined;
      }

      return message;
    } else {
      throw new Error('unknown message type: ' + type);
    }

    return undefined;
  }

  // Retrieves a user's profile from the name mapping cache based on their address.
  async getProfileFromNameMappingCache(address: string): Promise<{name: string, avatar?: string}|null> {
    try {
      const profileRes = await nameMappingCache.getRes(address)
      return profileRes
    }catch(error) {
      return null
    }
  }

  // Batch retrieve profile information for multiple addresses from the name mapping cache.
  async batchGetProfileFromNameMappingCache(addressList: string[]) {
    try {
      return await nameMappingCache.batchGetRes(addressList)
    } catch(error) {
      throw error
    }
  }

  // Listens for new event items pushed from the MQTT and triggers a callback when an event is received
  listenningNewEventItem(
    callback: (message: EventItemFromFacade) => void
  ): () => void {
    const listener = async (pushed: PushedValue) => {
      console.log('pushed', pushed);
      let item: EventItemFromFacade | undefined = undefined;
      if (pushed.type == ImInboxEventTypeNewMessage) {
        item = await this.handlePushedMessage(pushed);
      } else if (pushed.type == ImInboxEventTypeGroupMemberChanged) {
        item = pushed;
      } else if (pushed.type === ImInboxEventTypeMarkChanged) {
        item = pushed;
      } else if (pushed.type === ImInboxEventTypeMuteChanged) {
        item = pushed
      } else if (pushed.type === ImInboxEventTypeLikeChanged) {
        item = pushed
      } else if (pushed.type === ImInboxEventTypeProfileChangedEvent) {
        item = pushed
      } else if (pushed.type === ImInboxEventTypeGroupIsPublicChanged) {
        item = pushed
      } else if (pushed.type === ImInboxEventTypeGroupStateSync) {
        item = pushed
      }
      if (item) {
        callback(item);
      }
    };
    GroupFiSDKObj.on('inbox', listener);
    return () => GroupFiSDKObj.off('inbox', listener);
  }

  // Set up the MQTT connection
  async setupMqttConnection(connect: any) {
    if (!connect) return
    GroupFiSDKObj.setupMqttConnection(connect);
    this._mqttConnected = true;
  }

  async onMetaMaskAccountChanged(account: string) {
    const res = this.connectMetaMaskAccount(account);
    await this._onAccountChanged({
      ...res,
      nodeId: undefined,
      isAddressChanged: true,
    });
  }

  listenningTPAccountChanged(
    callback: (params: {
      address: string;
      nodeId: number;
      mode: Mode;
      isAddressChanged: boolean;
    }) => void
  ) {
    const listener = async (accountChangeEvent: {
      address: string;
      nodeId: number;
    }) => {
      // Uniformly convert EVM addresses to lowercase
      accountChangeEvent.address = accountChangeEvent.address.toLowerCase();
      const { address, nodeId } = accountChangeEvent;

      const newMode = this.getTPMode(nodeId);

      // 第一次连接钱包，也会触发这个函数, 这样避免第一次连接时触发
      if (
        this._address === address &&
        this._mode === newMode &&
        this._nodeId === nodeId
      ) {
        return;
      }

      if (this._address !== address) {
        // TP 的问题：每次切换新地址之后，都需要重新执行一下 connectWallet request，不然会报错，not authorized
        await IotaSDK.request({
          method: 'iota_connect',
          params: {
            // expires: 3000000
          },
        });
      }

      const res = {
        address,
        nodeId,
        mode: newMode,
        isAddressChanged: this._address !== address,
      };

      this._address = address;
      this._nodeId = nodeId;
      this._mode = newMode;

      await this._onAccountChanged(res);
      callback(res);
    };
    IotaSDK.on('accountsChanged', listener);
    return () => IotaSDK.removeListener('accountsChanged', listener);
  }

  // Handle account change events and update the state accordingly.
  async _onAccountChanged({
    mode,
    isAddressChanged,
  }: {
    address: string;
    nodeId?: number;
    mode: Mode;
    isAddressChanged: boolean;
  }) {
    // Switch the client adapter based on the new mode
    this.switchClientAdapter(mode);
    // If the address has changed, reinitialize the address-related configurations.
    if (isAddressChanged) {
      await this.initialAddress();
    }
  }

  // Fetch a list of inbox messages based on the continuation token.
  async fetchMessageOutputList(
    continuationToken?: string,
    limit = 3
  ): Promise<InboxItemResponse> {
    return (await GroupFiSDKObj.fetchMessageOutputList(
      this._address!,
      continuationToken,
      limit
    )) as InboxItemResponse;
  }

  // prepareRemainderHint
  async prepareRemainderHint() {
    this._ensureWalletConnected();
    const res = await this._client!.prepareRemainderHint();
    return res;
  }
  // consolidateIfNeeded
  async consolidateIfNeeded() {
    this._ensureWalletConnected();
    const res = await this._client!.consolidateIfNeeded()
    return res;
  }
  // async cashInit(){
  async cashInit() {
    this._ensureWalletConnected();
    const res = await this._client!.cashInit();
    return res;
  }
  // enablePreparedRemainderHint
  enablePreparedRemainderHint() {
    this._ensureWalletConnected();
    const res = this._client!.enablePrepareRemainderHint();
    return res;
  }
  // disablePreparedRemainderHint
  disablePreparedRemainderHint() {
    this._ensureWalletConnected();
    const res = this._client!.disablePrepareRemainderHint();
    return res;
  }
  async preloadGroupSaltCache({
    groupId,
    memberList,
  }: {
    groupId: string;
    memberList?: { addr: string; publicKey: string }[];
  }) {
    this._ensureWalletConnected();
    const res = await this._client!.preloadGroupSaltCache({
      senderAddr: this._address!,
      groupId,
      memberList,
    });
    return res;
  }
  
  getTpNodeInfo(nodeId: number) {
    return config.find(({ tpNodeId }) => tpNodeId === nodeId);
  }

  async fetchSMRPrice(nodeId: number) {
    const conf = config.find((c) => c.tpNodeId === nodeId);
    if (!conf) {
      return undefined;
    }
    const res = await this._auxiliaryService.fetchSMRPrice(conf.chainId);
    return res;
  }

  async buySMR(params: {
    targetAmount: string;
    principalAmount: string;
    nodeId: number;
    contract: string;
    web3: Web3;
  }) {
    const {
      web3,
      principalAmount,
      targetAmount,
      contract: contractAddress,
    } = params;
    const proxyAddress = await this.getSMRProxyAccount();
    if (proxyAddress === undefined) {
      throw new Error('proxy account is undefined.');
    }

    const contract = new web3.eth.Contract(smrPurchaseAbi, params.contract);

    const transaction = contract.methods.buySmr(
      proxyAddress.hexAddress,
      targetAmount
    );

    const options = {
      from: this._address,
      to: contractAddress,
      data: transaction.encodeABI(),
      value: principalAmount,
    };

    await IotaSDK.request({
      method: 'eth_sendTransaction',
      params: options,
    });
  }

  async mintProxyNicknameNft(name: string) {
    this._ensureWalletConnected();
    if (this._pairX === undefined) {
      throw new Error('PairX is undefined');
    }
    const adapter =
      this._client!.getRequestAdapter() as DelegationModeRequestAdapter;
    return await adapter.mintProxyNicknameNft({
      pairX: this._pairX,
      name,
    });
  }

  async mintNicknameNFT(name: string): Promise<{
    result: boolean;
    blockId?: string;
    errCode?: number;
    reason?: string;
  }> {
    this._ensureWalletConnected();
    const addr = this._proxyAddress ?? this._address!;
    return await this._auxiliaryService.mintNicknameNFT(addr, name);
  }

  async fetchAddressNames(addressList: string[]) {
    return await GroupFiSDKObj.fetchAddressNames(addressList);
  }

  async hasUnclaimedNameNFT() {
    return await this._client!.hasUnclaimedNameNFT(this._proxyAddress!);
  }

  async enteringGroupByGroupId(groupId: string) {}
  async sendMessage(
    groupId: string,
    messageText: string,
    isAnnouncement:boolean,
    isGroupPublic:boolean,
    memberList?: { addr: string; publicKey: string }[]
  ) {
    this._ensureWalletConnected();
    this.tryHandleOneLowPriorityTask();
    tracer.startStep('sendMessageToGroup','facade sendMessage');
    const address: Address = {
      type: ShimmerBech32Addr,
      addr: this._address!,
    };
    const message = await GroupFiSDKObj.prepareSendMessage(
      address,
      groupId,
      messageText,
      isAnnouncement
    );
    if (!message) throw new Error('prepareSendMessage error');
    // call client sendMessage(addr, groupId, message)
    tracer.startStep('sendMessageToGroup','call client sendMessage');
    const res = await this._client!.sendMessage(
      this._address!,
      groupId,
      isGroupPublic,
      message!,
      memberList
    );
    tracer.endStep('sendMessageToGroup','call client sendMessage');
    return res;
  }
  // call getAllGroupStateSyncs
  async getAllGroupStateSyncs(): Promise<GroupStateSyncStorageExtended | undefined> {
    await this.waitForInitialization()
    return await this._client!.getAllGroupStateSyncs(this._address!);
  }
  // call persistGroupStateSyncs
  persistGroupStateSyncs(
    groupStateSyncs: GroupStateSyncItem[],
    consumedOutputWrapper?: BasicOutputWrapper
  ): {
    created: IBasicOutput[];
    consumed: BasicOutputWrapper[];
  } {
    return this._client!.persistGroupStateSyncs(groupStateSyncs, consumedOutputWrapper);
  }
  // async batchOutputIdToOutput(outputIds:string[]){
  async batchOutputIdToOutput(outputIds: string[]) {
    await this.waitForInitialization()
    const res = await this._client!.batchOutputIdToOutput(outputIds);
    return res;
  }
  // async batchConvertOutputIdsToMessages(outputIds: string[], address: string): Promise<{ messages: IMessage[], missedMessageOutputIds: string[] }> {
  async batchConvertOutputIdsToMessages(outputIds: string[],onMessageCompleted: (msg: IMessage, outputId: string) => Promise<void>) {
    const res = await this._client!.batchConvertOutputIdsToMessages(
      outputIds,
      this._address!,
      onMessageCompleted
    );
    return res;
  }
  async fetchAddressBalance() {
    this._ensureWalletConnected();
    const addr = this._proxyAddress ?? this._address!;
    const balance = await GroupFiSDKObj.fetchAddressBalance(addr);
    return balance ?? 0;
  }
  
  _ensureWalletConnected() {
    if (!this._address) {
      throw new Error('Wallet not connected.');
    }
  }

  _ensureProxyAddressExisted() {
    if (!this._proxyAddress) {
      throw new Error('Proxy address is undefined.');
    }
  }

  _ensureMqttConnected() {
    if (!this._mqttConnected) {
      throw new Error('MQTT not connected');
    }
  }

  _isEvm() {
    return this._mode !== ShimmerMode;
  }

  async filterEvmGroups(groupId: string): Promise<boolean> {
    const isGroupPublic = await this.isGroupPublic(groupId);
    if (isGroupPublic) {
      return true;
    }
    const isQualified = await this._isEvmQualified(groupId);
    if (isQualified) {
      return true;
    }
    return false;
  }

  // batchFetchGroupIsPublic
  async batchFetchGroupIsPublic(groupIds: string[]): Promise<{ [key: string]: boolean }> {
    const res = await GroupFiSDKObj.batchFetchGroupIsPublic(groupIds);
    return res;
  }
  // upload image to s3    
  async uploadImageToS3({fileGetter, fileObj}: {fileGetter?: () => Promise<File>, fileObj?: File}): Promise<{ imageURL: string, dimensionsPromise: Promise<{ width: number; height: number }>, uploadPromise: Promise<void> }> {
    return await this._client!.uploadImageToS3({fileGetter, pairX: this._pairX!, 
      fileObj});
  }
  
  // fetchForMeGroupConfigsWithoutProcessGroupConfigBeforeReturn
  async fetchForMeGroupConfigsWithoutProcessGroupConfigBeforeReturn({includes}: {includes?: IIncludesAndExcludes[]}): Promise<Array<GroupConfigPlus & {isMember?: boolean}>> {
    await this.waitForInitialization()
    const res = await GroupFiSDKObj.fetchForMeGroupConfigs({address: this._address!, includes})
    if (!this._address) {
      return res
    }
    const isEvm = this._isEvm();
    let configs = res
    if (isEvm) {
      configs = configs.filter(({ chainId }) => chainId != 0);
    } else {
      // Actually, there is no need to write the logic.
      // To fix test bug
      configs = configs.filter(({ chainId }) => chainId == 0);
    }

    if (!isEvm) {
      return configs
    }

    
    let evmGroupConfigsWithIsMember: Array<GroupConfigPlus & {isMember?: boolean}> = configs

    const privateGroupConfigs = configs.filter(config => {
      return !config.isPublic
    })

    const isGroupMemberList = await Promise.all(privateGroupConfigs.map(config => this.isGroupMember(config.groupId)))

    let idx = 0
    evmGroupConfigsWithIsMember = evmGroupConfigsWithIsMember.map(config => {
      if(config.isPublic) {
        return config
      }
      config.isMember = isGroupMemberList[idx]
      idx++
      return config
    })
    
    return evmGroupConfigsWithIsMember
  }
  // fetchForMeGroupConfigs
  async fetchForMeGroupConfigs({includes}: {includes?: IIncludesAndExcludes[]}): Promise<Array<GroupConfigPlus & {isMember?: boolean}>> {
    const res = await this.fetchForMeGroupConfigsWithoutProcessGroupConfigBeforeReturn({includes})
    return res.map(GroupFiSDKObj.processGroupConfigBeforeReturn)
  } 
  // fetchAddressMarkedGroupConfigs
  async fetchAddressMarkedGroupConfigs() {
    this._ensureWalletConnected();
    await this.waitForInitialization();
    const markedGroups = await GroupFiSDKObj.fetchAddressMarkGroups(
      this._address!
    );
    return markedGroups;
  }

  // storeGroupConfigToCache
  storeGroupConfigToCache(groupId: string, meta: GroupConfig): void {
    GroupFiSDKObj.storeGroupConfigToCache(groupId, meta);
  }
  // fetchMarkedGroupConfigs
  async fetchMarkedGroupConfigs() {
    this._ensureWalletConnected();
    await this.waitForInitialization();
    const markedGroups = await GroupFiSDKObj.fetchAddressMarkedGroupConfigs(
      this._address!
    );
    return markedGroups;
  }

  _client?: GroupfiSdkClient
  _walletClient: any;

  setWalletClient(walletClient: any) {
    this._walletClient = walletClient;
  }

  async setupGroupfiSdkClient() {
    this._client = new GroupfiSdkClient();
    if (this._storage) {
      this._client.setupStorage(this._storage)
      GroupfiWalletEmbedded.setupStorage(this._storage)
    }
    const nodeManager = new NodeManager(process.env.AUXILIARY_SERVICE_DOMAIN!, this._storage!);
    
    // Run nodeManager fetch and client setup in parallel
    await Promise.all([
      nodeManager.fetchUrlFromBackend(),
      this._client!.setup()
    ]);

    console.log('nodeManager.getUrl()', nodeManager.getUrl());
    this._client!.setNodeManager(nodeManager);
    GroupFiSDKObj.setNodeManager(nodeManager);
    this._auxiliaryService.setNodeManager(nodeManager);
    auxiliaryService.setNodeManager(nodeManager);
    GroupFiSDKObj.recreateMqttClient();
    // log after recreateMqttClient
    console.log('after recreateMqttClient');
  }

  async browseModeSetupClient() {
    this._address = undefined
    this._proxyAddress = undefined
    this._nodeId = undefined
    this._pairX = undefined
    this._mode = undefined
  }

  setupStorage(storage: StorageFacade) {
    this._storage = storage
  }
  async initializeClientAndChainList() {
    // If already initializing, return existing promise
    if (this._initializationPromise) {
      return this._initializationPromise;
    }

    // Create and store the initialization promise
    this._initializationPromise = (async () => {
      try {
        await Promise.all([
          this.setupGroupfiSdkClient(),
          this.fetchChainList()
        ]);
      } catch (error) {
        // Clear the promise on error so initialization can be retried
        this._initializationPromise = null;
        throw error;
      }
    })();

    return this._initializationPromise;
  }

  async waitForInitialization() {
    // If initialization hasn't started yet, start it
    if (!this._initializationPromise) {
      throw new Error('Initialization promise is not set.');
    }
    
    // Otherwise wait for existing initialization to complete
    try {
      await this._initializationPromise;
    } catch (error) {
      console.error('===>waitForInitialization error:', error)
      throw error;
    }
  }

  async bootstrap(
    walletType: WalletType,
    metaMaskAccountFromDapp: string | undefined
  ): Promise<{
    address: string;
    mode: Mode;
    nodeId: number | undefined;
  }> {

    let res:
      | {
          address: string;
          nodeId?: number;
          mode?: Mode;
        }
      | undefined = undefined;

    if (walletType === TanglePayWallet) {
      // connect tanglepay wallet
      res = await this.waitWalletReadyAndConnectTanglePayWallet();
    } else if (
      walletType === MetaMaskWallet &&
      metaMaskAccountFromDapp !== undefined
    ) {
      res = this.connectMetaMaskAccount(metaMaskAccountFromDapp);
    }

    if (!res?.mode) {
      throw new Error('mode is undefined.');
    }

    this.switchClientAdapter(res.mode);
    await this.initialAddress();

    return { address: res.address, mode: res.mode, nodeId: res.nodeId };
  }

  async fetchRegisterInfoV2(): Promise<
    | {
        publicKey: string;
        privateKeyEncrypted: string;
        mmProxyAddress: string;
        tpProxyAddress: string;
      }
    | undefined
  > {
    await this.waitForInitialization()
    const res = await GroupFiSDKObj.fetchAddressPairX(this._address!);
    if (!res) {
      return undefined;
    }
    return res;
  }

  async login(encryptedPairX: {
    publicKey: string,
    privateKeyEncrypted: string
  }) {
    const { publicKey, privateKeyEncrypted } = encryptedPairX
    const { password, pairX } = await this._client!.decryptPairX({
      publicKey: publicKey,
      privateKeyEncrypted: privateKeyEncrypted,
    });
    if (pairX) {
      this._pairX = pairX
    }
    return {password, pairX}
  }

  switchClientAdapter(mode: Mode) {
    const nodeUrlHint = 'https://api.shimmer.network';
    switch (mode) {
      case ShimmerMode: {
        const adapter = new ShimmerModeRequestAdapter(
          this._address!,
          nodeUrlHint
        );
        this._client!.switchAdapter({ adapter, mode });
        return;
      }
      case ImpersonationMode: {
        const adapter = new ImpersonationModeRequestAdapter(
          this._address!,
          nodeUrlHint
        );
        this._client!.switchAdapter({ adapter, mode });
        return;
      }
      case DelegationMode: {
        const adapter = new DelegationModeRequestAdapter(
          this._address!,
          nodeUrlHint,
          this._walletClient
        );
        this._client!.switchAdapter({ adapter, mode });
        return;
      }
    }
  }

  async initialAddress() {
    this._ensureWalletConnected();
    // 为了兼容 node 端不使用 mqtt 的场景，注释掉这里
    // this._ensureMqttConnected();

    this.clearAddress();

    // shimmer mode, setup normally
    if (this._mode === ShimmerMode) {
      this._proxyAddress = this._address;
      this._client!.switchAddress({bech32Address: this._address!});
    } else if (this._mode === ImpersonationMode) {
      const proxy = await this.getSMRProxyAccount();
      if (proxy) {
        this._proxyAddress = proxy.bech32Address;
      }
    }
  }

  subscribeToAllTopics() {
    GroupFiSDKObj.switchMqttAddress(this._address!);
  }

  unsubscribeToAllTopics() {
    GroupFiSDKObj.unsubscribeToAllTopics();
  }

  syncAllTopics(newAllTopics: string[]) {
    GroupFiSDKObj.syncAllTopics(newAllTopics);
  }

  setProxyModeInfo(modeInfo: ModeInfo) {
    if (!modeInfo.pairX || !modeInfo.detail) {
      return;
    }
    this._proxyAddress = modeInfo.detail.account;
    this._client!.switchAddress({
      bech32Address: this._proxyAddress, 
      pairX: modeInfo.pairX, 
      evmAddress: this._address
    });
    this._pairX = modeInfo.pairX;
  }

  // register step one
  async getEncryptionPublicKey() {
    const adapter = this._client!.getRequestAdapter();
    return await (adapter as IProxyModeRequestAdapter).getEncryptionPublicKey();
  }

  // register step two
  async signaturePairX(
    encryptionPublicKey: string,
    pairX: PairX | undefined | null
  ) {
    pairX = pairX ?? generateSMRPair();
    const first32BytesOfPrivateKeyHex = bytesToHex(
      pairX.privateKey.slice(0, 32)
    );
    // const encryptedPrivateKeyHex = EthEncrypt({
    //   publicKey: encryptionPublicKey,
    //   dataTobeEncrypted: first32BytesOfPrivateKeyHex,
    // });
    const encryptedPrivateKeyHex = GroupfiWalletEmbedded.encryptDataUsingPassword(first32BytesOfPrivateKeyHex, encryptionPublicKey)

    const extraObj: {[key: string]: boolean} = {}
    const isUpAddress = await isUniversalProfileAddress(this._address!)

    if (isUpAddress) {
      extraObj.lsp = true
    }

    let extraStrHex = ''
    if (Object.keys(extraObj).length) {
      extraStrHex = utf8ToHex(JSON.stringify(extraObj), true)
    }

    const metadataObj = {
      encryptedPrivateKey: encryptedPrivateKeyHex,
      pairXPublicKey: bytesToHex(pairX.publicKey, true),
      evmAddress: this._address!,
      timestamp: getCurrentEpochInSeconds(),
      // 1: tp  2: mm
      scenery: this._mode === DelegationMode ? 2 : 1,
      extra: extraStrHex
    };

    const dataTobeSignedStr = [
      metadataObj.encryptedPrivateKey,
      metadataObj.evmAddress,
      metadataObj.pairXPublicKey,
      metadataObj.scenery,
      metadataObj.timestamp,
      metadataObj.extra
    ].join('');

    const dataToBeSignedHex = utf8ToHex(PAIRX_SIGN_PREFIX_TEXT + dataTobeSignedStr, true); 

    const adapter = this._client!.getRequestAdapter();

    const signature = await (adapter as IProxyModeRequestAdapter).ethSign({
      dataToBeSignedHex,
    });

    const metadataObjWithSignature = { ...metadataObj, signature };

    return {
      pairX,
      metadataObjWithSignature,
    };
  }

  async registerPairX(params: {
    metadataObjWithSignature: Object;
    pairX: PairX;
  }) {
    const { pairX, metadataObjWithSignature } = params;
    const adapter = this._client!.getRequestAdapter();
    if (this._mode === ImpersonationMode) {
      const { bech32Address } = await (
        adapter as ImpersonationModeRequestAdapter
      ).getProxyAccount();
      await this._client!.switchAddress({bech32Address, pairX, evmAddress: this._address});
      await this._client!.registerTanglePayPairX({
        pairX,
        metadataObjWithSignature,
      });
      this._pairX = pairX;
      (adapter as ImpersonationModeRequestAdapter).importProxyAccount();
    } else if (this._mode === DelegationMode) {
      const {proxyAccount:smrAddress,remainderIds:outputids,
        remainderOutputs:outputs
      } = await (adapter as DelegationModeRequestAdapter).registerPairX(metadataObjWithSignature)
      this._proxyAddress = smrAddress
      this._pairX = pairX
      if (outputids.length) {
        this._client!.resetAllRemainderHints('register', outputids, outputs)
      }
    }
  }

  // Retrieve SMR proxy account details, applicable only in `ImpersonationMode`.
  async getSMRProxyAccount(): Promise<
    { bech32Address: string; hexAddress: string } | undefined
  > {
    if (this._mode !== ImpersonationMode) {
      return;
    }
    const adapter =
      this._client!.getRequestAdapter() as ImpersonationModeRequestAdapter;
    return await adapter.getProxyAccount();
  }

  async importSMRProxyAccount() {
    const adapter =
      this._client!.getRequestAdapter() as ImpersonationModeRequestAdapter;
    return await adapter.importProxyAccount();
  }

  clearAddress() {
    this._muteMap = undefined;
    this._muteMapPromise = null
    this._pairX = undefined;
    this._proxyAddress = undefined;
  }

  getTPMode(nodeId: number): Mode {
    if (nodeId === TP_SHIMMER_MAINNET_ID) {
      return ShimmerMode;
    }
    return ImpersonationMode;
  }

  connectMetaMaskAccount(metaMaskAccountFromDapp: string) {
    this._mode = DelegationMode;
    this._address = metaMaskAccountFromDapp;
    this._nodeId = undefined;

    return { mode: this._mode, address: this._address };
  }

  async waitWalletReadyAndConnectTanglePayWallet(): Promise<{
    address: string;
    nodeId: number;
    mode: Mode | undefined;
  }> {
    return new Promise((resolve, reject) => {
      const listener = async () => {
        if (IotaSDK.isTanglePay) {
          IotaSDK._events.off('iota-ready', listener);
          console.log('****iota ready');

          try {
            const res = (await IotaSDK.request({
              method: 'iota_connect',
              params: {
                // expires: 3000000
              },
            })) as { address: string; nodeId: number };

            // Uniformly convert EVM addresses to lowercase
            res.address = res.address.toLowerCase();

            console.log('===>iota connect', res);
            this._lastTimeSdkRequestResultReceived = Date.now();
            this._address = res.address;
            this._nodeId = res.nodeId;
            const mode = this.getTPMode(res.nodeId);
            this._mode = mode;
            resolve({
              ...res,
              mode,
            });
          } catch (error) {
            reject({
              name: 'TanglePayConnectFailed',
            });
          }
        } else {
          reject({
            name: 'TanglePayUnintalled',
          });
        }
      };
      // TanglePay is ready
      if (IotaSDK.isTanglePay && IotaSDK.tanglePayVersion !== '') {
        listener();
      } else {
        IotaSDK._events.on('iota-ready', listener);
      }
    });
  }

  async loadGroupVotesCount(groupId: string): Promise<{
    groupId: string;
    publicCount: number;
    privateCount: number;
    memberCount: number;
  }> {
    this._ensureWalletConnected();
    groupId = prefixedGroupIdToGroupId(groupId);
    return await GroupFiSDKObj.fetchGroupVotesCount(groupId);
  }

  async voteGroup(groupId: string, vote: number) {
    this._ensureWalletConnected();
    this.tryHandleOneLowPriorityTask();
    groupId = prefixedGroupIdToGroupId(groupId);
    const res = (await this._client!.voteGroup(
      groupId,
      vote,
      this._address!
    )) as TransactionRes | undefined;
    if (res === undefined) {
      throw new Error('voteGruop res');
    }
    console.log('***voteGroup res', res);
    return res;
  }

  async unvoteGroup(groupId: string) {
    this._ensureWalletConnected();
    groupId = prefixedGroupIdToGroupId(groupId);
    const res = (await this._client!.unvoteGroup(groupId, this._address!)) as
      | TransactionRes
      | undefined;
    if (res === undefined) {
      throw new Error('unvote group error');
    }
    console.log('***unvoteGroup res', res);
    return res;
  }

  // 不需要使用 waitOutput
  // async waitOutput(outputId: string) {
  //   await GroupFiSDKObj.waitOutput(outputId);
  // }

  // get user group
  async getUserGroupReputation(groupId: string): Promise<IGroupUserReputation> {
    groupId = prefixedGroupIdToGroupId(groupId);
    const allUserGroup = await GroupFiSDKObj.fetchUserGroupReputation(
      groupId,
      this._address!
    );
    return allUserGroup;
  }
  async getGroupVoteRes(groupId: string) {
    this._ensureWalletConnected();
    groupId = prefixedGroupIdToGroupId(groupId);
    const allGroupVotes = (await this._client!.getAllGroupVotes(
      this._address!
    )) as Array<{
      groupId: string;
      vote: number;
    }>;
    return allGroupVotes.find((groupVote) => groupVote.groupId === groupId)
      ?.vote;
  }

  async markGroup(groupId: string) {
    this._ensureWalletConnected();
    this.tryHandleOneLowPriorityTask();
    groupId = prefixedGroupIdToGroupId(groupId);
    const res = (await this._client!.markGroup({
      groupId,
      userAddress: this._address!,
    })) as TransactionRes | undefined;
    return res;
  }

  async joinGroup({
    groupId,
    memberList,
    publicKey,
    qualifyList,
    isGroupPublic,
  }: {
    groupId: string;
    publicKey: string;
    memberList: { addr: string; publicKey: string }[];
    isGroupPublic: boolean;
    qualifyList?: { addr: string; publicKey: string }[];
  }) {
    this._ensureWalletConnected();
    this.tryHandleOneLowPriorityTask();
    groupId = prefixedGroupIdToGroupId(groupId);
    const isAlreadyInMemberList = memberList.find(
      (o) => o.addr === this._address!
    );
    if (isAlreadyInMemberList) return true;
    if (this._mode !== ShimmerMode) {
      // TODO
      publicKey = this._client!.getPairXPublicKey()!;
    }
    const memberSelf = { addr: this._address!, publicKey };
    memberList.push(memberSelf);
    const res = (await this._client!.markGroup({
      groupId,
      memberList,
      userAddress: this._address!,
      memberSelf,
      isGroupPublic,
      qualifyList,
    })) as TransactionRes | undefined;
    return res;
  }
  // getGroupEvmQualifiedList
  async getGroupEvmQualifiedList(groupId: string) {
    this._ensureWalletConnected();
    groupId = prefixedGroupIdToGroupId(groupId);
    const memberSelf = {
      addr: this._address!,
      publicKey: this._client!.getPairXPublicKey()!,
    };
    return await this._client!.getEvmQualifyList(groupId, memberSelf);
  }
  // sendAdHocOutput
  async sendAdHocOutput(output: IBasicOutput) {
    this._ensureWalletConnected();
    return await this._client!._sendBasicOutput([output]);
  }
  // getPluginGroupEvmQualifiedList
  async getPluginGroupEvmQualifiedList(groupId: string) {
    groupId = prefixedGroupIdToGroupId(groupId);
    return await this._client!.getPluginEvmQualifyList(groupId);
  }
  // async _getEvmQualify(groupId:string,addressList:string[],signature:string):Promise<IBasicOutput>{
  async getEvmQualify(
    groupId: string,
    addressList: string[],
    signature: string,
    timestamp: number
  ): Promise<IBasicOutput> {
    this._ensureWalletConnected();
    groupId = prefixedGroupIdToGroupId(groupId);
    const addressType = getEvmOrSolanaAddressType(this._address!);
    return await this._client!._getEvmQualify(groupId, addressList, signature, addressType,timestamp);
  }
  async leaveOrUnMarkGroup(groupId: string) {
    this._ensureWalletConnected();
    this.tryHandleOneLowPriorityTask();
    groupId = prefixedGroupIdToGroupId(groupId);
    const res = (await this._client!.unmarkGroup(groupId, this._address!)) as
      | TransactionRes
      | undefined;
    return res;
  }

  // get current address
  getCurrentAddress() {
    return this._address ?? '';
  }
  getCurrentNodeId() {
    return this._nodeId;
  }
  getCurrentMode() {
    return this._mode;
  }
  async isGroupMember(groupId: string) {
    try {
      if (!this._address) {
        return false
      }
      groupId = prefixedGroupIdToGroupId(groupId);
      const groupMemberAddressList = await this.loadGroupMemberAddresses(groupId)
      const isMember = groupMemberAddressList.find(({ownerAddress}) => ownerAddress === this._address!) 
      return isMember !== undefined
    } catch(error) {
      return false
    }
  }
  async isQualified(groupId: string) {
    this._ensureWalletConnected();
    groupId = prefixedGroupIdToGroupId(groupId);
    const isEvm = this._isEvm();
    if (isEvm) {
      return await this._isEvmQualified(groupId);
    }
    const ipfsOrigins = await GroupFiSDKObj.fetchIpfsOrigins(this._address!);
    const qualifiedGroups = await GroupFiSDKObj.fetchAddressQualifiedGroups(
      this._address!,
      ipfsOrigins
    );
    return !!qualifiedGroups.find(
      (qualifiedGroup) =>
        qualifiedGroup.groupId === GroupFiSDKObj._addHexPrefixIfAbsent(groupId)
    );
  }
  async _isEvmQualified(groupId: string) {
    groupId = prefixedGroupIdToGroupId(groupId);
    const address = this._address!;
    return await GroupFiSDKObj.isEvmAddressQualifiedForGroup(address, groupId);
  }

  // _addHexPrefixIfAbsent
  addHexPrefixIfAbsent(str: string) {
    return GroupFiSDKObj._addHexPrefixIfAbsent(str);
  }
  async fetchAddressMarkedGroups() {
    this._ensureWalletConnected();
    await this.waitForInitialization();
    const markedGroups = await GroupFiSDKObj.fetchAddressMarkGroups(
      this._address!
    );
    return markedGroups;
  }

  async getAddressMarkedGroupsWithGroupName() {
    const markedGroups = await this.fetchAddressMarkedGroups();
    return markedGroups
      .map((groupId) => {
        groupId = groupId.startsWith('0x') ? groupId.slice(2) : groupId;
        const groupMeta = GroupFiSDKObj._groupIdToGroupMeta(groupId);
        if (groupMeta === undefined) {
          return;
        }
        return {
          groupId,
          groupName: groupMeta.groupName,
          qualifyType: groupMeta.qualifyType,
        };
      })
      .filter(Boolean) as {
      groupId: string;
      groupName: string;
      qualifyType: string;
    }[];
  }

  async marked(groupId: string) {
    this._ensureWalletConnected();
    groupId = prefixedGroupIdToGroupId(groupId);
    const markedGroupIds = await this.fetchAddressMarkedGroups();
    // log markedGroupIds
    console.log('markedGroupIds', markedGroupIds, groupId);
    for (const markedGroupId of markedGroupIds) {
      if (
        isGroupIdEqual(groupId, markedGroupId)
      ) {
        return true;
      }
    }
    return false;
  }

  getGroupMetaByGroupId(groupId: string) {
    groupId = prefixedGroupIdToGroupId(groupId);
    return GroupFiSDKObj._groupIdToGroupMeta(groupId);
  }

  async isGroupPublic(groupId: string) {
    groupId = prefixedGroupIdToGroupId(groupId);
    return await GroupFiSDKObj.checkIsGroupPublicFromSharedApiCall(groupId!);
  }

  async loadAddressMemberGroups(address: string) {

    await this.waitForInitialization();
    let groupIds = await GroupFiSDKObj.fetchAddressMemberGroups(
      address
    );
    groupIds = groupIds.filter(groupId => {
      const groupMeta = this.getGroupMetaByGroupId(groupId)
      return groupMeta !== undefined
    })
    return groupIds
  }
  
  async loadGroupMemberAddresses(groupId: string) {

    await this.waitForInitialization();
    groupId = prefixedGroupIdToGroupId(groupId);
    return await GroupFiSDKObj.fetchGroupMemberAddresses(groupId);
  }

  async loadAddressPublicKey() {
    this._ensureWalletConnected();
    await this.waitForInitialization();
    return await GroupFiSDKObj.fetchAddressPublicKey(this._proxyAddress!);
  }
  async sendAnyOneToSelf() {
    // log
    console.log('***Enter sendAnyOneToSelf, address', this._address!);
    try {
      // call client sendAnyOneOutputToSelf()
      const res = await this._client!.sendAnyOneOutputToSelf();
      this._lastTimeSdkRequestResultReceived = Date.now();
      // log
      console.log('***sendAnyOneToSelf res', res);
      return res;
    } catch (error) {
      console.log('***sendAnyOneToSelf error', error);
    }
  }
  async isBlackListed(groupId: string) {
    this._ensureWalletConnected();
    groupId = prefixedGroupIdToGroupId(groupId);
    const blackListedAddresseHashs = await GroupFiSDKObj.fetchGroupBlacklist(
      groupId
    );
    return !!blackListedAddresseHashs.find((blackListedAddressHash) => {
      const addressHash = GroupFiSDKObj._sha256Hash(this._address!);
      return blackListedAddressHash === addressHash;
    });
  }

  async muteGroupMember(groupId: string, memberAddress: string) {
    this._ensureWalletConnected();
    this.tryHandleOneLowPriorityTask();
    groupId = prefixedGroupIdToGroupId(groupId);
    const memberAddrHash = GroupFiSDKObj._addHexPrefixIfAbsent(
      GroupFiSDKObj._sha256Hash(memberAddress)
    );
    // call client muteGroupMember(groupId, addrHash)
    const muteGroupMemberRes = (await this._client!.muteGroupMember(
      groupId,
      memberAddrHash,
      this._address!
    )) as TransactionRes | undefined;
    await this._updateMuteMap(groupId, memberAddrHash);
    // if (muteGroupMemberRes !== undefined) {
    //   await GroupFiSDKObj.waitOutput(muteGroupMemberRes.outputId);
    //   this._updateMuteMap(groupId, memberAddrHash);
    // }
  }

  // likeGroupMember
  async likeGroupMember(groupId: string, memberAddress: string) {
    this._ensureWalletConnected();
    this.tryHandleOneLowPriorityTask();
    groupId = prefixedGroupIdToGroupId(groupId);
    const memberAddrHash = GroupFiSDKObj._addHexPrefixIfAbsent(
      GroupFiSDKObj._sha256Hash(memberAddress)
    );
    // call client likeGroupMember(groupId, addrHash)
    const likeGroupMemberRes = (await this._client!.likeGroupMember(
      groupId,
      memberAddrHash,
      this._address!
    )) as TransactionRes | undefined;
    // if (likeGroupMemberRes !== undefined) {
    //   await GroupFiSDKObj.waitOutput(likeGroupMemberRes.outputId);
    // }
  }

  // unlikeGroupMember
  async unlikeGroupMember(groupId: string, memberAddress: string) {
    this._ensureWalletConnected();
    this.tryHandleOneLowPriorityTask();
    groupId = prefixedGroupIdToGroupId(groupId);
    const memberAddrHash = GroupFiSDKObj._addHexPrefixIfAbsent(
      GroupFiSDKObj._sha256Hash(memberAddress)
    );
    // call client unlikeGroupMember(groupId, addrHash)
    const unlikeGroupMemberRes = (await this._client!.unlikeGroupMember(
      groupId,
      memberAddrHash,
      this._address!
    )) as TransactionRes | undefined;
    // if (unlikeGroupMemberRes !== undefined) {
    //   await GroupFiSDKObj.waitOutput(unlikeGroupMemberRes.outputId);
    // }
  }
  
  async unMuteGroupMember(groupId: string, memberAddress: string) {
    this._ensureWalletConnected();
    this.tryHandleOneLowPriorityTask();
    groupId = prefixedGroupIdToGroupId(groupId);
    const memberAddrHash = GroupFiSDKObj._addHexPrefixIfAbsent(
      GroupFiSDKObj._sha256HashAddress(memberAddress)
    );

    // call client unmuteGroupMember(groupId, addrHash)
    const unmuteGroupMemberRes = (await this._client!.unmuteGroupMember(
      groupId,
      memberAddrHash,
      this._address!
    )) as TransactionRes | undefined;
    this._lastTimeSdkRequestResultReceived = Date.now();
    await this._updateMuteMap(groupId, memberAddrHash);
    // if (unmuteGroupMemberRes !== undefined) {
    //   await GroupFiSDKObj.waitOutput(unmuteGroupMemberRes.outputId);
    //   this._updateMuteMap(groupId, memberAddrHash);
    // }
  }

  setupIotaMqttConnection(mqttClient: any) {
    return GroupFiSDKObj.setupIotaMqttConnection(mqttClient);
  }

  async getAddressStatusInGroup(groupId: string): Promise<{
    isGroupPublic: boolean;
    isQualified: boolean;
    marked: boolean;
    muted: boolean;
  }> {
    this._ensureWalletConnected();
    groupId = prefixedGroupIdToGroupId(groupId);
    const [isGroupPublic, isQualified, marked, muted] = await Promise.all([
      this.isGroupPublic(groupId),
      this.isQualified(groupId),
      this.marked(groupId),
      this.isBlackListed(groupId),
    ]);
    // log is group public qualified marked muted
    console.log(
      'isGroupPublic',
      isGroupPublic,
      'isQualified',
      isQualified,
      'marked',
      marked,
      'muted',
      muted
    );

    return {
      isGroupPublic,
      isQualified,
      marked,
      muted,
    };
  }

  groupIdToGroupName(groupId: string) {
    groupId = prefixedGroupIdToGroupId(groupId);
    return GroupFiSDKObj.groupIdToGroupName(groupId);
  }

  sha256Hash(address: string) {
    return GroupFiSDKObj._sha256Hash(address);
  }

  async getAllUserMuteGroupMembers() {
    this._ensureWalletConnected();

    // call client getAllUserMuteGroupMembers(groupId)
    const AllUserMuteGroupMembers =
      (await this._client!.getAllUserMuteGroupMembers(
        this._address!
      )) as IMUserMuteGroupMember[];
    this._lastTimeSdkRequestResultReceived = Date.now();
    return AllUserMuteGroupMembers;
  }
  // call async fetchPublicMessageOutputList(groupId:string, startToken?:string, endToken?:string, size:number=10) {
  async fetchPublicMessageOutputList(
    groupId: string,
    direction: 'head' | 'tail',
    startToken?: string,
    endToken?: string,
    size = 10
  ) {
    await this.waitForInitialization();
    groupId = prefixedGroupIdToGroupId(groupId);
    const res = await GroupFiSDKObj.fetchPublicMessageOutputList(
      groupId,
      direction,
      startToken,
      endToken,
      size
    );
    return res;
  }

  async checkIsRegisteredInServiceEnv(publicKey: string | Uint8Array, proxyAddressToConfirm: string) {
    if (this._mode !== DelegationMode) {
      return true
    }
    if (typeof publicKey !== 'string') {
      publicKey = bytesToHex(publicKey, true)
    }
    const proxyAddressFromServiceEnv = await this._auxiliaryService.fetchProxyAccount(publicKey)
    if (proxyAddressFromServiceEnv === undefined) {
      return false
    }
    if (proxyAddressFromServiceEnv !== proxyAddressToConfirm) {
      return false
    }
    return true
  }
  _chainList?:ChainList = undefined
  async fetchChainList() {
    if (this._chainList === undefined) {
      // Start API call early but don't await it yet
      const apiPromise = this._auxiliaryService.getChainList();

      // Try to load from storage first
      if (this._storage) {
        const storedChainList = await this._storage.get(this._storage.prefix + CHAIN_LIST_STORAGE_KEY);
        if (storedChainList) {
          try {
            this._chainList = JSON.parse(storedChainList);
          } catch (error) {
            console.warn('Failed to parse stored chain list:', error);
          }
        }
      }

      // If we have storage data, update in background
      if (this._chainList !== undefined) {
        apiPromise
          .then(apiChainList => {
            this._chainList = apiChainList;
            if (this._storage) {
              return this._storage.set(this._storage.prefix + CHAIN_LIST_STORAGE_KEY, JSON.stringify(apiChainList));
            }
          })
          .catch(error => {
            console.warn('Failed to fetch latest chain list:', error);
          });
      } else {
        // No storage data, wait for API call
        try {
          this._chainList = await apiPromise;
          if (this._storage) {
            await this._storage.set(this._storage.prefix + CHAIN_LIST_STORAGE_KEY, JSON.stringify(this._chainList));
          }
        } catch (error) {
          throw error;
        }
      }
    }
  }
  _ensureChainList() {
    if (!this._chainList) {
      throw new Error('ChainList is undefined')
    }
  }
  // get chain info
  getChainByChainId(chainId: number): ChainInfo | null {
    this._ensureChainList()
    return this._chainList![chainId] ?? null
  }
  // get group token uri
  getGroupTokenUri(groupId: string): string {
    const groupMeta = this.getGroupMetaByGroupId(groupId)
    if (groupMeta === undefined) {
      return ''
    }
    const chainInfo = this.getChainByChainId(groupMeta.chainId)
    if (!chainInfo) return ''
    if (chainInfo.picUri && groupMeta.contractAddress) {
      return `${chainInfo.picUri}/${groupMeta.contractAddress}/logo.png`
    }
    return ''
  }

  async isNameDuplicate(name: string) {
    return await this._auxiliaryService.isNameDuplicate(name)
  }

  async getActiveProfile(): Promise<{profile: Profile, outputId: string} | null> {
    try {
      this._ensureWalletConnected()
      const res = await GroupFiSDKObj.fetchAddressProfile(this._address!)
      if (res === null) return res
      const profile = JSON.parse(res.data)
      return {profile, outputId: res.outputId}
    } catch (error) {
      return null
    }
  }

  async getGroupFiProfile(): Promise<Profile | null> {
    this._ensureWalletConnected();
    await this.waitForInitialization();
    const res = await this.fetchAddressNames([this._address!])
    const profile = res[this._address!]
    if (!profile) {
      return null
    }
    return {
      chainId: 148,
      name: profile.name
    }
  }

  async setProfile(profile: Profile) {
    this._ensureWalletConnected();
    const old = await this.getActiveProfile()
    console.log('setProfile old', old)
    let outputIdToBeConsumed: string | undefined = undefined
    if (old !== null) {
      const {profile: oldProfile, outputId} = old
      // if (this.isSameProfile(oldProfile, profile)) {
      //   console.log('Set the same profile')
      //   return
      // }
      outputIdToBeConsumed = outputId
    }
    const profileJsonStr = JSON.stringify(profile)
    return await this._client!.setProfile(profileJsonStr, outputIdToBeConsumed)
  }

  isSameProfile(profile1: Profile, profile2: Profile) {
    if (profile1.chainId !== profile2.chainId) {
      return false
    }
    if (profile1.name !== profile2.name) {
      return false
    }
    if ((profile1.avatar ?? '') !== (profile2.avatar ?? '')) {
      return false
    }
    return true
  }

  _isGroupFiProfile(profile: Profile) {
    return profile.chainId === 148
  }

  async getAddressProfileList(update = false): Promise<{profileList: Profile[], profileToBeUpdateOnChain?: boolean }> {
    console.log('profile getAddressProfileList update', update)
    this._ensureWalletConnected()
    const addressList = [this._address!]
    const updates = [update]
    const body = JSON.stringify({
      addresses: addressList,
      updates
    })
    const [profileListMap, groupFiProfile, activeProfile] = await Promise.all([
      this._auxiliaryService.getAddressProfileList(body), 
      this.getGroupFiProfile(),
      this.getActiveProfile().then(res => res?.profile ?? null)
    ])
    let profileList = profileListMap[this._address!] ?? []
    let profileToBeUpdateOnChain: Profile | undefined = undefined
    
    console.log('getAddressProfileList groupFi Profile', groupFiProfile)

    if (groupFiProfile && !profileList.find(this._isGroupFiProfile)) {
      profileList.push(groupFiProfile)
    }

    if (activeProfile !== null) {
      let isActiveProfileFound = false
      profileList = profileList.map(profile => {
        if (profile.chainId === activeProfile.chainId) {
          isActiveProfileFound = true
          if (!this.isSameProfile(profile, activeProfile)) {
            profileToBeUpdateOnChain = {...profile}
          }
          profile.isActive = true
        }
        return profile
      })
      if (!isActiveProfileFound) {
        if (this._isGroupFiProfile(activeProfile)) {
          console.log('select groupfi profile not found in profile list, push it')
          profileList.push({
            ...activeProfile,
            isActive: true
          })
        } else {
          console.warn('select profile not found in profile list')
          profileList.push({
            ...activeProfile,
            isActive: true
          })
        }
      }
    }
    const formatedProfileList = profileList.map(profile => ({
      ...profile,
      name: GroupFiSDKObj.formatProfileName(profile.chainId, profile.name)
    }))
    return {profileList: formatedProfileList, profileToBeUpdateOnChain }
  }

  async fetchPublicMessageOutputListBatch(params: Array<{
    groupId: string,
    direction: 'head' | 'tail',
    startToken?: string,
    endToken?: string, 
    size?: number
  }>): Promise<PublicMessageBatchResponse[]> {
    try {
      // Convert params to ensure groupIds have hex prefix
      const formattedParams = params.map(param => ({
        ...param,
        groupId: GroupFiSDKObj._addHexPrefixIfAbsent(param.groupId),
        startToken: param.startToken && GroupFiSDKObj._addHexPrefixIfAbsent(param.startToken),
        endToken: param.endToken && GroupFiSDKObj._addHexPrefixIfAbsent(param.endToken)
      }));

      const res = await GroupFiSDKObj.fetchPublicMessageOutputListBatch(formattedParams);
      return res;
    } catch (error) {
      console.log('fetchPublicMessageOutputListBatch error', error);
      throw error;
    }
  }

  // Sends temporary outputs through the client
  async sendTempOutputs(outputs: IBasicOutput[]) {
    this._ensureWalletConnected();
    return await this._client!._sendBasicOutput(outputs);
  }

  /**
   * Adds a low priority task that creates and consumes outputs
   * @param key Unique identifier for deduplication
   * @param task Function that returns created and consumed outputs
   * @param ttlSeconds Time to live in seconds before the task expires
   */
  addLowPriorityTask(key: string, task: () => TaskOutputs, ttlSeconds: number = 3600) {
    // Add new task with expiration time, overriding any existing task with the same key
    // log method name, key, ttlSeconds
    console.log('addLowPriorityTask, key', key, 'ttlSeconds', ttlSeconds);
    this._lowPriorityTasks.set(key, {
      task,
      expireTime: Date.now() + (ttlSeconds * 1000)
    });
  }

  /**
   * Attempts to handle one low priority task from the queue
   * @returns true if a task was handled, false if no tasks were available
   */
  tryHandleOneLowPriorityTask(): boolean {
    // Get first task from map
    const firstEntry = this._lowPriorityTasks.entries().next();
    if (firstEntry.done) {
      return false;
    }

    const [key, taskInfo] = firstEntry.value;
    
    try {
      // Execute the task
      const outputs = taskInfo.task();
      
      // Store the outputs using client
      this._client!.storeTempOutputs(outputs.created, outputs.consumed);

      // Remove the completed task
      this._lowPriorityTasks.delete(key);
      return true;
      
    } catch (error) {
      console.error(`Error executing low priority task ${key}:`, error);
      // Remove failed task
      this._lowPriorityTasks.delete(key);
      return false;
    }
  }

  /**
   * Attempts to clean one expired low priority task from the queue
   * @returns true if an expired task was cleaned, false if no expired tasks were found
   */
  async tryCleanOneExpiredLowPriorityTask(): Promise<boolean> {
    // Find first expired task
    const now = Date.now();
    for (const [key, taskInfo] of this._lowPriorityTasks) {
      if (taskInfo.expireTime <= now) {
        try {
          // Execute the expired task
          const outputs = taskInfo.task();
          
          // Store the outputs
          this._client!.storeTempOutputs(outputs.created, outputs.consumed);

          // Send the outputs
          await this._client!.sendTempOutputs();

          // Remove the completed task
          this._lowPriorityTasks.delete(key);
          return true;
          
        } catch (error) {
          console.error(`Error cleaning expired task ${key}:`, error);
          // Remove failed task
          this._lowPriorityTasks.delete(key);
          return false;
        }
      }
    }
    return false;
  }
}

export const GroupFiSDKFacadeInstance = new GroupFiSDKFacade();
