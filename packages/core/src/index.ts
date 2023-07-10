
import CryptoJS from 'crypto-js'
import { concatBytes, hexToBytes, serializeListOfBytes, deserializeListOfBytes } from 'iotacat-sdk-utils'
import { IM } from './proto/compiled'
import { IMMessage, Address, ShimmerBech32Addr,MessageAuthSchemeRecipeintOnChain, MessageCurrentSchemaVersion, MessageTypePrivate, MessageAuthSchemeRecipeintInMessage, MessageGroupMeta, MessageGroupMetaKey, MessageAuthScheme, IMRecipient } from './types';
import { Message } from 'protobufjs';
export * from './types';
const SHA256_LEN = 32
class IotaCatSDK {

    _groupIdCache:Record<string,string[]> = {}

    _groupToGroupId(group:string){
        const meta = this._groupNameToGroupMeta(group)
        if (!meta) return undefined
        const groupId = this._groupMetaToGroupId(meta)
        return groupId
    }
    _groupNameToGroupMeta(group:string):MessageGroupMeta|undefined{
        const map:Record<string,MessageGroupMeta> = {
            'iceberg':{
                groupName: 'iceberg',
                schemaVersion: MessageCurrentSchemaVersion,
                messageType:MessageTypePrivate,
                authScheme:MessageAuthSchemeRecipeintOnChain,
            },
            'iceberg-collection-1':{
                groupName: 'iceberg-collection-1',
                schemaVersion: MessageCurrentSchemaVersion,
                messageType:MessageTypePrivate,
                authScheme:MessageAuthSchemeRecipeintOnChain,
            },
            'iceberg-collection-2':{
                groupName: 'iceberg-collection-2',
                schemaVersion: MessageCurrentSchemaVersion,
                messageType:MessageTypePrivate,
                authScheme:MessageAuthSchemeRecipeintOnChain,
            },
            'iceberg-collection-3':{
                groupName: 'iceberg-collection-3',
                schemaVersion: MessageCurrentSchemaVersion,
                messageType:MessageTypePrivate,
                authScheme:MessageAuthSchemeRecipeintOnChain,
            },
            'iceberg-collection-4':{
                groupName: 'iceberg-collection-4',
                schemaVersion: MessageCurrentSchemaVersion,
                messageType:MessageTypePrivate,
                authScheme:MessageAuthSchemeRecipeintOnChain,
            },
            'iceberg-collection-5':{
                groupName: 'iceberg-collection-5',
                schemaVersion: MessageCurrentSchemaVersion,
                messageType:MessageTypePrivate,
                authScheme:MessageAuthSchemeRecipeintOnChain,
            },
            'iceberg-collection-6':{
                groupName: 'iceberg-collection-6',
                schemaVersion: MessageCurrentSchemaVersion,
                messageType:MessageTypePrivate,
                authScheme:MessageAuthSchemeRecipeintOnChain,
            },
            'iceberg-collection-7':{
                groupName: 'iceberg-collection-7',
                schemaVersion: MessageCurrentSchemaVersion,
                messageType:MessageTypePrivate,
                authScheme:MessageAuthSchemeRecipeintOnChain,
            },
            'iceberg-collection-8':{
                groupName: 'iceberg-collection-8',
                schemaVersion: MessageCurrentSchemaVersion,
                messageType:MessageTypePrivate,
                authScheme:MessageAuthSchemeRecipeintOnChain,
            },
        }
        return map[group]
    }
    _groupMetaToGroupId(meta:MessageGroupMeta):string{
        const sortedKeys= Object.keys(meta).sort() as MessageGroupMetaKey[]
        const sortedMap = sortedKeys.reduce((acc,key)=>{
            acc[key] = ""+meta[key]
            return acc
        },{} as Record<string,any>)
        const groupId = CryptoJS.SHA256(JSON.stringify(sortedMap)).toString(CryptoJS.enc.Hex)
        return groupId
    }
    _groupIdToGroupMembers(groupId:string):string[]{
        return this._groupIdCache[groupId] || []
    }

    async prepareSendMessage(senderAddr:Address, group:string,message: string, sharedOutputIdResolver?:(groupId:string)=>Promise<string>):Promise<IMMessage|undefined>  {
        const meta = this._groupNameToGroupMeta(group)
        if (!meta) return undefined
        const {schemaVersion,messageType,authScheme} = meta
        const groupId = this._groupMetaToGroupId(meta)
        let sharedOutputId:string|undefined
        if (authScheme === MessageAuthSchemeRecipeintOnChain) {
            if (!sharedOutputIdResolver) return undefined
             sharedOutputId = await sharedOutputIdResolver(groupId)
        }
        const recipientAddresses = this._groupIdToGroupMembers(groupId)
        if (!recipientAddresses.includes(senderAddr.addr)) return undefined
        return {
            schemaVersion,
            group: groupId,
            messageType,
            authScheme,
            recipientOutputid: sharedOutputId,
            recipients: recipientAddresses.map(addr=>({addr,key:''})),
            data: [message]
        }
    }

    /*
    async _getSharedOutputIdFromGroupId(groupId:string):Promise<string|undefined>{
        // TODO call inx api
        // if api returns a valid output id, return it
        // else create one and return it
        throw new Error('not implemented')
    }
*/
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
    
    async serializeMessage(message:IMMessage, extra:{encryptUsingPublicKey?:(key:string,data:string)=>Promise<string>, groupSaltResolver?:(groupId:string)=>Promise<string>}):Promise<Uint8Array>{
        const {encryptUsingPublicKey,groupSaltResolver} = extra
        const groupSha256Hash = message.group
        const groupBytes = hexToBytes(groupSha256Hash)
        let salt = ''
        if (message.authScheme === MessageAuthSchemeRecipeintInMessage) {
            salt = this._generateRandomStr(32)
        } else if (message.authScheme === MessageAuthSchemeRecipeintOnChain) {
            if (!groupSaltResolver) throw new Error('groupSaltResolver is required for MessageAuthSchemeRecipeintOnChain')
            salt = await groupSaltResolver(message.group)
        }
        message.data = message.data.map(msg=>this._encrypt(msg,salt))
        if (message.authScheme === MessageAuthSchemeRecipeintInMessage) {
            if (!encryptUsingPublicKey) throw new Error('encryptUsingPublicKey is required for MessageAuthSchemeRecipeintInMessage')
            message.recipients = await Promise.all(message.recipients.map(async (pair)=>{
                pair.key = await encryptUsingPublicKey(pair.key,salt)
                return pair
            }))
        }
        const msgProto = IM.IMMessage.create(message)
        const msgBytes = IM.IMMessage.encode(msgProto).finish()
        return concatBytes(groupBytes, msgBytes)
    }
              
    
    async deserializeMessage(messageBytes:Uint8Array, address:string, extra:{decryptUsingPrivateKey?:(data:string)=>Promise<string>, groupSaltResolver?:(groupId:string)=>Promise<string>} ):Promise<IMMessage>{
        const {decryptUsingPrivateKey,groupSaltResolver} = extra
        const groupBytes = messageBytes.slice(0,SHA256_LEN)
        const payload = messageBytes.slice(SHA256_LEN)
        const msg = IM.IMMessage.decode(payload)
        let salt = ''
        if (msg.authScheme === MessageAuthSchemeRecipeintInMessage) {
            if (!decryptUsingPrivateKey) throw new Error('decryptUsingPrivateKey is required for MessageAuthSchemeRecipeintInMessage')
            for (const recipient of msg.recipients) {
                if (!recipient.key) continue
                if (recipient.addr !== address) continue
                salt = await decryptUsingPrivateKey(recipient.key)
                if (!salt) break
                if (!this.validateFirstMsg(msg,salt)) {
                    salt = ''
                    break
                }
            }
        } else if (msg.authScheme === MessageAuthSchemeRecipeintOnChain) {
            if (!groupSaltResolver) throw new Error('groupSaltResolver is required for MessageAuthSchemeRecipeintOnChain')
            salt = await groupSaltResolver(msg.group)
        }
        if (!salt) {
            throw new Error('invalid message')
        }
        msg.data = msg.data.map(data=>this._decrypt(data,salt))
        return msg as IMMessage
    }
    serializeRecipientList(recipients:IMRecipient[], groupId:string):Uint8Array{
        const groupBytes = hexToBytes(groupId)
        const bytesList = recipients.map(recipient=>IM.Recipient.encode(recipient).finish())
        const pl =  serializeListOfBytes(bytesList)
        return  concatBytes(groupBytes,pl)
    }
    deserializeRecipientList(recipientListBytes:Uint8Array):IMRecipient[]{
        const payload = recipientListBytes.slice(SHA256_LEN)
        const bytesList = deserializeListOfBytes(payload)
        return bytesList.map(bytes=>IM.Recipient.decode(bytes))
    }
    validateFirstMsg(msg:IM.IMMessage, salt:string){
        const firstMsgDecrypted = this._decrypt(msg.data[0],salt)
        if (!firstMsgDecrypted) return false
        return true
    }
    _encrypt(content:string,salt:string){
        const contentWord = CryptoJS.enc.Utf8.parse(content)
        const [key,iv] = this._getKdf(salt)
        const encrypted = CryptoJS.AES.encrypt(
            contentWord,
            key,
            this._decorateAesCfg({ iv })
        ).ciphertext.toString(CryptoJS.enc.Hex)
        return encrypted
    }
    _decrypt(content:string,salt:string){
        const [kdf,iv] = this._getKdf(salt)
        const encryptedWord = CryptoJS.enc.Hex.parse(content)
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
export const IOTACATSHAREDTAG = 'IOTACATSHARED'
export const IotaCatSDKObj = instance

export * from './misc'
