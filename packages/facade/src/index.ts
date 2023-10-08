import IotaSDK from 'tanglepaysdk-client';
import {
  IotaCatSDKObj,
  ShimmerBech32Addr,
  Address,
  IMessage,
} from 'iotacat-sdk-core';
import client from 'iotacat-sdk-client';

import { SimpleDataExtended, objectId } from 'iotacat-sdk-utils';

export { SimpleDataExtended }

import { MessageBody } from 'iotacat-sdk-client';

class GroupFiSDKFacade {
  private _address: string | undefined;

  private _mqttConnected: boolean = false;

  get address() {
    return this._address;
  }

  private _groupId: string | undefined;

  async getMessages(options?: {
    fromToken?: string;
    untilToken?: string;
    size?: number;
  }): Promise<IMessage[]> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve([
          {
            messageId: 'm-1',
            groupId: 'g-1',
            sender: 's-1',
            message: 'message-1111',
            timestamp: 1694745015,
          },
          {
            messageId: 'mid-2',
            groupId: 'gid-2',
            sender: 's-1',
            message: 'message-222',
            timestamp: 1694745016,
          },
          {
            messageId: 'mid-3',
            groupId: 'gid-2',
            sender: 's-2',
            message: 'message-333',
            timestamp: 1694745017,
          },
        ]);
      }, 1000);
    });
  }
  getObjectId(obj:Record<string, SimpleDataExtended>) {
    return objectId(obj)
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

  async enteringGroup(groupId: string) {
    this._groupId = groupId;
    setTimeout(() => {
      client.ensureGroupHaveSharedOutput(groupId);
    }, 0);
  }

  // getInboxMessage
  async getInboxMessages(continuationToken?:string,limit = 3): Promise<{messageList:IMessage[],nextToken?:string}> {
    this._ensureWalletConnected();
    const resstr = await IotaSDK.request({
      method: 'iota_im_groupinboxmessagelist',
      params: {
      content: {
          addr: this._address!,
          continuationToken,
          limit,
      }
      }
  }) as string | undefined;
    if (!resstr) {
      return {messageList:[]};
    }
    console.log('***iota_im_groupinboxmessagelist success', resstr);
    const res = JSON.parse(resstr) as { messageList: MessageBody[]; token?:string };
    console.log('***iota_im_groupinboxmessagelist success', res);
    const messageList = res.messageList;
    const token = res.token;
    // make fake message id
    // log 
    console.log('messageList', messageList);
    const fulfilledMessageList = messageList != undefined? messageList.map((msgBody) => {
      //const messageId = Math.random().toString(36).substr(2, 9);
      //@ts-ignore
      const msg:IMessage = msgBody
      return msg
    }) : [];
    // log fulfilledMessageList
    console.log('fulfilledMessageList', fulfilledMessageList);
    return {messageList:fulfilledMessageList,nextToken:token};
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
    //IotaCatSDKObj.setupMqttConnection(connect as any);
    //IotaCatSDKObj.switchMqttAddress(this._address!);
  }
  async waitWalletReadyAndConnectWallet() {
    return new Promise((resolve, reject) => {
      IotaSDK._events.on('iota-ready', async () => {
        try {
          const res = (await IotaSDK.request({
            method: 'iota_connect',
            params: {
              // expires: 3000000
            },
          })) as { address: string; nodeId: string };
          console.log('***iota_connect success', res);
          this._address = res.address;
          resolve(res);
        } catch (error) {
          reject(null);
        }
      });
    });
  }
}

const intance = new GroupFiSDKFacade();

export default intance;

// interface GroupListItem {
//   groupId: string;
//   groupName: string;
// }

// class Facade {
//   private _address: string | undefined;

//   private _nodeId: number | undefined;



// async connectWallet(): Promise<ConnectTanglePayRes | null> {
//   return new Promise((resolve, reject) => {
//     IotaSDK._events.on('iota-ready', async () => {
//       try {
//         const res = (await IotaSDK.request({
//           method: 'iota_connect',
//           params: {
//             // expires: 3000000
//           },
//         })) as ConnectTanglePayRes;
//         console.log('***iota_connect success', res);
//         this._address = res.address;
//         this._nodeId = res.nodeId;
//         resolve(res);
//       } catch (error) {
//         reject(null);
//       }
//     });
//   });
// }

//   _ensureWalletConnected() {
//     if (!this._address || !this._nodeId) {
//       throw new Error('Wallet not connected.');
//     }
//   }

//   // Get all group List
//   async getAllGroups(): Promise<GroupListItem[]> {
//     const promise = new Promise((resolve, reject) => {
//       setTimeout(() => {
//         resolve([]);
//       }, 1000);
//     });
//     const groupList = (await promise) as GroupListItem[];

//     return groupList;
//   }

//   async _ensureGroupHaveSharedOutput(groupList: GroupListItem[]) {
//     groupList.map(({ groupId }) => client.ensureGroupHaveSharedOutput(groupId));
//   }
// }

// class Group {
//   private _groupId: string | undefined;

//   private _groupName: string | undefined;

//   private _address: string | undefined;

//   messageList: any[] = [];

//   constructor(address: string, groupName: string) {
//     this._groupName = groupName;
//     this._address = address;
//     const groupId = IotaCatSDKObj._groupToGroupId(groupName);
//     if (groupId === undefined) {
//       throw new Error(`Invalid group: ${groupName}`);
//     }
//     this._groupId = groupId;

//   }

//   _ensureGroupInited() {
//     if (!this._address || !this._groupId || this._groupName) {
//       throw new Error('Group not initialized.');
//     }
//   }

// onMessage() {
//   IotaCatSDKObj.on('inbox', (pushed) => {
//     const { type, groupId, outputId } = pushed;
//     if (groupId !== this._groupId) {
//       return;
//     }
//     if(type === 1) {
//       this.getGroupMessageList()
//     }
//   });
//   }

//   async getGroupMessageList() {
//     try {
//       let untilToken = undefined;
//       this._ensureGroupInited();
//       const res = await client.fetchMessageListUntil(
//         this._groupId!,
//         this._address!,
//         untilToken!,
//       );
//       const { messageList, headToken, tailToken } = res ?? {};
//       return messageList
//     } catch (error) {
//       return [];
//     }
//   }

//   async sendMessage(message: string) {
//     this._ensureGroupInited();
//   const address: Address = {
//     type: ShimmerBech32Addr,
//     addr: this._address!,
//   };
//   const preparedMessage = await IotaCatSDKObj.prepareSendMessage(
//     address,
//     this._groupName!,
//     message
//   );
//   await client.sendMessage(this._address!, this._groupId!, preparedMessage!);
// }
// }

// const facade = new Facade();
// facade.bootstrap();
// export default facade;
