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
} from 'iotacat-sdk-core';

import { SimpleDataExtended, objectId } from 'iotacat-sdk-utils';
import { GroupfiSdkClient, MessageBody } from 'groupfi-sdk-client';

export { SimpleDataExtended };

const NAMING_DOMAIN = 'api.groupfi.ai';

export interface TransactionRes {
  blockId: string;
  outputId: string;
}

export interface RecommendGroup {
  groupId: string;
  groupName: string;
  qualifyType: string;
}

const SHIMMER_MAINNET_ID = 102
const SUPPORTED_CHAIN_ID_LIST = [SHIMMER_MAINNET_ID]

class GroupFiSDKFacade {
  private _address: string | undefined;

  private _mqttConnected: boolean = false;

  private _lastTimeSdkRequestResultSent: number = 0;
  private _lastTimeSdkRequestResultReceived: number = 0;

  private _currentGroup:
    | {
        groupName: string;
        groupId: string;
      }
    | undefined = undefined;  

  get currentGroupName() {
    return this._currentGroup?.groupName;
  }

  get currentGroupId() {
    return this._currentGroup?.groupId;
  }

  checkIsChainSupported(nodeId: number) {
    return SUPPORTED_CHAIN_ID_LIST.includes(nodeId)
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

  async getGroupMuteMembersFromMuteMap(groupId: string) {
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
    return this._muteMap[groupId] ?? [];
  }

  async filterMutedMessage(groupId: string, sender: string) {
    const mutedMembers = await this.getGroupMuteMembersFromMuteMap(groupId);
    console.log(
      '***Enter filterMutedMessage',
      mutedMembers,
      sender,
      this.sha256Hash(sender)
    );
    if (mutedMembers.includes(this.sha256Hash(sender))) {
      return true;
    }
    return false;
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
      };

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

  listenningNewEventItem(
    callback: (message: EventItemFromFacade) => void
  ): () => void {
    this._ensureWalletConnected();
    this._ensureMqttConnected();
    // if (!this._mqttConnected) {
    //   throw new Error('MQTT not connected');
    // }
    // log listenningNewEventItem
    console.log('***Enter listenningNewEventItem');
    const listener = async (pushed: PushedValue) => {
      console.log('pushed', pushed);
      let item: EventItemFromFacade | undefined = undefined;
      if (pushed.type == ImInboxEventTypeNewMessage) {
        item = await this.handlePushedMessage(pushed);
      } else if (pushed.type == ImInboxEventTypeGroupMemberChanged) {
        item = pushed;
      }
      if (item) {
        callback(item);
      }
    };
    IotaCatSDKObj.on('inbox', listener);
    return () => IotaCatSDKObj.off('inbox', listener);
  }

  // async setupMqttConnection(connect: any) {
  //   IotaCatSDKObj.setupMqttConnection(connect);
  //   IotaCatSDKObj.switchMqttAddress(this._address!);
  //   // log switchMqttAddress
  //   console.log('switchMqttAddress', this._address);
  //   this._mqttConnected = true;
  // }

  async setupMqttConnection(connect: any) {
    IotaCatSDKObj.setupMqttConnection(connect);
    // IotaCatSDKObj.switchMqttAddress(this._address!);
    // // log switchMqttAddress
    // console.log('switchMqttAddress', this._address);
    this._mqttConnected = true;
  }

  listenningAccountChanged(
    callback: (params: { address: string; nodeId: number }) => void
  ) {
    const listener = async (accountChangeEvent: {
      address: string;
      nodeId: number;
    }) => {
      const { address, nodeId } = accountChangeEvent;
      // 第一次选择地址，也会触发这个函数，如果地址一样，就不用触发吧
      if (address === this._address) {
        return;
      }
      console.log('accountsChanged', { address, nodeId });
      // TP 的问题：每次切换新地址之后，都需要重新执行一下 connectWallet request，不然会报错，not authorized
      await IotaSDK.request({
        method: 'iota_connect',
        params: {
          // expires: 3000000
        },
      });
      console.log(
        'accountsChanged and connect wallet using new address successfully',
        address
      );

      await this._onAccountChanged({ address, nodeId });
      callback({ address, nodeId });
    };
    IotaSDK.on('accountsChanged', listener);
    return () => IotaSDK.removeListener('accountsChanged', listener);
  }

  async _onAccountChanged({
    address: newAddress,
    nodeId,
  }: {
    address: string;
    nodeId: number;
  }) {
    this._address = newAddress;
    this.clearAddress();

    await this.initialAddress(nodeId);

    // this._address = newAddress;
    // this._muteMap = undefined;
    // await this.fetchAddressQualifiedGroupConfigs({});
    // IotaCatSDKObj.switchMqttAddress(newAddress);
    // this._client!.switchAddress(this._address!);
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
  processOneMessage(item: MessageResponseItem): boolean {
    const pipe = this._client!.getOutputIdToMessagePipe();
    const res = pipe.write({
      outputId: item.outputId,
      address: this._address!,
      type: 1,
    });
    return res;
  }
  // registerMessageCallback
  registerMessageCallback(
    callback: (param: { message: IMessage; outputId: string }) => void
  ) {
    const listener = (
      param: { message: IMessage; outputId: string } | undefined
    ) => {
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
          message: res.message.data,
          messageId: res.messageId,
          timestamp: res.message.timestamp,
          groupId: res.message.groupId,
        }
      : undefined;
    return message! as IMessage;
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

  async mintNicknameNFT(name: string): Promise<{
    result: boolean;
    blockId?: string;
    errCode?: number;
    reason?: string;
  }> {
    this._ensureWalletConnected();
    const res = await fetch(
      `https://${NAMING_DOMAIN}/mint_nicknft?address=${this._address}&name=${name}`
    );
    const json = (await res.json()) as {
      result: boolean;
      block_id: string;
      'err-msg'?: string;
      'err-code'?: number;
    };
    if (!json.result) {
      return {
        result: false,
        errCode: json['err-code'],
        reason: json['err-msg'],
      } as { result: boolean; reason: string };
    }
    // const blockMetadata = await IotaCatSDKObj.waitBlock(json.block_id!)
    return {
      result: true,
      blockId: json.block_id,
    };
  }

  async fetchAddressNames(addressList: string[]) {
    return await IotaCatSDKObj.fetchAddressNames(addressList);
  }

  async checkIfhasOneNicknameNft() {
    this._ensureWalletConnected();
    return await this._client!.checkIfhasOneNicknameNft(this._address!);
  }

  async hasUnclaimedNameNFT() {
    return await this._client!.hasUnclaimedNameNFT(this._address!);
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
    memberList?: { addr: string; publicKey: string }[]
  ) {
    const address: Address = {
      type: ShimmerBech32Addr,
      addr: this._address!,
    };
    const groupName = IotaCatSDKObj.groupIdToGroupName(groupId);
    const message = await IotaCatSDKObj.prepareSendMessage(
      address,
      groupName!,
      messageText
    );
    if (!message) throw new Error('prepareSendMessage error');
    // call client sendMessage(addr, groupId, message)
    const res = await this._client!.sendMessage(
      this._address!,
      groupId,
      message!,
      memberList
    );
    this._lastTimeSdkRequestResultReceived = Date.now();
    console.log('send message res', res);
    return res;
  }
  async fetchAddressBalance() {
    this._ensureWalletConnected();
    const balance = await IotaCatSDKObj.fetchAddressBalance(this._address!);
    return balance ?? 0;
  }
  _ensureWalletConnected() {
    if (!this._address) {
      throw new Error('Wallet not connected.');
    }
  }

  _ensureMqttConnected() {
    if (!this._mqttConnected) {
      throw new Error('MQTT not connected');
    }
  }
  
  // TODO: It's temporary, it will be adjusted later.
  async getRecommendGroups({
    includes,
    excludes,
  }: {
    includes?: string[];
    excludes?: string[];
  }) {
    this._ensureWalletConnected();

    const res = await IotaCatSDKObj.fetchAddressQualifiedGroupConfigsWithoutSetting({
      address: this._address!,
      includes: includes?.map((g) => ({ groupName: g })),
      excludes: excludes?.map((g) => ({ groupName: g })),
    });
    return res
      .map(({ groupName, qualifyType }) => ({
        groupName,
        groupId: IotaCatSDKObj._groupToGroupId(groupName),
        qualifyType: qualifyType,
      }))
      .filter(({ groupId }) => groupId !== undefined) as RecommendGroup[];
  }

  async fetchAddressQualifiedGroupConfigs({
    includes,
    excludes,
  }: {
    includes?: string[];
    excludes?: string[];
  }) {
    this._ensureWalletConnected();

    const res = await IotaCatSDKObj.fetchAddressQualifiedGroupConfigs({
      address: this._address!,
      includes: includes?.map((g) => ({ groupName: g })),
      excludes: excludes?.map((g) => ({ groupName: g })),
    });
    return res
      .map(({ groupName, qualifyType }) => ({
        groupName,
        groupId: IotaCatSDKObj._groupToGroupId(groupName),
        qualifyType: qualifyType,
      }))
      .filter(({ groupId }) => groupId !== undefined) as RecommendGroup[];
  }

  _client?: GroupfiSdkClient;
  async bootstrap() {
    this._client = new GroupfiSdkClient();
    const res = await this.waitWalletReadyAndConnectWallet();
    await this._client!.setup();
    // await Promise.all([
    //   this.fetchAddressQualifiedGroupConfigs({}),
    //   this._client!.setup(),
    // ]);
    // this._client!.switchAddress(this._address!);

    await this.initialAddress(res.nodeId);
    return res;
  }

  async initialAddress(nodeId: number) {
    this._ensureWalletConnected();
    this._ensureMqttConnected();

    if (this.checkIsChainSupported(nodeId)) {
      IotaCatSDKObj.switchMqttAddress(this._address!);
      await this.fetchAddressQualifiedGroupConfigs({});
      this._client!.switchAddress(this._address!);
    }
  }

  clearAddress() {
    this._muteMap = undefined;
  }

  async waitWalletReadyAndConnectWallet(): Promise<{
    address: string;
    nodeId: number;
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
            console.log('****iota connect', res);
            this._lastTimeSdkRequestResultReceived = Date.now();
            this._address = res.address;
            resolve(res);
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
      IotaSDK._events.on('iota-ready', listener);
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
    const res = (await this._client!.voteGroup(groupId, vote)) as
      | TransactionRes
      | undefined;
    if (res === undefined) {
      throw new Error('voteGruop res');
    }
    console.log('***voteGroup res', res);
    return res;
  }

  async unvoteGroup(groupId: string) {
    this._ensureWalletConnected();
    const res = (await this._client!.unvoteGroup(groupId)) as
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
    const allGroupVotes = (await this._client!.getAllGroupVotes()) as Array<{
      groupId: string;
      vote: number;
    }>;
    return allGroupVotes.find((groupVote) => groupVote.groupId === groupId)
      ?.vote;
  }

  async markGroup(groupId: string) {
    this._ensureWalletConnected();
    const res = (await this._client!.markGroup({ groupId })) as
      | TransactionRes
      | undefined;
    return res;
  }

  async joinGroup({
    groupId,
    memberList,
    publicKey,
  }: {
    groupId: string;
    publicKey: string;
    memberList: { addr: string; publicKey: string }[];
  }) {
    this._ensureWalletConnected();
    const isAlreadyInMemberList = memberList.find(
      (o) => o.addr === this._address!
    );
    if (isAlreadyInMemberList) return true;
    memberList.push({ addr: this._address!, publicKey });
    const res = (await this._client!.markGroup({ groupId, memberList })) as
      | TransactionRes
      | undefined;
    return res;
  }

  async leaveOrUnMarkGroup(groupId: string) {
    this._ensureWalletConnected();
    const res = (await this._client!.unmarkGroup(groupId)) as
      | TransactionRes
      | undefined;
    return res;
  }

  // get current address
  getCurrentAddress() {
    this._ensureWalletConnected();
    return this._address!;
  }
  async isQualified(groupId: string) {
    this._ensureWalletConnected();
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
    this._ensureWalletConnected();
    return await IotaCatSDKObj.checkIsGroupPublicFromSharedApiCall(groupId!);
  }

  async loadAddressMemberGroups(address?: string) {
    this._ensureWalletConnected();
    const groupIds = await IotaCatSDKObj.fetchAddressMemberGroups(
      address ?? this._address!
    );
    const groups = groupIds.map((groupId) => ({
      groupId,
      groupName: this.groupIdToGroupName(groupId) ?? 'unknown',
    }));
    return groups;
  }

  groupNameToGroupId(groupName: string) {
    return IotaCatSDKObj._groupToGroupId(groupName);
  }

  async loadGroupMemberAddresses(groupId: string) {
    this._ensureWalletConnected();
    return await IotaCatSDKObj.fetchGroupMemberAddresses(groupId);
  }

  async loadAddressPublicKey() {
    this._ensureWalletConnected();
    return await IotaCatSDKObj.fetchAddressPublicKey(this._address!);
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
    console.log('****muteGroupMember start');
    const memberAddrHash = IotaCatSDKObj._sha256Hash(memberAddress);
    // call client muteGroupMember(groupId, addrHash)
    const muteGroupMemberRes = (await this._client!.muteGroupMember(
      groupId,
      memberAddrHash
    )) as TransactionRes | undefined;
    console.log('****muteGroupMember res', muteGroupMemberRes);
    this._updateMuteMap(groupId, memberAddrHash);
    return muteGroupMemberRes;
    // if (muteGroupMemberRes !== undefined) {
    //   await IotaCatSDKObj.waitOutput(muteGroupMemberRes.outputId);
    // }
  }

  async unMuteGroupMember(groupId: string, memberAddress: string) {
    this._ensureWalletConnected();
    const memberAddrHash = IotaCatSDKObj._sha256Hash(memberAddress);

    // call client unmuteGroupMember(groupId, addrHash)
    const unmuteGroupMemberRes = (await this._client!.unmuteGroupMember(
      groupId,
      memberAddrHash
    )) as TransactionRes | undefined;
    this._lastTimeSdkRequestResultReceived = Date.now();
    console.log('****unmuteGroupMember res', unmuteGroupMemberRes);
    this._updateMuteMap(groupId, memberAddrHash);
    return unmuteGroupMemberRes;
    // if (unmuteGroupMemberRes !== undefined) {
    //   await IotaCatSDKObj.waitOutput(unmuteGroupMemberRes.outputId);
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
    /*
    console.log('isGroupPublic start calling');
    const isGroupPublic = await this.isGroupPublic(groupId);
    console.log('isGroupPublic end calling', isGroupPublic);
    console.log('isQualified start calling');
    const isQualified = await this.isQualified(groupId);
    console.log('isQualified end calling', isQualified);
    console.log('marked start calling');
    const marked = await this.marked(groupId);
    console.log('marked end calling', marked);
    console.log('muted start calling');
    const muted = await this.isBlackListed(groupId);
    console.log('muted end calling', muted);
    */
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
      (await this._client!.getAllUserMuteGroupMembers()) as IMUserMuteGroupMember[];
    this._lastTimeSdkRequestResultReceived = Date.now();
    return AllUserMuteGroupMembers;
  }
}

const intance = new GroupFiSDKFacade();

export default intance;
