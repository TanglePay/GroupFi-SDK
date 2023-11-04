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
} from 'iotacat-sdk-core';
import client from 'iotacat-sdk-client';

import { SimpleDataExtended, objectId } from 'iotacat-sdk-utils';

export { SimpleDataExtended };

import { MessageBody } from 'iotacat-sdk-client';

interface TransactionRes {
  blockId: string;
  outputId: string;
}

class GroupFiSDKFacade {
  private _bootstraped: boolean = false;

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

  async handlePushedMessage(pushed: any): Promise<IMessage | undefined> {
    const { type, groupId } = pushed;

    if (type === 1) {
      throw new Error('type 1 not supported for pushed message');
    } else if (type === 2) {
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
        messageId: resUnwrapped.messageId,
        groupId: resUnwrapped.message.groupId,
        sender: resUnwrapped.sender,
        message: resUnwrapped.message.data,
        timestamp: resUnwrapped.message.timestamp,
      };
      return message;
    }

    return undefined;
  }

  listenningNewMessage(callback: (message: IMessage) => void): () => void {
    this._ensureWalletConnected();
    if (!this._mqttConnected) {
      throw new Error('MQTT not connected');
    }
    const listener = async (pushed: any) => {
      console.log('pushed', pushed);
      const pushedMessage = await this.handlePushedMessage(pushed);
      if (pushedMessage) {
        callback(pushedMessage);
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

  async enteringGroup(groupName: string) {
    const groupId = IotaCatSDKObj._groupToGroupId(groupName);
    if (groupId === undefined) {
      throw new Error('Group id not exists');
    }
    const meta = IotaCatSDKObj._groupIdToGroupMeta(groupId);
    if (!meta) {
      throw new Error('Group meta not exists');
    }
    this._currentGroup = {
      groupId,
      groupName,
    };
    setTimeout(() => {
      client.ensureGroupHaveSharedOutput(groupId);
    }, 0);
  }

  // getInboxMessage
  async getInboxMessages(
    continuationToken?: string,
    limit = 3
  ): Promise<{ messageList: IMessage[]; nextToken?: string }> {
    this._ensureWalletConnected();
    const resstr = (await IotaSDK.request({
      method: 'iota_im_groupinboxmessagelist',
      params: {
        content: {
          addr: this._address!,
          continuationToken,
          limit,
        },
      },
    })) as string | undefined;
    if (!resstr) {
      return { messageList: [] };
    }
    console.log('***iota_im_groupinboxmessagelist success', resstr);
    const res = JSON.parse(resstr) as {
      messageList: MessageBody[];
      token?: string;
    };
    console.log('***iota_im_groupinboxmessagelist success', res);
    const messageList = res.messageList;
    const token = res.token;
    // make fake message id
    // log
    console.log('messageList', messageList);
    const fulfilledMessageList =
      messageList != undefined
        ? messageList.map((msgBody) => {
            const msg: IMessage = msgBody;
            return msg;
          })
        : [];
    // log fulfilledMessageList
    console.log('fulfilledMessageList', fulfilledMessageList);
    return { messageList: fulfilledMessageList, nextToken: token };
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
  async enteringGroupByGroupId(groupId: string) {
    const [ensureRes, consolidateRes] = await Promise.all([
      this.ensureGroupHaveSharedOutput(groupId),
      this.consolidateGroupMessages(groupId),
    ]);
    console.log('enteringGroupByGroupId ensureRes', ensureRes);
    console.log('enteringGroupByGroupId consolidateRes', consolidateRes);
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

  _ensureWalletConnected() {
    if (!this._address) {
      throw new Error('Wallet not connected.');
    }
  }

  async bootstrap() {
    await this.waitWalletReadyAndConnectWallet();
  }

  async waitWalletReadyAndConnectWallet() {
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
    if (res !== undefined) {
      await IotaCatSDKObj.waitOutput(res.outputId);
    }
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
    if (res !== undefined) {
      await IotaCatSDKObj.waitOutput(res.outputId);
    }
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

  async joinGroup(groupId: string) {
    this._ensureWalletConnected();
    const res = (await IotaSDK.request({
      method: 'iota_im_mark_group',
      params: {
        content: {
          addr: this._address!,
          groupId,
        },
      },
    })) as TransactionRes | undefined;
    if (res !== undefined) {
      await IotaCatSDKObj.waitOutput(res.outputId);
    }
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
    if (res !== undefined) {
      await IotaCatSDKObj.waitOutput(res.outputId);
    }
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

  async marked(groupId: string) {
    this._ensureWalletConnected();
    const markedGroupIds = (await IotaSDK.request({
      method: 'iota_im_getMarkedGroupIds',
      params: {
        content: {
          addr: this._address,
        },
      },
    })) as Array<{ groupId: string }>;

    return !!(markedGroupIds ?? []).find(
      (markedGroup) => markedGroup.groupId === groupId
    );
  }

  async isGroupPublic(groupId: string) {
    this._ensureWalletConnected();
    return await IotaCatSDKObj.checkIsGroupPublicFromSharedApiCall(groupId!);
  }

  async loadAddressMemberGroups(address: string) {
    this._ensureWalletConnected();
    const groupIds = await IotaCatSDKObj.fetchAddressMemberGroups(
      address
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
    const muteGroupMemberRes = (await IotaSDK.request({
      method: 'iota_im_muteGroupMember',
      params: {
        content: {
          addr: memberAddress,
          groupId: groupId,
          addrHash: IotaCatSDKObj._sha256Hash(memberAddress),
        },
      },
    })) as TransactionRes | undefined;
    console.log('****muteGroupMember res', muteGroupMemberRes);
    if (muteGroupMemberRes !== undefined) {
      await IotaCatSDKObj.waitOutput(muteGroupMemberRes.outputId);
    }
  }

  async unMuteGroupMember(groupId: string, memberAddress: string) {
    this._ensureWalletConnected();
    const unmuteGroupMemberRes = (await IotaSDK.request({
      method: 'iota_im_unmuteGroupMember',
      params: {
        content: {
          addr: memberAddress,
          groupId: groupId,
          addrHash: IotaCatSDKObj._sha256Hash(memberAddress),
        },
      },
    })) as TransactionRes | undefined;
    console.log('****unmuteGroupMember res', unmuteGroupMemberRes);
    if (unmuteGroupMemberRes !== undefined) {
      await IotaCatSDKObj.waitOutput(unmuteGroupMemberRes.outputId);
    }
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

  // Get muted members of a group
  async getGroupMuteMembers(groupId: string) {
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

    return AllUserMuteGroupMembers.filter(
      (muteGroupMember) => muteGroupMember.groupId === groupId
    ).map((muteGroupMember) => muteGroupMember.addrSha256Hash);
  }
}

const intance = new GroupFiSDKFacade();

export default intance;
