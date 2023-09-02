
import CryptoJS from 'crypto-js'
import { concatBytes, hexToBytes, bytesToHex, serializeListOfBytes, deserializeListOfBytes, addressHash } from 'iotacat-sdk-utils'
import { IM } from './proto/compiled'
import { IMMessage, Address, ShimmerBech32Addr,MessageAuthSchemeRecipeintOnChain, MessageCurrentSchemaVersion, MessageTypePrivate, MessageAuthSchemeRecipeintInMessage, MessageGroupMeta, MessageGroupMetaKey, MessageAuthScheme, IMRecipient, IMRecipientIntermediate, IMMessageIntermediate, PushedValue, INX_GROUPFI_DOMAIN } from './types';
import { Message } from 'protobufjs';
export * from './types';
import type { MqttClient,connect } from "mqtt";
import EventEmitter from 'events';
import exp from 'constants';
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
    _mqttClient?:MqttClient
    setupMqttConnection(connect:(url:string)=>MqttClient){
        const client = connect(`wss://${INX_GROUPFI_DOMAIN}/api/groupfi/mqtt/v1`)
        // log connect close disconnect
        client.on('connect', function () {
            console.log('mqtt connected')
        })
        client.on('close', function () {
            console.log('mqtt closed')
        })
        client.on('disconnect', function () {
            console.log('mqtt disconnected')
        })
        client.on('error', function (error) {
            console.log('mqtt error',error)
        })
        client.on('message', this._handleMqttMessage.bind(this))
        this._mqttClient = client
    }
    _events:EventEmitter = new EventEmitter();
    _handleMqttMessage(topic:string, message:Buffer){
        const pushed = this.parsePushedValue(message)
        console.log('mqtt message', topic, pushed);
        this._events.emit('inbox', pushed)
    }
    on(key:string,cb:(...args:any[])=>void){
        this._events.on(key,cb)
    }
    off(key:string,cb:(...args:any[])=>void){
        this._events.off(key,cb)
    }
    _ensureMqttClient(){
        if (!this._mqttClient) throw new Error('mqtt client not setup')
    }
    async switchMqttAddress(address:string){
        this._ensureMqttClient()
        const groupIds = await this._fetchAddressGroupIds(address)
        // loop through groupIds then subscribe to inbox/groupId
        for (const groupId of groupIds) {
            this.subscribeToGroupId(groupId)
        }
    }
    // subscribe to a groupId inbox/groupId
    subscribeToGroupId(groupId:string){
        this._ensureMqttClient()
        this._mqttClient!.subscribe(`inbox/${groupId}`)
    }

    async prepareSendMessage(senderAddr:Address, group:string,message: string):Promise<IMMessage|undefined>  {
        const meta = this._groupNameToGroupMeta(group)
        if (!meta) return undefined
        const {schemaVersion,messageType,authScheme} = meta
        const groupId = this._groupMetaToGroupId(meta)
        
        return {
            schemaVersion,
            group: groupId,
            messageType,
            authScheme,
            recipients:[],
            data: [message]
        }
    }

    setPublicKeyForPreparedMessage(message:IMMessage, publicKeyMap:Record<string,string>){
        message.recipients = message.recipients.map(pair=>{
            pair.mkey = publicKeyMap[pair.addr]
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
    async _fetchAddressGroupIds(address:string):Promise<string[]>{
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/addressgroupids?address=${address}`
        const res = await fetch(url)
        const json = await res.json()
        return json
    }
    async serializeMessage(message:IMMessage, extra:{encryptUsingPublicKey?:(key:string,data:string)=>Promise<Uint8Array>, groupSaltResolver?:(groupId:string)=>Promise<string>}):Promise<Uint8Array>{
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
                pair.mkey = bytesToHex(await encryptUsingPublicKey(pair.mkey,salt))
                return pair
            }))
        }
        const message_ = this._compileMessage(message)
        const msgProto = IM.IMMessage.create(message_)
        const msgBytes = IM.IMMessage.encode(msgProto).finish()
        return concatBytes(groupBytes, msgBytes)
    }
              
    async sleep(ms:number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async deserializeMessage(messageBytes:Uint8Array, address:string, extra:{decryptUsingPrivateKey?:(data:Uint8Array)=>Promise<string>, sharedOutputSaltResolver?:(outputId:string)=>Promise<string>} ):Promise<IMMessage>{
        const {decryptUsingPrivateKey,sharedOutputSaltResolver} = extra
        const groupBytes = messageBytes.slice(0,SHA256_LEN)
        const payload = messageBytes.slice(SHA256_LEN)
        const msg_ = IM.IMMessage.decode(payload)
        // @ts-ignore
        const msg = this._decompileMessage(msg_)
        let salt = ''
        if (msg.authScheme === MessageAuthSchemeRecipeintInMessage) {
            if (!decryptUsingPrivateKey) throw new Error('decryptUsingPrivateKey is required for MessageAuthSchemeRecipeintInMessage')
            const addressHashValue = this.getAddressHashStr(address)
            
            for (const recipient of msg.recipients) {
                if (!recipient.mkey) continue
                if (recipient.addr !== addressHashValue) continue
                salt = await decryptUsingPrivateKey(hexToBytes(recipient.mkey))
                if (!salt) break
                if (!this.validateFirstMsg(msg,salt)) {
                    salt = ''
                    break
                }
            }
        } else if (msg.authScheme === MessageAuthSchemeRecipeintOnChain) {
            if (!sharedOutputSaltResolver) throw new Error('sharedOutputSaltResolver is required for MessageAuthSchemeRecipeintOnChain')
            salt = await sharedOutputSaltResolver(msg.recipientOutputid!)
        }
        if (!salt) {
            console.log('invalid message',msg,msg_)
            throw new Error('invalid message')
        }
        msg.data = msg.data.map(data=>this._decrypt(data,salt))
        return msg as IMMessage
    }
    serializeRecipientList(recipients:IMRecipient[], groupId:string):Uint8Array{
        const groupBytes = hexToBytes(groupId)
        const recipientIntermediateList = recipients.map(recipient=>this._compileRecipient(recipient))
        const bytesList = recipientIntermediateList.map(recipient=>IM.Recipient.encode(recipient).finish())
        const pl =  serializeListOfBytes(bytesList)
        return  concatBytes(groupBytes,pl)
    }
    deserializeRecipientList(recipientListBytes:Uint8Array):IMRecipient[]{
        const payload = recipientListBytes.slice(SHA256_LEN)
        const bytesList = deserializeListOfBytes(payload)
        return bytesList.map(bytes=>IM.Recipient.decode(bytes)).map(recipient=>this._decompileRecipient(recipient))
    }
    _compileRecipient(recipient:IMRecipient):IMRecipientIntermediate{
        return {
            addr: addressHash(recipient.addr,IOTACATTAG),
            mkey: hexToBytes(recipient.mkey),
        }
    }
    getAddressHashStr(addr:string):string{
        return bytesToHex(addressHash(addr,IOTACATTAG))
    }
    _compileMessage(message:IMMessage):IMMessageIntermediate{
        const recipients = message.recipients.map(recipient=>this._compileRecipient(recipient))
        return {
            ...message,
            recipients,
        }
    }


    _decompileRecipient(recipient:IMRecipientIntermediate):IMRecipient{
        return {
            addr: bytesToHex(recipient.addr,false),
            mkey: bytesToHex(recipient.mkey,false),
        }
    }
    _decompileMessage(message:IMMessageIntermediate):IMMessage{
        const recipients = message.recipients.map(recipient=>this._decompileRecipient(recipient))
        return {
            ...message,
            recipients,
        }
    }
    validateFirstMsg(msg:IMMessage, salt:string){
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

    // value = one byte type 
    parsePushedValue(value:Buffer):PushedValue|undefined{
        // type to number
        console.log('parsePushedValue',value.toString('hex'))
        const type = value[0]
        if (type === 1) {
            const groupId = value.slice(1,33).toString('hex')
            const outputId = value.slice(33,67).toString('hex')
            console.log('parsePushedValue',value,type,groupId,outputId)
            return {type,groupId,outputId}
        } else if (type === 2) {
            const sender = value.slice(2,34).toString('hex')
            const meta = value.slice(34).toString('hex')
            const groupId = value.slice(34,66).toString('hex')
            console.log('parsePushedValue',value,type,groupId)
            return {type, groupId, sender, meta}
        }
        
    }
}

const instance = new IotaCatSDK

export const IOTACATTAG = 'IOTACATV2'
export const IOTACATSHAREDTAG = 'IOTACATSHAREDV2'
export const IotaCatSDKObj = instance

export * from './misc'
