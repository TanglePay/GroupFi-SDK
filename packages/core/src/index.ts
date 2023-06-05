
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
        message.data = message.data.map(msg=>this._encrypt(msg,salt))
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
            const firstMsgDecrpted = this._decrypt(msg.data[0],salt)
            if (!firstMsgDecrpted) continue
            msg.data = msg.data.map(data=>this._decrypt(data,salt))
            break
        }
        return msg as IMMessage
    }
    _encrypt(content:string,salt:string){
        const [kdf,iv] = this._getKdf(salt)
        const utf8 = CryptoJS.enc.Utf8.parse(content)
        const encrypted = CryptoJS.AES.encrypt(utf8, kdf.toString(), this._decorateAesCfg({iv}))
        return encrypted.ciphertext.toString().toUpperCase() // hex
    }
    _decrypt(content:string,salt:string){
        const [kdf,iv] = this._getKdf(salt)
        const decrypted = CryptoJS.AES.decrypt(content, kdf.toString(), this._decorateAesCfg({iv}))
        return CryptoJS.enc.Utf8.stringify(decrypted)
    }
    _decorateAesCfg(cfg:Record<string,any>):Record<string,any>{
        return Object.assign({},cfg,{
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        })
    }
    _getKdf(content:string){
        const md5 = CryptoJS.MD5(content).toString()
        const kdf1 = CryptoJS.PBKDF2(md5, md5, { keySize: 16, iterations: 1000 })
        const kdf2 = CryptoJS.PBKDF2(kdf1.toString(), kdf1.toString(), { keySize: 16, iterations: 1000 })
        return [kdf1, kdf2]
    }
}

const instance = new IotaCatSDK

export default instance
