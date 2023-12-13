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
} from 'iotacat-sdk-core';

import { SimpleDataExtended, objectId } from 'iotacat-sdk-utils';

export { SimpleDataExtended };

import { MessageBody } from 'iotacat-sdk-client';
import { ImInboxEventTypeNewMessage } from 'iotacat-sdk-core';
import { ImInboxEventTypeGroupMemberChanged } from 'iotacat-sdk-core';
import { EventItemFullfilled } from 'iotacat-sdk-client';
import { EventItemFromFacade } from 'iotacat-sdk-core';
import { PushedValue } from 'iotacat-sdk-core';
import { PushedNewMessage } from 'iotacat-sdk-core';

export interface TransactionRes {
  blockId: string;
  outputId: string;
}

export interface RecommendGroup {
  groupId: string;
  groupName: string;
  qualifyType: string;
}

class GroupFiSDKFacade {
  private _address: string | undefined;

  private _mqttConnected: boolean = false;

  getUserAddress() {
    return this._address;
  }

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

  async handlePushedMessage(pushed: PushedNewMessage): Promise<IMessage | undefined> {
    const { type, groupId } = pushed;

    if (type === ImInboxEventTypeNewMessage) {
      const { sender, meta } = pushed;

      const res = await IotaSDK.request({
        method: 'iota_im_p2p_pushed',
        params: {
          content: {
            addr: this._address!,
            pushed: {
              meta,
              sender,
            },
          },
        },
      });
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

  listenningNewEventItem(callback: (message: EventItemFromFacade) => void): () => void {
    this._ensureWalletConnected();
    if (!this._mqttConnected) {
      throw new Error('MQTT not connected');
    }
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

  async setupMqttConnection(connect: any) {
    IotaCatSDKObj.setupMqttConnection(connect);
    IotaCatSDKObj.switchMqttAddress(this._address!);
    // log switchMqttAddress
    console.log('switchMqttAddress', this._address);
    this._mqttConnected = true;
  }

  listenningAccountChanged(callback: (address: string) => void) {
    const listener = async (accountChangeEvent: {
      address: string;
      nodeId: number;
    }) => {
      const { address } = accountChangeEvent;
      // 第一次选择地址，也会触发这个函数，如果地址一样，就不用触发吧
      if(address === this._address) {
        return
      }
      console.log('accountsChanged', address)

      // TP 的问题：每次切换新地址之后，都需要重新执行一下 connectWallet request，不然会报错，not authorized
      await IotaSDK.request({
        method: 'iota_connect',
        params: {
          // expires: 3000000
        },
      })

      console.log('accountsChanged and connect wallet using new address successfully', address)

      this._onAccountChanged(address);
      callback(address);
    };
    IotaSDK.on('accountsChanged', listener);
    return () => IotaSDK.removeListener('accountsChanged', listener);
  }

  _onAccountChanged(newAddress: string) {
    this._address = newAddress;
    this._muteMap = undefined;
    IotaCatSDKObj.switchMqttAddress(newAddress);
  }

  // getInboxMessage
  async getInboxItems(
    continuationToken?: string,
    limit = 3
  ): Promise<{ itemList: EventItemFromFacade[]; nextToken?: string }> {
    this._ensureWalletConnected();
    const resstr = (await IotaSDK.request({
      method: 'iota_im_groupinboxitemlist',
      params: {
        content: {
          addr: this._address!,
          continuationToken,
          limit,
        },
      },
    })) as string | undefined;
    if (!resstr) {
      return { itemList: [] };
    }
    console.log('***iota_im_groupinboxmessagelist success', resstr);
    const res = JSON.parse(resstr) as {
      itemList: (MessageBody|EventGroupMemberChanged)[];
      token?: string;
    };
    console.log('***iota_im_groupinboxmessagelist success', res);
    const itemList = res.itemList;
    const token = res.token;
    // log
    console.log('itemList', itemList);
    const fulfilledMessageList:EventItemFromFacade[] =
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
    const filteredRes = await Promise.all(
      fulfilledMessageList.map((item) => {
        if (item.type === ImInboxEventTypeNewMessage) {
          const msg = item as IMessage;
          return this.filterMutedMessage(msg.groupId, msg.sender)
        } else if (item.type === ImInboxEventTypeGroupMemberChanged) {
          const fn = async () => false;
          return fn();
        }
      })
    );
    const filteredMessageList = fulfilledMessageList.filter(
      (_, index) => !filteredRes[index]
    );
    console.log('filteredMessageList', filteredMessageList, filteredRes);

    return { itemList: filteredMessageList, nextToken: token };
  }
  async ensureGroupHaveSharedOutput(groupId: string) {
    try {
      const res = await IotaSDK.request({
        method: 'iota_im_ensure_group_shared',
        params: {
          content: {
            addr: this._address!,
            groupId,
          },
        },
      });
      console.log('ensureGroupHasShared res', res);
    } catch (error) {
      console.log('ensureGroupHasShared error', error);
    }
  }
  async consolidateGroupMessages(groupId: string) {
    try {
      const res = await IotaSDK.request({
        method: 'iota_im_check_and_consolidate_messages',
        params: {
          content: {
            addr: this._address!,
            groupId,
          },
        },
      });
    } catch (error) {
      console.log('consolidateMessages error', error);
    }
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
    return res as {amount:number};
  }
  async enteringGroupByGroupId(groupId: string) {
    const [ensureRes] = await Promise.all([
      this.ensureGroupHaveSharedOutput(groupId),
      //this.consolidateGroupMessages(groupId),
    ]);
    console.log('enteringGroupByGroupId ensureRes', ensureRes);
  }
  async sendMessage(groupId: string, messageText: string) {
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

    const res = await IotaSDK.request({
      method: 'iota_im',
      params: {
        content: {
          dappName: 'trollbox',
          addr: this._address!,
          groupId,
          message,
        },
      },
    });
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
      includes: includes?.map(g => ({groupName: g})),
      excludes: excludes?.map(g => ({groupName: g})),
    });
    return res
      .map(({ groupName, qualifyType }) => ({
        groupName,
        groupId: IotaCatSDKObj._groupToGroupId(groupName),
        qualifyType: qualifyType,
      }))
      .filter(({ groupId }) => groupId !== undefined) as RecommendGroup[];
  }

  async bootstrap() {
    const res = await this.waitWalletReadyAndConnectWallet();
    await this.fetchAddressQualifiedGroupConfigs({});
    return res;
  }

  async waitWalletReadyAndConnectWallet(): Promise<{ address: string }> {
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
            })) as { address: string; nodeId: string };
            console.log('****iota connect', res);
            this._address = res.address;
            resolve(res);
          } catch (error) {
            reject(null);
          }
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
    const res = (await IotaSDK.request({
      method: 'iota_im_voteGroup',
      params: {
        content: {
          addr: this._address!,
          groupId,
          vote,
        },
      },
    })) as TransactionRes | undefined;
    if (res === undefined) {
      throw new Error('voteGruop res');
    }
    console.log('***voteGroup res', res);
    return res;
  }

  async unvoteGroup(groupId: string) {
    this._ensureWalletConnected();
    const res = (await IotaSDK.request({
      method: 'iota_im_unvoteGroup',
      params: {
        content: {
          addr: this._address!,
          groupId,
        },
      },
    })) as TransactionRes | undefined;
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
    const allGroupVotes = (await IotaSDK.request({
      method: 'iota_im_getAllGroupVotes',
      params: {
        content: {
          addr: this._address,
        },
      },
    })) as Array<{
      groupId: string;
      vote: number;
    }>;

    return allGroupVotes.find((groupVote) => groupVote.groupId === groupId)
      ?.vote;
  }

  async joinGroup({groupId,memberList,publicKey}:{groupId: string,publicKey:string,memberList:{addr:string,publicKey:string}[]}) {
    this._ensureWalletConnected();
    const isAlreadyInMemberList = memberList.find(o=>o.addr === this._address!);
    if (isAlreadyInMemberList) return true;
    memberList.push({addr:this._address!,publicKey});
    const res = (await IotaSDK.request({
      method: 'iota_im_mark_group',
      params: {
        content: {
          addr: this._address!,
          groupId,
          memberList,
        },
      },
    })) as TransactionRes | undefined;
    return res;
    // if (res !== undefined) {
    //   await IotaCatSDKObj.waitOutput(res.outputId);
    // }
  }

  async leaveGroup(groupId: string) {
    this._ensureWalletConnected();
    const res = (await IotaSDK.request({
      method: 'iota_im_unmark_group',
      params: {
        content: {
          addr: this._address!,
          groupId,
        },
      },
    })) as TransactionRes | undefined;
    return res;
    // if (res !== undefined) {
    //   await IotaCatSDKObj.waitOutput(res.outputId);
    // }
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
  async getAllMarkedGroups() {
    this._ensureWalletConnected();

    console.log('iota_im_getMarkedGroupIds start', this._address)

    const markedGroupIds = (await IotaSDK.request({
      method: 'iota_im_getMarkedGroupIds',
      params: {
        content: {
          addr: this._address,
        },
      },
    })) as Array<{ groupId: string }>;

    console.log('iota_im_getMarkedGroupIds end', markedGroupIds)
    
    return markedGroupIds.map((g) => ({
      groupId: g.groupId,
      groupName: IotaCatSDKObj.groupIdToGroupName(g.groupId) ?? 'unknown',
    }));
  }

  async marked(groupId: string) {
    this._ensureWalletConnected();
    const markedGroupIds = await this.getAllMarkedGroups()

    return !!(markedGroupIds ?? []).find(
      (markedGroup) => markedGroup.groupId === groupId
    );
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
  // call sdk iota_im_send_anyone_toself
  async sendAnyOneToSelf() {
    // log
    console.log('***Enter sendAnyOneToSelf, address', this._address!);
    try {
      const res = await IotaSDK.request({
        method: 'iota_im_send_anyone_toself',
        params: {
          content: {
            addr: this._address!,
          },
        },
      });
    
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
    const muteGroupMemberRes = (await IotaSDK.request({
      method: 'iota_im_muteGroupMember',
      params: {
        content: {
          addr: this._address!,
          groupId: groupId,
          addrHash: memberAddrHash,
        },
      },
    })) as TransactionRes | undefined;
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
    const unmuteGroupMemberRes = (await IotaSDK.request({
      method: 'iota_im_unmuteGroupMember',
      params: {
        content: {
          addr: this._address!,
          groupId: groupId,
          addrHash: memberAddrHash,
        },
      },
    })) as TransactionRes | undefined;
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
    const AllUserMuteGroupMembers = (await IotaSDK.request({
      method: 'iota_im_getAllUserMuteGroupMembers',
      params: {
        content: {
          addr: this._address!,
          addrHash: IotaCatSDKObj._sha256Hash(this._address!),
        },
      },
    })) as IMUserMuteGroupMember[];

    return AllUserMuteGroupMembers;
  }
}

const intance = new GroupFiSDKFacade();

export default intance;
