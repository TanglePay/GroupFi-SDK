
import CryptoJS from 'crypto-js'
import { concatBytes, hexToBytes } from 'iotacat-sdk-utils'
import { IM } from './proto/compiled'
import { IMMessage } from './types';
export { IMMessage} from './types';
const SHA256_LEN = 32
class IotaCatSDK {

    _groupIdCache:Record<string,string[]> = {}

    _groupToGroupId(group:string){
        const groupId = CryptoJS.SHA256(group).toString(CryptoJS.enc.Hex)
        return groupId
    }

    _groupIdToGroupMembers(groupId:string):string[]{
        return this._groupIdCache[groupId] || []
    }

    //
    prepareSendMessage(senderBech32Addr:string, group:string,message: string):IMMessage|undefined  {
        const groupId = this._groupToGroupId(group)
        const recipientAddresses = this._groupIdToGroupMembers(groupId)
        if (!recipientAddresses.includes(senderBech32Addr)) return undefined
        return {
            schemaVersion: 1,
            group: groupId,
            messageType:0,
            authScheme:0,
            recipients: recipientAddresses.map(addr=>({addr,key:''})),
            data: [message]
        }
    }

    setPublicKeyForPreparedMessage(message:IMMessage, publicKeyMap:Record<string,string>){
        message.recipients = message.recipients.map(pair=>{
            pair.key = publicKeyMap[pair.addr]
            return pair
        })
    }

    _generateRandomStr(len:number){
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+'
        let result = []
        for (let i = 0; i < len; i++) {
            result.push(chars.charAt(Math.floor(Math.random() * chars.length)))
        }
        return result.join('')
    }
    
    async serializeMessage(message:IMMessage, encryptUsingPublicKey:(key:string,data:string)=>Promise<string>){
        const groupSha256Hash = message.group
        const groupBytes = hexToBytes(groupSha256Hash)
        const salt = this._generateRandomStr(16)
        console.log('salt',salt)
        message.data = message.data.map(msg=>this._encrypt(msg,salt))
        message.recipients = await Promise.all(message.recipients.map(async (pair)=>{
            pair.key = await encryptUsingPublicKey(pair.key,salt)
            return pair
        }))
        const msgProto = IM.IMMessage.create(message)
        const msgBytes = IM.IMMessage.encode(msgProto).finish()
        return concatBytes(groupBytes, msgBytes)
    }

    async deserializeMessage(messageBytes:Uint8Array, address:string, decryptUsingPrivateKey:(data:string)=>Promise<string>):Promise<IMMessage>{
        const groupBytes = messageBytes.slice(0,SHA256_LEN)
        const payload = messageBytes.slice(SHA256_LEN)
        const msg = IM.IMMessage.decode(payload)
        for (const recipient of msg.recipients) {
            if (!recipient.key) continue
            if (recipient.addr !== address) continue
            const salt = await decryptUsingPrivateKey(recipient.key)
            if (!salt) break
            const firstMsgDecrpted = this._decrypt(msg.data[0],salt)
            if (!firstMsgDecrpted) continue
            msg.data = msg.data.map(data=>this._decrypt(data,salt))
            break
        }
        return msg as IMMessage
    }
    _encrypt(content:string,salt:string){
        const contentWord = CryptoJS.enc.Utf8.parse(content)
        const [key,iv] = this._getKdf(salt)
        const encrypted = CryptoJS.AES.encrypt(
            contentWord,
            key,
            this._decorateAesCfg({ iv })
        ).ciphertext.toString(CryptoJS.enc.Base64)
        return encrypted
    }
    _decrypt(content:string,salt:string){
        const [kdf,iv] = this._getKdf(salt)
        const encryptedWord = CryptoJS.enc.Base64.parse(content)
        const encryptedParam = CryptoJS.lib.CipherParams.create({
            ciphertext: encryptedWord
        })
        const decrypted = CryptoJS.AES.decrypt(encryptedParam, kdf, this._decorateAesCfg({iv})).toString(CryptoJS.enc.Utf8)
        return decrypted
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

export const IOTACATTAG = 'IOTACAT'

export const IotaCatSDKObj = instance

export * from './misc'
