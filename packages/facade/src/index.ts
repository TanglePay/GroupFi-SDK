import IotaSDK from 'tanglepaysdk-client';
import {
  IotaCatSDKObj,
  ShimmerBech32Addr,
  Address,
  IMessage,
  MessageGroupMeta,
  IMMessage,
  IGroupUserReputation,
  IMUserMuteGroupMember,
  EventGroupMemberChanged,
  PushedNewMessage,
  PushedValue,
  EventItemFromFacade,
  ImInboxEventTypeNewMessage,
  ImInboxEventTypeGroupMemberChanged,
  InboxItemResponse,
  MessageResponseItem,
  ImInboxEventTypeMarkChanged,
  IIncludesAndExcludes,
  ImInboxEventTypeMuteChanged,
  ImInboxEventTypeLikeChanged,
  MessageResponseItemPlus,
  INX_GROUPFI_DOMAIN,
  isUniversalProfileAddress,
  getEvmOrSolanaAddressType
} from 'groupfi-sdk-core';
import GroupfiWalletEmbedded from 'groupfi-walletembed';

import {
  SimpleDataExtended,
  strToBytes,
  objectId,
  sleep,
  generateSMRPair,
  bytesToHex,
  concatBytes,
  getCurrentEpochInSeconds,
  tracer,
} from 'groupfi-sdk-utils';
import {
  GroupfiSdkClient,
  IProxyModeRequestAdapter,
  MessageBody,
  AddressMappingStore,
  nameMappingCache,
  StorageFacade
} from 'groupfi-sdk-client';
import { Web3 } from 'web3';
import smrPurchaseAbi from './contractAbi/smr-purchase';
import { EthEncrypt, utf8ToHex } from 'groupfi-sdk-utils';

import {
  WalletType,
  TransactionRes,
  RecommendGroup,
  Mode,
  ShimmerMode,
  ImpersonationMode,
  TanglePayWallet,
  MetaMaskWallet,
  DelegationMode,
  RegisteredInfo,
  ModeInfo,
  PairX,
} from './types';

import {
  ShimmerModeRequestAdapter,
  ImpersonationModeRequestAdapter,
  DelegationModeRequestAdapter,
} from './client/clientMode';

import { AuxiliaryService, config, ChainList, ChainInfo } from './auxiliaryService';
import { IBasicOutput } from '@iota/iota.js';

export { SimpleDataExtended };
export * from './types';

const TP_SHIMMER_MAINNET_ID = 102;
const TP_EVM_CHAIN_ID = 5;
const SUPPORTED_CHAIN_ID_LIST = [TP_SHIMMER_MAINNET_ID, TP_EVM_CHAIN_ID];

const PAIRX_SIGN_PREFIX_TEXT = 'Creating account... '

class GroupFiSDKFacade {
  private _address: string | undefined;
  private _proxyAddress: string | undefined;
  private _nodeId: number | undefined;
  private _mode: Mode | undefined;
  private _pairX: PairX | undefined;

  private _mqttConnected: boolean = false;

  private _lastTimeSdkRequestResultSent: number = 0;
  private _lastTimeSdkRequestResultReceived: number = 0;

  private _auxiliaryService = new AuxiliaryService();

  private _storage: StorageFacade | null = null

  private _currentGroup:
    | {
        groupName: string;
        groupId: string;
      }
    | undefined = undefined;

  get currentGroupName() {
    return this._currentGroup?.groupName;
  }

  get currentMode() {
    if (this._mode === undefined) {
      throw new Error('Mode is undefined.');
    }
    return this._mode;
  }

  get currentGroupId() {
    return this._currentGroup?.groupId;
  }

  checkIsChainSupported(nodeId: number) {
    return SUPPORTED_CHAIN_ID_LIST.includes(nodeId);
  }

  getObjectId(obj: Record<string, SimpleDataExtended>) {
    return objectId(obj);
  }

  private _muteMap:
    | {
        [groupId: string]: string[];
      }
    | undefined = undefined;

  _updateMuteMap(groupId: string, addressHash: string) {
    if (this._muteMap === undefined) {
      return;
    }
    const groupMutedMembers = this._muteMap[groupId];
    if (groupMutedMembers === undefined) {
      this._muteMap[groupId] = [addressHash];
      return;
    }
    if (groupMutedMembers.includes(addressHash)) {
      this._muteMap[groupId] = groupMutedMembers.filter(
        (member) => member !== addressHash
      );
    } else {
      this._muteMap[groupId].push(addressHash);
    }
  }

  async getIsMutedFromMuteMap(groupId: string, address: string) {
    groupId = IotaCatSDKObj._addHexPrefixIfAbsent(groupId);
    if (this._muteMap === undefined) {
      const allUserMuteGroupMembers = await this.getAllUserMuteGroupMembers();
      this._muteMap = allUserMuteGroupMembers.reduce(
        (acc: { [groupId: string]: string[] }, { groupId, addrSha256Hash }) => {
          acc[groupId] = [...(acc[groupId] ?? []), addrSha256Hash];
          return acc;
        },
        {}
      );
    }
    const addressHash = IotaCatSDKObj._addHexPrefixIfAbsent(
      IotaCatSDKObj._sha256Hash(address)
    );
    const mutedAddressHash = this._muteMap[groupId] ?? [];
    return mutedAddressHash.includes(addressHash);
  }
  
  async getAllUserLikeGroupMembers() {
    this._ensureWalletConnected();
    return await this._client!.getAllUserLikeGroupMembers(this._address!)
  }

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
      const message: IMessage = {
        type: ImInboxEventTypeNewMessage,
        messageId: resUnwrapped.messageId,
        groupId: resUnwrapped.message.groupId,
        sender: resUnwrapped.sender,
        message: resUnwrapped.message.data,
        timestamp: resUnwrapped.message.timestamp,
        name: undefined
      };

      if (this._mode !== ShimmerMode) {
        const evmAddress = await AddressMappingStore.getEvmAddress(
          message.sender
        );
        message.sender = evmAddress;
      }

      const name = await this.getNameFromNameMappingCache(message.sender)
      message.name = name

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

  async getNameFromNameMappingCache(address: string) {
    try {
      const nameRes = await nameMappingCache.getRes(address)
      return nameRes.name
    }catch(error) {
      throw error
    }
  }

  listenningNewEventItem(
    callback: (message: EventItemFromFacade) => void
  ): () => void {
    this._ensureWalletConnected();
    this._ensureMqttConnected();
    // if (!this._mqttConnected) {
    //   throw new Error('MQTT not connected');
    // }
    // log listenningNewEventItem
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
      }
      if (item) {
        callback(item);
      }
    };
    IotaCatSDKObj.on('inbox', listener);
    return () => IotaCatSDKObj.off('inbox', listener);
  }

  async setupMqttConnection(connect: any) {
    IotaCatSDKObj.setupMqttConnection(connect);
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

  // listenningMetaMaskAccountsChanged(callback: (params: { address: string; nodeId?: number; mode: Mode, isAddressChanged: boolean }) => void) {
  //   const listenner = async () => {
  //     const {mode, address} = await this.connectMetaMaskWallet()
  //     console.log('trollbox metamask account changed', mode, address)
  //     const res = {
  //       mode,
  //       address,
  //       nodeId: undefined,
  //       isAddressChanged: true,
  //     }
  //     await this._onAccountChanged(res);
  //     callback(res)
  //   }

  //   window.ethereum.on("accountsChanged", listenner);

  //   return () => window.ethereum.removeListener("accountsChanged", listenner)
  // }

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

      // 第一次连接钱包，也会触发这个函数, 这样避免第一次连接时处罚
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

      console.log('===> this._address', this._address);
      console.log('===> address', address);

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
      // this._nodeId = nodeId
      // 第一次选择地址，也会触发这个函数，如果地址一样，就不用触发吧
      // const newMode= this.getTPMode(nodeId);
      // if (this._address === address && this._mode === newMode) {
      //   return;
      // }
      // this._address = address;
      // this._mode = newMode;
      // console.log('accountsChanged', { address, nodeId, mode: this._mode });
      // TP 的问题：每次切换新地址之后，都需要重新执行一下 connectWallet request，不然会报错，not authorized
      // await IotaSDK.request({
      //   method: 'iota_connect',
      //   params: {
      //     // expires: 3000000
      //   },
      // });
      // console.log(
      //   'accountsChanged and connect wallet using new address successfully',
      //   address
      // );
    };
    IotaSDK.on('accountsChanged', listener);
    return () => IotaSDK.removeListener('accountsChanged', listener);
  }

  async _onAccountChanged({
    mode,
    isAddressChanged,
  }: {
    address: string;
    nodeId?: number;
    mode: Mode;
    isAddressChanged: boolean;
  }) {
    this.switchClientAdapter(mode);
    if (isAddressChanged) {
      await this.initialAddress();
    }
  }

  async fetchMessageOutputList(
    continuationToken?: string,
    limit = 3
  ): Promise<InboxItemResponse> {
    return (await IotaCatSDKObj.fetchMessageOutputList(
      this._address!,
      continuationToken,
      limit
    )) as InboxItemResponse;
  }

  // processOneMessage
  processOneMessage(item: MessageResponseItem & {output?:IBasicOutput}): boolean {
    const pipe = this._client!.getOutputIdToMessagePipe();
    const res = pipe.write({
      outputId: item.outputId,
      output: item.output,
      token: item.token,
      address: this._address!,
      type: 1,
    });
    return res;
  }
  // registerMessageCallback
  registerMessageCallback(
    callback: (param: {
      message?: IMessage;
      outputId: string;
      status: number;
    }) => void
  ) {
    const listener = (param: {
      message?: IMessage;
      outputId: string;
      status: number;
    }) => {
      if (param) {
        callback(param);
      }
    };
    const pipe = this._client!.getOutputIdToMessagePipe();
    pipe.on('data', listener);
  }

  // fullfillOneMessageLite
  async fullfillOneMessageLite(item: MessageResponseItem): Promise<IMessage> {
    // call client getMessageFromOutputId({ outputId, address: addr, type: 1 })
    const res = (await this._client!.getMessageFromOutputId({
      outputId: item.outputId,
      address: this._address!,
      type: 1,
    })) as
      | {
          type: typeof ImInboxEventTypeNewMessage;
          sender: string;
          message: IMMessage;
          messageId: string;
        }
      | undefined;
    this._lastTimeSdkRequestResultReceived = Date.now();
    const message = res
      ? {
          type: ImInboxEventTypeNewMessage,
          sender: res.sender,
          token: item.token,
          message: res.message.data,
          messageId: res.messageId,
          timestamp: res.message.timestamp,
          groupId: res.message.groupId,
        }
      : undefined;
    return message! as IMessage;
  }
  // prepareRemainderHint
  async prepareRemainderHint() {
    this._ensureWalletConnected();
    const res = await this._client!.prepareRemainderHint();
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
  async fullfillMessageLiteList(
    list: MessageResponseItem[]
  ): Promise<IMessage[]> {
    const outputIds = list.map((o) => o.outputId);

    // call client .getMessagesFromOutputIds({ outputIds, address: addr, type: 1 })
    const res = (await this._client!.getMessagesFromOutputIds({
      outputIds,
      address: this._address!,
      type: 1,
    })) as
      | {
          type: typeof ImInboxEventTypeNewMessage;
          sender: string;
          message: IMMessage;
          messageId: string;
        }[]
      | undefined;
    this._lastTimeSdkRequestResultReceived = Date.now();
    const messageList = (res ?? []).map((o) => ({
      type: ImInboxEventTypeNewMessage,
      sender: o.sender,
      message: o.message.data,
      messageId: o.messageId,
      timestamp: o.message.timestamp,
      groupId: o.message.groupId,
    })) as IMessage[];
    return messageList;
  }
  // getInboxMessage
  async getInboxItems(
    continuationToken?: string,
    limit = 3
  ): Promise<{ itemList: EventItemFromFacade[]; nextToken?: string }> {
    this._ensureWalletConnected();

    // call client fetchInboxItemList(addr, continuationToken, limit)
    const resstr = (await this._client!.fetchInboxItemList(
      this._address!,
      continuationToken,
      limit
    )) as string | undefined;
    this._lastTimeSdkRequestResultReceived = Date.now();
    if (!resstr) {
      return { itemList: [] };
    }
    console.log('***iota_im_groupinboxmessagelist success', resstr);
    const res = JSON.parse(resstr) as {
      itemList: (MessageBody | EventGroupMemberChanged)[];
      token?: string;
    };
    console.log('***iota_im_groupinboxmessagelist success', res);
    const itemList = res.itemList;
    const token = res.token;
    // log
    console.log('itemList', itemList);
    const fulfilledMessageList: EventItemFromFacade[] =
      itemList != undefined
        ? itemList.map((item) => {
            if (item.type === ImInboxEventTypeNewMessage) {
              const msg: IMessage = item;
              return msg;
            } else if (item.type === ImInboxEventTypeGroupMemberChanged) {
              const msg: EventGroupMemberChanged = item;
              return msg;
            } else {
              throw new Error('unknown message type');
            }
          })
        : [];
    // log fulfilledMessageList
    console.log('fulfilledMessageList', fulfilledMessageList);

    // log filteredMessage
    // const filteredRes = await Promise.all(
    //   fulfilledMessageList.map((item) => {
    //     if (item.type === ImInboxEventTypeNewMessage) {
    //       const msg = item as IMessage;
    //       return this.filterMutedMessage(msg.groupId, msg.sender)
    //     } else if (item.type === ImInboxEventTypeGroupMemberChanged) {
    //       const fn = async () => false;
    //       return fn();
    //     }
    //   })
    // );
    // const filteredMessageList = fulfilledMessageList.filter(
    //   (_, index) => !filteredRes[index]
    // );
    // console.log('filteredMessageList', filteredMessageList, filteredRes);

    return { itemList: fulfilledMessageList, nextToken: token };
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
    return await IotaCatSDKObj.fetchAddressNames(addressList);
  }

  async hasUnclaimedNameNFT() {
    return await this._client!.hasUnclaimedNameNFT(this._proxyAddress!);
  }

  // get smr balance
  async getSMRBalance() {
    this._ensureWalletConnected();

    const res = await IotaSDK.request({
      method: 'iota_getBalance',
      params: {
        addressList: [this._address!],
        assetsList: ['smr'],
      },
    });
    this._lastTimeSdkRequestResultReceived = Date.now();
    return res as { amount: number };
  }

  async enteringGroupByGroupId(groupId: string) {}
  async sendMessage(
    groupId: string,
    messageText: string,
    isAnnouncement:boolean,
    isGroupPublic:boolean,
    memberList?: { addr: string; publicKey: string }[]
  ) {
    tracer.startStep('sendMessageToGroup','facade sendMessage');
    const address: Address = {
      type: ShimmerBech32Addr,
      addr: this._address!,
    };
    const message = await IotaCatSDKObj.prepareSendMessage(
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
  // async batchOutputIdToOutput(outputIds:string[]){
  async batchOutputIdToOutput(outputIds: string[]) {
    const res = await this._client!.batchOutputIdToOutput(outputIds);
    return res;
  }
  // async batchConvertOutputIdsToMessages(outputIds: string[], address: string): Promise<{ messages: IMessage[], missedMessageOutputIds: string[] }> {
  async batchConvertOutputIdsToMessages(outputIds: string[],onMessageCompleted: (msg: IMessage, outputId: string) => void) {
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
    const balance = await IotaCatSDKObj.fetchAddressBalance(addr);
    return balance ?? 0;
  }
  async fetchTokenTotalBalance(token: string, chainId: number) {
    const totalBalance = await IotaCatSDKObj.fetchTokenTotalBalance(token, chainId)
    return totalBalance
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

  async getRecommendGroups({
    includes,
    excludes,
  }: {
    includes?: IIncludesAndExcludes[];
    excludes?: IIncludesAndExcludes[];
  }) {
    this._ensureWalletConnected();
    const isEvm = this._isEvm();
    const res = (await IotaCatSDKObj.fetchAddressQualifiedGroupConfigs({
      address: this._address!,
      includes,
      excludes,
      ifSaveGroupConfigMap: false,
    })) as MessageGroupMeta[];
    let groups = res;
    if (isEvm) {
      groups = groups.filter(({ chainId }) => chainId != 0);
    } else {
      // Actually, there is no need to write the logic.
      // To fix test bug
      groups = groups.filter(({ chainId }) => chainId == 0);
    }
    const recommendGroups = groups
      .map((meta) => ({
        groupName: meta.groupName,
        groupId: IotaCatSDKObj._groupMetaToGroupId(meta),
        qualifyType: meta.qualifyType,
      }))
      .filter(({ groupId }) => groupId !== undefined) as RecommendGroup[];

    if (!this._isEvm) {
      return recommendGroups;
    }

    const evmQualifiedGroups = [];
    for (const group of recommendGroups) {
      const isOk = await this.filterEvmGroups(group.groupId);
      if (isOk) {
        evmQualifiedGroups.push(group);
      }
    }

    return evmQualifiedGroups;
  }

  async initialAddressQualifiedGroupConfigs({
    includes,
    excludes,
  }: {
    includes?: IIncludesAndExcludes[];
    excludes?: IIncludesAndExcludes[];
  }) {
    this._ensureWalletConnected();

    const res = await IotaCatSDKObj.fetchAddressQualifiedGroupConfigs({
      address: this._address!,
      includes,
      excludes,
      ifSaveGroupConfigMap: true,
    });
    console.log('initial Address Qualified Group Configs success');
    return res
      .map((meta) => ({
        groupName: meta.groupName,
        groupId: IotaCatSDKObj._groupMetaToGroupId(meta),
        qualifyType: meta.qualifyType,
      }))
      .filter(({ groupId }) => groupId !== undefined) as RecommendGroup[];
  }

  // fetchPublicGroupConfigs
  async fetchPublicGroupConfigs({
    includes,
    excludes,
  }: {
    includes?: IIncludesAndExcludes[];
    excludes?: IIncludesAndExcludes[];
  }) {
    const res = await IotaCatSDKObj.fetchPublicGroupConfigs({
      includes,
      excludes,
    });
    return res;
  }
  // batchFetchGroupIsPublic
  async batchFetchGroupIsPublic(groupIds: string[]): Promise<{ [key: string]: boolean }> {
    const res = await IotaCatSDKObj.batchFetchGroupIsPublic(groupIds);
    return res;
  }
  // upload image to s3    
  async uploadImageToS3({fileGetter, fileObj}: {fileGetter?: () => Promise<File>, fileObj?: File}): Promise<{ imageURL: string, dimensionsPromise: Promise<{ width: number; height: number }>, uploadPromise: Promise<void> }> {
    return await this._client!.uploadImageToS3({fileGetter, pairX: this._pairX!, 
      fileObj});
  }
  
  // fetchForMeGroupConfigs
  async fetchForMeGroupConfigs({includes, excludes}: {includes?: IIncludesAndExcludes[], excludes?: IIncludesAndExcludes[]}) {
    const res = await IotaCatSDKObj.fetchForMeGroupConfigs({address: this._address!, includes, excludes})
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

    const evmQualifiedConfigs = [];
    for (const config of configs) {
      if (config.isPublic) {
        evmQualifiedConfigs.push(config);
        continue
      }
      const isOk = await this.filterEvmGroups(config.groupId);
      if (isOk) {
        evmQualifiedConfigs.push(config);
      }
    }

    return evmQualifiedConfigs;
  }
  // fetchAddressMarkedGroupConfigs
  async fetchAddressMarkedGroupConfigs() {
    this._ensureWalletConnected();
    const res = await IotaCatSDKObj.fetchAddressMarkedGroupConfigs(
      this._address!
    );
    return res;
  }
  _client?: GroupfiSdkClient;

  _dappClient: any;

  setDappClient(dappClient: any) {
    this._dappClient = dappClient;
  }

  async setupGroupfiSdkClient() {
    this._client = new GroupfiSdkClient();
    if (this._storage) {
      this._client.setupStorage(this._storage)
    }
    await this._client!.setup();
  }

  async browseModeSetupClient() {
    await Promise.all([this.setupGroupfiSdkClient(), this.fetchChainList()])
    // this._client = new GroupfiSdkClient();
    // await this._client!.setup();

    this._address = undefined
    this._proxyAddress = undefined
    this._nodeId = undefined
    this._pairX = undefined
    this._mode = undefined
  }

  setupStorage(storage: StorageFacade) {
    this._storage = storage
  }

  async bootstrap(
    walletType: WalletType,
    metaMaskAccountFromDapp: string | undefined
  ): Promise<{
    address: string;
    mode: Mode;
    nodeId: number | undefined;
  }> {
    await Promise.all([this.setupGroupfiSdkClient(), this.fetchChainList()])
    // this._client = new GroupfiSdkClient();
    // await this._client!.setup();

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
      // res = await this.connectMetaMaskWallet()
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
    const res = await IotaCatSDKObj.fetchAddressPairX(this._address!);
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
    const pairX = await this._client!.decryptPairX({
      publicKey: publicKey,
      privateKeyEncrypted: privateKeyEncrypted,
    });
    this._pairX = pairX
    return pairX
  }

  async fetchRegisteredInfo(
    isPairXPresent: boolean
  ): Promise<RegisteredInfo | undefined> {
    const res = await IotaCatSDKObj.fetchAddressPairX(this._address!);
    console.log('===>fetchRegisteredInfo res', res, isPairXPresent);
    if (!res) {
      return undefined;
    }
    let registeredInfo: RegisteredInfo = {};
    if (res.mmProxyAddress) {
      registeredInfo[DelegationMode] = {
        account: res.mmProxyAddress,
      };
    }
    if (res.tpProxyAddress) {
      registeredInfo[ImpersonationMode] = {
        account: res.tpProxyAddress,
      };
    }
    if (isPairXPresent) {
      return registeredInfo;
    }
    if (this._pairX) {
      registeredInfo.pairX = this._pairX;
    } else {
      const pairX = await this._client!.decryptPairX({
        publicKey: res.publicKey,
        privateKeyEncrypted: res.privateKeyEncrypted,
      });
      this._pairX = pairX;
      registeredInfo.pairX = pairX;
    }
    return registeredInfo;
  }

  switchClientAdapter(mode: Mode) {
    const nodeUrlHint = `https://${INX_GROUPFI_DOMAIN}`;
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
          this._dappClient
        );
        this._client!.switchAdapter({ adapter, mode });
        return;
      }
    }
  }

  async initialAddress() {
    this._ensureWalletConnected();
    this._ensureMqttConnected();

    this.clearAddress();

    // shimmer mode, setup normally
    if (this._mode === ShimmerMode) {
      this._proxyAddress = this._address;
      this._client!.switchAddress(this._address!);
    } else if (this._mode === ImpersonationMode) {
      const proxy = await this.getSMRProxyAccount();
      if (proxy) {
        this._proxyAddress = proxy.bech32Address;
      }
    }
    // IotaCatSDKObj.switchMqttAddress(this._address!);
    // await this.initialAddressQualifiedGroupConfigs({});
  }

  subscribeToAllTopics() {
    IotaCatSDKObj.switchMqttAddress(this._address!);
  }

  unsubscribeToAllTopics() {
    IotaCatSDKObj.unsubscribeToAllTopics();
  }

  syncAllTopics(newAllTopics: string[]) {
    IotaCatSDKObj.syncAllTopics(newAllTopics);
  }

  setProxyModeInfo(modeInfo: ModeInfo) {
    if (!modeInfo.pairX || !modeInfo.detail) {
      return;
    }
    this._proxyAddress = modeInfo.detail.account;
    this._client!.switchAddress(this._proxyAddress, modeInfo.pairX);
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
      await this._client!.switchAddress(bech32Address, pairX);
      await this._client!.registerTanglePayPairX({
        pairX,
        metadataObjWithSignature,
      });
      this._pairX = pairX;
      (adapter as ImpersonationModeRequestAdapter).importProxyAccount();
    } else if (this._mode === DelegationMode) {
      const smrAddress = await (adapter as DelegationModeRequestAdapter).registerPairX(metadataObjWithSignature)
      this._proxyAddress = smrAddress
      this._pairX = pairX
    }
  }

  // register step three
  // async sendRegister(metadataObjWithSignature: Object) {
  //   const body = JSON.stringify(metadataObjWithSignature);
  //   // const res = await auxiliaryService.register(body);
  // }

  // async registerPairX(modeInfo: ModeInfo) {
  //   const pairX = modeInfo.pairX ?? generateSMRPair();
  //   if (this._mode === ImpersonationMode) {
  //     const adapter = this._client!.getRequestAdapter()  as ImpersonationModeRequestAdapter
  //     const {bech32Address} = await adapter.getProxyAccount();
  //     await this._client!.switchAddress(bech32Address, pairX);
  //     await this._client!.registerTanglePayPairX({
  //       evmAddress: this._address!,
  //       pairX,
  //     });
  //     this._pairX = pairX
  //     // import smr proxy account after registering pairX
  //     adapter.importProxyAccount()
  //   } else if (this._mode === DelegationMode) {
  //     const adapter = this._client!.getRequestAdapter()  as DelegationModeRequestAdapter
  //     const smrAddress = await adapter.registerPairX({pairX})
  //     this._proxyAddress = smrAddress
  //     this._pairX = pairX
  //   }
  // }

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

  async connectMetaMaskWallet(): Promise<{ address: string; mode: Mode }> {
    return new Promise((resolve, reject) => {
      if (typeof window.ethereum === undefined) {
        reject({
          name: 'MetaMaskUnintalled',
        });
      }
      const connect = async () => {
        try {
          const accounts = (await window.ethereum
            .request({ method: 'eth_requestAccounts' })
            .catch(() => {
              reject({
                name: 'MetaMaskConnectFailed',
              });
            })) as string[];
          console.log('trollbox connect metamask wallet accounts', accounts);
          const rawAccount = accounts[0];

          if (!rawAccount) {
            throw new Error();
          }

          // Uniformly convert EVM addresses to lowercase
          const account = rawAccount.toLowerCase();

          this._mode = DelegationMode;
          this._address = account;
          this._nodeId = undefined;
          resolve({
            mode: this._mode,
            address: this._address,
          });
        } catch (err) {
          reject({
            name: 'MetaMaskConnectFailed',
          });
        }
      };
      connect();
    });
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
    return await IotaCatSDKObj.fetchGroupVotesCount(groupId);
  }

  async voteGroup(groupId: string, vote: number) {
    this._ensureWalletConnected();
    groupId = IotaCatSDKObj._addHexPrefixIfAbsent(groupId);
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
    groupId = IotaCatSDKObj._addHexPrefixIfAbsent(groupId);
    const res = (await this._client!.unvoteGroup(groupId, this._address!)) as
      | TransactionRes
      | undefined;
    if (res === undefined) {
      throw new Error('unvote group error');
    }
    console.log('***unvoteGroup res', res);
    return res;
  }

  async waitOutput(outputId: string) {
    await IotaCatSDKObj.waitOutput(outputId);
  }
  // get user group
  async getUserGroupReputation(groupId: string): Promise<IGroupUserReputation> {
    const allUserGroup = await IotaCatSDKObj.fetchUserGroupReputation(
      groupId,
      this._address!
    );
    return allUserGroup;
  }
  async getGroupVoteRes(groupId: string) {
    this._ensureWalletConnected();
    groupId = IotaCatSDKObj._addHexPrefixIfAbsent(groupId);
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
    groupId = IotaCatSDKObj._addHexPrefixIfAbsent(groupId);
    this._ensureWalletConnected();
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
  }: {
    groupId: string;
    publicKey: string;
    memberList: { addr: string; publicKey: string }[];
    qualifyList?: { addr: string; publicKey: string }[];
  }) {
    groupId = IotaCatSDKObj._addHexPrefixIfAbsent(groupId);
    this._ensureWalletConnected();
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
      qualifyList,
    })) as TransactionRes | undefined;
    return res;
  }
  // getGroupEvmQualifiedList
  async getGroupEvmQualifiedList(groupId: string) {
    this._ensureWalletConnected();
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
    // this._ensureWalletConnected();
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
    const addressType = getEvmOrSolanaAddressType(this._address!);
    return await this._client!._getEvmQualify(groupId, addressList, signature, addressType,timestamp);
  }
  async leaveOrUnMarkGroup(groupId: string) {
    groupId = IotaCatSDKObj._addHexPrefixIfAbsent(groupId);
    this._ensureWalletConnected();
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
  async isQualified(groupId: string) {
    this._ensureWalletConnected();
    const isEvm = this._isEvm();
    if (isEvm) {
      return await this._isEvmQualified(groupId);
    }
    const ipfsOrigins = await IotaCatSDKObj.fetchIpfsOrigins(this._address!);
    const qualifiedGroups = await IotaCatSDKObj.fetchAddressQualifiedGroups(
      this._address!,
      ipfsOrigins
    );
    return !!qualifiedGroups.find(
      (qualifiedGroup) =>
        qualifiedGroup.groupId === IotaCatSDKObj._addHexPrefixIfAbsent(groupId)
    );
  }
  async _isEvmQualified(groupId: string) {
    const address = this._address!;
    return await IotaCatSDKObj.isEvmAddressQualifiedForGroup(address, groupId);
  }

  // _addHexPrefixIfAbsent
  addHexPrefixIfAbsent(str: string) {
    return IotaCatSDKObj._addHexPrefixIfAbsent(str);
  }
  async fetchAddressMarkedGroups() {
    // call sdkobj fetchAddressMarkGroups
    const markedGroups = await IotaCatSDKObj.fetchAddressMarkGroups(
      this._address!
    );
    return markedGroups;
  }

  async getAddressMarkedGroupsWithGroupName() {
    const markedGroups = await this.fetchAddressMarkedGroups();
    return markedGroups
      .map((groupId) => {
        groupId = groupId.startsWith('0x') ? groupId.slice(2) : groupId;
        const groupMeta = IotaCatSDKObj._groupIdToGroupMeta(groupId);
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
    const markedGroupIds = await this.fetchAddressMarkedGroups();
    // log markedGroupIds
    console.log('markedGroupIds', markedGroupIds, groupId);
    for (const markedGroupId of markedGroupIds) {
      if (
        IotaCatSDKObj._addHexPrefixIfAbsent(markedGroupId) ==
        IotaCatSDKObj._addHexPrefixIfAbsent(groupId)
      ) {
        return true;
      }
    }
    return false;
  }

  getGroupMetaByGroupId(groupId: string) {
    return IotaCatSDKObj._groupIdToGroupMeta(groupId);
  }

  async isGroupPublic(groupId: string) {
    return await IotaCatSDKObj.checkIsGroupPublicFromSharedApiCall(groupId!);
  }

  async loadAddressMemberGroups(address: string) {
    // this._ensureWalletConnected();
    const groupIds = await IotaCatSDKObj.fetchAddressMemberGroups(
      address
    );
    const groups = groupIds
      .map((groupId) => ({
        groupId,
        groupName: this.groupIdToGroupName(groupId),
      }))
      .filter(({ groupName }) => groupName !== undefined);
    return groups as { groupId: string; groupName: string }[];
  }


  async loadGroupMemberAddresses(groupId: string) {
    // this._ensureWalletConnected();
    return await IotaCatSDKObj.fetchGroupMemberAddresses(groupId);
  }

  async loadAddressPublicKey() {
    this._ensureWalletConnected();
    return await IotaCatSDKObj.fetchAddressPublicKey(this._proxyAddress!);
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
    const blackListedAddresseHashs = await IotaCatSDKObj.fetchGroupBlacklist(
      groupId
    );
    return !!blackListedAddresseHashs.find((blackListedAddressHash) => {
      const addressHash = IotaCatSDKObj._sha256Hash(this._address!);
      return blackListedAddressHash === addressHash;
    });
  }

  async muteGroupMember(groupId: string, memberAddress: string) {
    this._ensureWalletConnected();
    groupId = IotaCatSDKObj._addHexPrefixIfAbsent(groupId);
    const memberAddrHash = IotaCatSDKObj._addHexPrefixIfAbsent(
      IotaCatSDKObj._sha256Hash(memberAddress)
    );
    // call client muteGroupMember(groupId, addrHash)
    const muteGroupMemberRes = (await this._client!.muteGroupMember(
      groupId,
      memberAddrHash,
      this._address!
    )) as TransactionRes | undefined;
    this._updateMuteMap(groupId, memberAddrHash);
    // if (muteGroupMemberRes !== undefined) {
    //   await IotaCatSDKObj.waitOutput(muteGroupMemberRes.outputId);
    //   this._updateMuteMap(groupId, memberAddrHash);
    // }
  }

  // likeGroupMember
  async likeGroupMember(groupId: string, memberAddress: string) {
    this._ensureWalletConnected();
    groupId = IotaCatSDKObj._addHexPrefixIfAbsent(groupId);
    const memberAddrHash = IotaCatSDKObj._addHexPrefixIfAbsent(
      IotaCatSDKObj._sha256Hash(memberAddress)
    );
    // call client likeGroupMember(groupId, addrHash)
    const likeGroupMemberRes = (await this._client!.likeGroupMember(
      groupId,
      memberAddrHash,
      this._address!
    )) as TransactionRes | undefined;
    // if (likeGroupMemberRes !== undefined) {
    //   await IotaCatSDKObj.waitOutput(likeGroupMemberRes.outputId);
    // }
  }

  // unlikeGroupMember
  async unlikeGroupMember(groupId: string, memberAddress: string) {
    this._ensureWalletConnected();
    groupId = IotaCatSDKObj._addHexPrefixIfAbsent(groupId);
    const memberAddrHash = IotaCatSDKObj._addHexPrefixIfAbsent(
      IotaCatSDKObj._sha256Hash(memberAddress)
    );
    // call client unlikeGroupMember(groupId, addrHash)
    const unlikeGroupMemberRes = (await this._client!.unlikeGroupMember(
      groupId,
      memberAddrHash,
      this._address!
    )) as TransactionRes | undefined;
    // if (unlikeGroupMemberRes !== undefined) {
    //   await IotaCatSDKObj.waitOutput(unlikeGroupMemberRes.outputId);
    // }
  }
  
  async unMuteGroupMember(groupId: string, memberAddress: string) {
    this._ensureWalletConnected();
    groupId = IotaCatSDKObj._addHexPrefixIfAbsent(groupId);
    const memberAddrHash = IotaCatSDKObj._addHexPrefixIfAbsent(
      IotaCatSDKObj._sha256Hash(memberAddress)
    );

    // call client unmuteGroupMember(groupId, addrHash)
    const unmuteGroupMemberRes = (await this._client!.unmuteGroupMember(
      groupId,
      memberAddrHash,
      this._address!
    )) as TransactionRes | undefined;
    this._lastTimeSdkRequestResultReceived = Date.now();
    this._updateMuteMap(groupId, memberAddrHash);
    // if (unmuteGroupMemberRes !== undefined) {
    //   await IotaCatSDKObj.waitOutput(unmuteGroupMemberRes.outputId);
    //   this._updateMuteMap(groupId, memberAddrHash);
    // }
  }

  setupIotaMqttConnection(mqttClient: any) {
    return IotaCatSDKObj.setupIotaMqttConnection(mqttClient);
  }

  async getAddressStatusInGroup(groupId: string): Promise<{
    isGroupPublic: boolean;
    isQualified: boolean;
    marked: boolean;
    muted: boolean;
  }> {
    this._ensureWalletConnected();
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
    return IotaCatSDKObj.groupIdToGroupName(groupId);
  }

  sha256Hash(address: string) {
    return IotaCatSDKObj._sha256Hash(address);
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
    const res = await IotaCatSDKObj.fetchPublicMessageOutputList(
      groupId,
      direction,
      startToken,
      endToken,
      size
    );
    return res;
  }

  async checkIsRegisteredInServiceEnv(publicKey: string, proxyAddressToConfirm: string) {
    if (this._mode !== DelegationMode) {
      return true
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

  async outputIdstoMessages(
    params:MessageResponseItemPlus[]) {
      // set address
      params.forEach((item) => {
        item.address = this._address!
      })
    return await this._client!.outputIdstoMessages(params);
  }

  
  _chainList?:ChainList = undefined
  async fetchChainList() {
    if (this._chainList === undefined) {
      this._chainList = await this._auxiliaryService.getChainList()
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
}

const intance = new GroupFiSDKFacade();

export default intance;
