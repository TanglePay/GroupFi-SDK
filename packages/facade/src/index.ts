import IotaSDK from 'tanglepaysdk-client';
import {
  IotaCatSDKObj,
  ShimmerBech32Addr,
  Address,
  IMessage,
  MessageGroupMeta,
  IMMessage,
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
    const {type,groupId} = pushed

    if (type === 1 ) { 
        throw new Error('type 1 not supported for pushed message')
    } else if (type === 2) {
        const {sender, meta} = pushed
        const res = await IotaSDK.request({
          method: 'iota_im_p2p_pushed',
          params: {
          content: {
              addr:this._address!,
              pushed: {
                  meta,
                  sender
              },
          }
          }
      })
      if (res === undefined) {
          return undefined
      }
      const resUnwrapped = res as {messageId:string, message:IMMessage, sender:string}
      const message:IMessage = {
        messageId:resUnwrapped.messageId,
        groupId:resUnwrapped.message.groupId,
        sender:resUnwrapped.sender,
        message:resUnwrapped.message.data,
        timestamp:resUnwrapped.message.timestamp
      }
      return message
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
    const fulfilledMessageList = messageList != undefined? messageList.map((msgBody) => {
      const msg:IMessage = msgBody
      return msg
    }) : [];
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
                groupId
            }
            }
        })
        console.log('ensureGroupHasShared res',res)
    } catch (error) {
        console.log('ensureGroupHasShared error',error)
    }
  }
  async consolidateGroupMessages(groupId: string) {
    try {
        const res = await IotaSDK.request({
            method: 'iota_im_check_and_consolidate_messages',
            params: {
            content: {
                addr: this._address!,
                groupId
            }
            }
        })
    } catch (error) {
        console.log('consolidateMessages error',error)
    }
  }
  async enteringGroupByGroupId(groupId: string) {
    const [ensureRes,
      consolidateRes] = await Promise.all([
      this.ensureGroupHaveSharedOutput(groupId),
      this.consolidateGroupMessages(groupId)
    ])
    console.log('enteringGroupByGroupId ensureRes',ensureRes)
    console.log('enteringGroupByGroupId consolidateRes',consolidateRes)
  }
  async sendMessage(groupId: string, messageText: string) {
    const address: Address = {
      type: ShimmerBech32Addr,
      addr: this._address!,
    };
    const message = await IotaCatSDKObj.prepareSendMessage(
      address,
      groupId,
      messageText
    );
    const res = await IotaSDK.request({
        method: 'iota_im',
        params: {
          content: {
                dappName:'trollbox',
                addr:this._address!,
                groupId,
                message
            }
        }
    })
    console.log('send message res', res);
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

  setupIotaMqttConnection(mqttClient: any) {
    return IotaCatSDKObj.setupIotaMqttConnection(mqttClient)
  }
}

const intance = new GroupFiSDKFacade();

export default intance;
