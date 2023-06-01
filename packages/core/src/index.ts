
import CryptoJS from 'crypto-js'
//@ts-ignore
import { IotaSDK } from '@tangle-pay/common';

import { IM } from './proto/compiled'
class IotaCatSDK {


    _groupToGroupId(group:string){
        const groupId = CryptoJS.SHA256(group).toString(CryptoJS.enc.Hex)
        return groupId
    }

    _groupIdToGroupMembers(groupId:string):string[]{
        return []
    }

    prepareSendMessage (senderAddr:string, group:string,message: string):IMMessage|undefined  {
        const groupId = this._groupToGroupId(group)
        const recipientAddresses = this._groupIdToGroupMembers(groupId)
        if (!recipientAddresses.includes(senderAddr)) return undefined
        return {
            schemaVersion: 1,
            group: groupId,
            messageType:0,
            authScheme:0,
            recipients: recipientAddresses.map(addr=>({addr,key:''})),
            data: [message]
        }
    }

    _generateRandomStr(len:number){
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+'
        let result = []
        for (let i = 0; i < len; i++) {
            result.push(chars.charAt(Math.floor(Math.random() * chars.length)))
        }
        return result.join('')
    }
    serializeMessage(message:IMMessage, encryptUsingPublicKey:(key:string,data:string)=>string){
        const salt = this._generateRandomStr(32)
        message.data = message.data.map(msg=>IotaSDK.encrypt(msg,salt,true))
        message.recipients = message.recipients.map(pair=>{
            pair.key = encryptUsingPublicKey(pair.addr,salt)
            return pair
        })
        const msgProto = IM.IMMessage.create(message)
        const msgBytes = IM.IMMessage.encode(msgProto).finish()
        return msgBytes
    }
    deserializeMessage(messageBytes:Uint8Array, decryptUsingPrivateKey:(data:string)=>string):IMMessage{
        const msg = IM.IMMessage.decode(messageBytes)
        for (const recipient of msg.recipients) {
            if (!recipient.key) continue
            const salt = decryptUsingPrivateKey(recipient.key)
            if (!salt) continue
            const firstMsgDecrpted = IotaSDK.decrypt(msg.data[0],salt,true)
            if (!firstMsgDecrpted) continue
            msg.data = msg.data.map(data=>IotaSDK.decrypt(data,salt,true))
            break
        }
        return msg as IMMessage
}

const instance = new IotaCatSDK()

export default instance
