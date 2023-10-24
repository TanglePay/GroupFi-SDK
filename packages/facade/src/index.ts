import IotaSDK from 'tanglepaysdk-client';
import {
  IotaCatSDKObj,
  ShimmerBech32Addr,
  Address,
  IMessage,
  MessageGroupMeta,
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

  get address() {
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
    const { type, groupId, outputId } = pushed;
    if (type === 1) {
      const res = await client.getMessageFromOutputId(outputId, this._address!);
      if (res !== undefined) {
        const message: IMessage = {
          // Question: Why no message id
          messageId: 'why no message id',
          groupId,
          sender: res.sender,
          message: res.message.data,
          timestamp: new Date().getTime(),
        };
        return message;
      }
    }
    return undefined;
  }

  listenningNewMessage(callback: (message: IMessage) => void): () => void {
    this._ensureWalletConnected();
    if (!this._mqttConnected) {
      this.setupMqttConnection();
    }
    const listener = async (pushed: any) => {
      const pushedMessage = await this.handlePushedMessage(pushed);
      if (pushedMessage) {
        callback(pushedMessage);
      }
    };
    IotaCatSDKObj.on('inbox', listener);
    return () => IotaCatSDKObj.off('inbox', listener);
  }

  async setupMqttConnection() {
    IotaCatSDKObj.setupMqttConnection({} as any);
    IotaCatSDKObj.switchMqttAddress(this._address!);
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
            //const messageId = Math.random().toString(36).substr(2, 9);
            //@ts-ignore
            const msg: IMessage = msgBody;
            return msg;
          })
        : [];
    // log fulfilledMessageList
    console.log('fulfilledMessageList', fulfilledMessageList);
    return { messageList: fulfilledMessageList, nextToken: token };
  }

  async sendMessage(groupId: string, message: string) {
    const address: Address = {
      type: ShimmerBech32Addr,
      addr: this._address!,
    };
    const preparedMessage = await IotaCatSDKObj.prepareSendMessage(
      address,
      groupId,
      message
    );
    await client.sendMessage(this._address!, groupId, preparedMessage!);
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
      IotaSDK._events.on('iota-ready', async () => {
        console.log('****iota ready');
        try {
          const res = (await IotaSDK.request({
            method: 'iota_connect',
            params: {
              // expires: 3000000
            },
          })) as { address: string; nodeId: string };
          console.log('****iota connect', res);
          // this._address = res.address;
          this._address =
            'smr1qqc9fkdqy2esmnnqkv3aylvalz05vjkfd0368hgjy3f2nfp4dvdk67a3xdt';
          resolve(res);
        } catch (error) {
          reject(null);
        }
      });
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
      (qualifiedGroup) => qualifiedGroup.groupId === groupId
    );
  }

  async isGroupPublic(groupId: string) {
    this._ensureWalletConnected();
    return await IotaCatSDKObj.checkIsGroupPublicFromSharedApiCall(groupId!);
  }

  async loadAddressMemberGroups() {
    this._ensureWalletConnected();
    const groupIds = await IotaCatSDKObj.fetchAddressMemberGroups(
      this._address!
    );
    const groups = groupIds
      .map((groupId) => IotaCatSDKObj._groupIdToGroupMeta(groupId))
      .filter(Boolean) as MessageGroupMeta[];
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
    return !!blackListedAddresseHashs.find(
      (blackListedAddress) => blackListedAddress === this._address
    );
  }

  async muteGroupMember(groupId: string, memberAddress: string) {
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
    if (muteGroupMemberRes !== undefined) {
      await IotaCatSDKObj.waitOutput(muteGroupMemberRes.outputId);
    }
  }

  async unMuteGroupMember(groupId: string, memberAddress: string) {
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
    if (unmuteGroupMemberRes !== undefined) {
      await IotaCatSDKObj.waitOutput(unmuteGroupMemberRes.outputId);
    }
  }
}

const intance = new GroupFiSDKFacade();

export default intance;
