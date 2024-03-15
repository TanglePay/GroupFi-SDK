
import CryptoJS from 'crypto-js';
import { concatBytes, hexToBytes, bytesToHex, addressHash, bytesToStr, strToBytes, getCurrentEpochInSeconds, blake256Hash, formatUrlParams } from 'iotacat-sdk-utils';
import { IMMessage, Address, MessageAuthSchemeRecipeintOnChain, MessageCurrentSchemaVersion, MessageTypePrivate, MessageAuthSchemeRecipeintInMessage, MessageGroupMeta, MessageGroupMetaKey, IMRecipient, IMRecipientIntermediate, IMMessageIntermediate, PushedValue, INX_GROUPFI_DOMAIN, NFT_CONFIG_URL, IGroupQualify, IGroupUserReputation, ImInboxEventTypeNewMessage, ImInboxEventTypeGroupMemberChanged, InboxItemResponse, EncryptedHexPayload, SharedNotFoundError, PublicItemsResponse } from './types';
import type { MqttClient, connect as mqttconnect } from "mqtt";
import type { MqttClient as IotaMqttClient } from "@iota/mqtt.js"
import EventEmitter from 'events';
import { serializeRecipientList, deserializeRecipientList, serializeIMMessage, deserializeIMMessage } from './codec';
import { EncryptedPayload } from 'ecies-ed25519-js';
import { WriteStream, ReadStream } from '@iota/util.js';
import LZString from 'lz-string'
export * from './types';
export * from './codec_mark';
export * from './codec_mute';
export * from './codec_vote';
const SHA256_LEN = 32
class IotaCatSDK {
    private _groupConfigMap:Record<string,MessageGroupMeta> = {}
    
    _groupIdCache:Record<string,string[]> = {}

    _groupToGroupId(group:string){
        const meta = this._groupNameToGroupMeta(group)
        if (!meta) return undefined
        const groupId = this._groupMetaToGroupId(meta)
        return groupId
    }
    _groupNameToGroupMeta(group:string):MessageGroupMeta|undefined{
        return this._groupConfigMap[group]
    }
    groupIdToGroupName(groupId:string):string|undefined{
        const meta = this._groupIdToGroupMeta(groupId)
        if (!meta) return undefined
        return meta.groupName
    }
    _groupIdToGroupMeta(groupId:string):MessageGroupMeta|undefined{
        // log enter
        console.log('_groupIdToGroupMeta enter',groupId)
        for (const group in this._groupConfigMap) {
            const meta = this._groupConfigMap[group]
            const groupId_ = this._groupMetaToGroupId(meta)
            // log groupId_ groupId
            // console.log('_groupIdToGroupMeta groupId_ groupId',groupId_,groupId)
            if (this._addHexPrefixIfAbsent(groupId_) === this._addHexPrefixIfAbsent(groupId)) return meta
        }
        return undefined
    }
    _groupMetaToGroupId(meta:MessageGroupMeta):string{
        const sortedKeys= Object.keys(meta).sort() as MessageGroupMetaKey[]
        const sortedMap = sortedKeys.reduce((acc,key)=>{
            let value = meta[key]
            if (Array.isArray(value)) {
                value = (value as string[]).sort().join('')
            }
            if (value) {
                acc[key] = ""+value
            }
            return acc
        },{} as Record<string,any>)
        const groupId = CryptoJS.SHA256(JSON.stringify(sortedMap)).toString(CryptoJS.enc.Hex)
        return groupId
    }
    _addHexPrefixIfAbsent(hex:string){
        if (hex.indexOf('0x') === 0) return hex
        return '0x'+hex
    }
    addressToInboxId(address:string):string{
        return this._sha256Hash(address)
    }
    _sha256Hash(str:string):string{
        return CryptoJS.SHA256(str).toString(CryptoJS.enc.Hex)
    }
    _groupIdToGroupMembers(groupId:string):string[]{
        return this._groupIdCache[groupId] || []
    }
    _mqttClient?:MqttClient
    setupMqttConnection(connect:(url:string)=>MqttClient){
        // log enter setupMqttConnection
        console.log('setupMqttConnection enter')
        if (this._mqttClient) {
            // log setupMqttConnection already setup then return
            console.log('setupMqttConnection already setup then return')
        }
        const client = connect(`wss://${INX_GROUPFI_DOMAIN}/api/groupfi/mqtt/v1`)
        // log connect close disconnect
        client.on('connect', function () {
            console.log('mqtt connected')
        })
        client.on('close', function () {
            console.log('mqtt closed')
        })
        client.on('reconnect', function () {
            console.log('Reconnecting');
        });
        client.on('disconnect', function () {
            console.log('mqtt disconnected')
        })
        client.on('error', function (error) {
            console.log('mqtt error',error)
        })
        client.on('message', this._handleMqttMessage.bind(this))
        this._mqttClient = client
    }
    _iotaMqttClient?:IotaMqttClient
    setupIotaMqttConnection(mqttClient:new (...args: any[])=>IotaMqttClient){
        const client = new mqttClient(`wss://api.shimmer.network:443/api/mqtt/v1`)
        console.log('iota mqtt client setup',client)

        this._iotaMqttClient = client
    
    }
    async waitOutput(outputId:string) {
        if (!this._iotaMqttClient) throw new Error('iota mqtt client not setup')
        return new Promise((resolve,reject)=>{
            const subscriptionId = this._iotaMqttClient!.output(outputId, (topic,data)=>{
                this._iotaMqttClient!.unsubscribe(subscriptionId)
                console.log('output',topic,data,subscriptionId,this._iotaMqttClient)
                resolve(data)
            })
            console.log('waitOutput',outputId,this._iotaMqttClient)
        })
    }

    async waitBlock(blockId: string) {
        if(!this._iotaMqttClient) {
            throw new Error('iota mqtt client not setup')
        }
        return new Promise((resolve, reject) => {
            const subscriptionId = this._iotaMqttClient!.blocksMetadata(blockId, (topic: string, data) => {
                this._iotaMqttClient!.unsubscribe(subscriptionId)
                console.log('block', topic, data)
                if(data.isSolid) {
                    resolve(data)
                }
            })
            console.log('waitBlock', blockId, this._iotaMqttClient)
        })
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
        // log address groupIds
        console.log('switchMqttAddress address groupIds',address,groupIds)
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
        const timestamp = getCurrentEpochInSeconds()
        return {
            schemaVersion,
            groupId,
            messageType,
            authScheme,
            timestamp,
            recipients:[],
            data: message
        }
    }


    async fetchMessageOutputList(address:string, coninuationToken?:string, limit:number=10) {
        try {
            const params = {address:`${address}`,size:limit, token:coninuationToken}
            const paramStr = formatUrlParams(params)
            const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/inboxitems${paramStr}`
            // @ts-ignore
            const res = await fetch(url,{
                method:'GET',
                headers:{
                'Content-Type':'application/json',
                }})
            const data = await res.json() as InboxItemResponse
            const {items,token} = data
            return {items,token}
        } catch (error) {
            console.log('error',error)
        }
    }

    // fetch publicitems output list
    async fetchPublicMessageOutputList(groupId:string, startToken?:string, endToken?:string, size:number=10) {
        try {
            const params = {groupId:`${groupId}`,size,startToken,endToken}
            const paramStr = formatUrlParams(params)
            const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/publicitems${paramStr}`
            const res = await fetch(url)
            const data = await res.json() as PublicItemsResponse
            return data
        } catch (error) {
            console.log('error',error)
        }
    }
    async fetchIpfsOrigins(address:string):Promise<string[]>{
        const url = `${NFT_CONFIG_URL}/nft.json?v=${new Date().getTime()}`
        const res = await fetch(url)
        const json = await res.json()
        const {ipfsOrigins} = json
        return ipfsOrigins
    }
    async fetchAddressQualifiedGroups(address:string,ipfsOrigins:string[]):Promise<IGroupQualify[]>{
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/addressgroupdetails?address=${address}`
        const res = await fetch(url)
        const json = await res.json() as IGroupQualify[]
        const ipfsPolyfilled = (json ?? []).map((group:IGroupQualify)=>{
            const ipfsOrigin = ipfsOrigins[Math.floor(Math.random() * ipfsOrigins.length)]
            // check group.ipfsLink is contains ipfs://, if so, replace it with ipfsOrigin/ipfs/{ipfsLink replace ipfs:// with empty string}
            if (group.ipfsLink.indexOf('ipfs://') === 0) {
                group.ipfsLink = `${ipfsOrigin}/ipfs/${group.ipfsLink.replace('ipfs://','')}`
            }
            return group
        })
        return ipfsPolyfilled
    }
    // fetch qualified addresses for a group, /groupqualifiedaddresses
    async fetchGroupQualifiedAddresses(groupId:string):Promise<string[]>{
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/groupqualifiedaddresses?groupId=0x${groupId}`
        const res = await fetch(url)
        const json = await res.json()
        return json
    }
    // fetch marked addresses for a group, /groupmarkedaddresses
    async fetchGroupMarkedAddresses(groupId:string):Promise<string[]>{
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/groupmarkedaddresses?groupId=0x${groupId}`
        const res = await fetch(url)
        const json = await res.json()
        return this._ensureList(json)
    }
    // fetch member addresses for a group, /groupmemberaddresses
    async fetchGroupMemberAddresses(groupId:string):Promise<{ownerAddress:string,publicKey:string, timestamp: number}[]>{
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/groupmemberaddresses?groupId=${this._addHexPrefixIfAbsent(groupId)}`
        const res = await fetch(url)
        const json = await res.json()
        return this._ensureList(json)
    }
    _ensureList(list:any[]|undefined){
        if (!list) return []
        return list
    }
    // fetch public key of a address, /getaddresspublickey
    async fetchAddressPublicKey(address:string):Promise<string|undefined>{
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/getaddresspublickey?address=${address}`
        const res = await fetch(url)
        const json = await res.json()
        return json
    }
    // fetch group votes for a group, /groupvotes
    async fetchGroupVotes(groupId:string):Promise<{groupId:string,addressSha256Hash:string,vote:number}>{
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/groupvotes?groupId=0x${groupId}`
        const res = await fetch(url)
        const json = await res.json()
        return json
    }
    // fetch group votes count for a group, /groupvotescount
    async fetchGroupVotesCount(groupId:string):Promise<{
        groupId: string;
        publicCount: number;
        privateCount: number;
        memberCount: number;
    }>{
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/groupvotescount?groupId=0x${groupId}`
        const res = await fetch(url)
        const json = await res.json()
        return json
    }
    // fetch group blacklist for a group, /groupblacklist
    async fetchGroupBlacklist(groupId:string):Promise<string[]>{
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/groupblacklist?groupId=0x${groupId}`
        const res = await fetch(url)
        const json = await res.json()
        return this._ensureList(json)
    }
    // fetch address member groups for an address, /addressmembergroups
    async fetchAddressMemberGroups(address:string):Promise<string[]>{
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/addressmembergroups?address=${address}`
        const res = await fetch(url)
        if (!res.ok) {
            throw new Error(`fetchAddressMemberGroups error ${res.status} ${res.statusText}`)
        }
        const json = await res.json()
        return this._ensureList(json)
    }
    // fetch address mark groups for an address, /addressmarkgroups
    async fetchAddressMarkGroups(address:string):Promise<string[]>{
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/addressmarkgroups?address=${address}`
        const res = await fetch(url)
        const json = await res.json()
        return this._ensureList(json)
    }
    // RouteGroupUserReputation = "/groupuserreputation"
    async fetchGroupUserReputation(groupId:string):Promise<IGroupUserReputation[]>{
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/groupuserreputation?groupId=0x${groupId}`
        const res = await fetch(url)
        const json = await res.json()
        return this._ensureList(json)
    }

    // RouteUserGroupReputation = "/usergroupreputation"
    async fetchUserGroupReputation(groupId:string,address:string):Promise<IGroupUserReputation>{
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/usergroupreputation?address=${address}&groupId=0x${groupId}`
        const res = await fetch(url)
        const json = await res.json()
        return json
    }
    // get shared output for a group
    async checkIsGroupPublicFromSharedApiCall(groupId:string):Promise<boolean>{
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/shared?groupId=0x${groupId}`
            try {
                // @ts-ignore
                const res = await fetch(url,{
                    method:'GET',
                    headers:{
                    'Content-Type':'application/json'
                    }})
                if (!res.ok) {
                    if (res.status === 901) {
                        return true
                    } 
                }                    
                return false
            } catch (error) {
                console.log('error',error)
                return false
            }
    }
    // get shared output id for a group
    async fetchSharedOutputId(groupId:string):Promise<{outputId:string}>{
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/shared?groupId=0x${groupId}`
        try {
            const res = await fetch(url)
            const json = await res.json() as {outputId:string}
            return json
        } catch (error) {
            console.log('error',error)
            return {outputId:''}
        }
    }
    // addressqualifiedgroupconfigs
    async fetchAddressQualifiedGroupConfigs({address, includes, excludes}: {address: string, includes?: {groupName: string}[], excludes?: {groupName: string}[]}): Promise<MessageGroupMeta[]> {
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/addressqualifiedgroupconfigs?address=${address}`;
        const body = {
            includes,
            excludes
        };
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const json = await res.json() as MessageGroupMeta[];
        this._groupConfigMap = (json ?? []).reduce((acc, group) => {
            acc[group.groupName] = group;
            return acc;
        }, {} as Record<string, MessageGroupMeta>);
        return this._ensureList(json);
    }

    // TODO: It's temporary, it will be adjusted later.
    async fetchAddressQualifiedGroupConfigsWithoutSetting({address, includes, excludes}: {address: string, includes?: {groupName: string}[], excludes?: {groupName: string}[]}): Promise<MessageGroupMeta[]> {
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/addressqualifiedgroupconfigs?address=${address}`;
        const body = {
            includes,
            excludes
        };
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const json = await res.json() as MessageGroupMeta[];
        return this._ensureList(json);
    }

    // addressbalance
    async fetchAddressBalance(address:string):Promise<number>{
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/addressbalance?address=${address}`
        const res = await fetch(url)
        const json = await res.json()
        return json
    }    

    async fetchAddressNames(addressList: string[]): Promise<{[key: string]: {name: string}}> {
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/addressdid`
        const body = addressList
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const json = await res.json() as Array<{name: string, address: string} | null>
        const map: {[key: string]: {name: string}} = {}
        json.map(item => {
            if(item) {
                const nameRaw = item.name
                let name = nameRaw
                if(nameRaw.endsWith('.gf')) {
                    name = nameRaw.slice(0, name.length-3)
                }
                map[item.address] = {name}
            }
        })
        return map
    }

    setPublicKeyForPreparedMessage(message:IMMessage, publicKeyMap:Record<string,string>){
        // check if message.recipients is null
        if (message.recipients == undefined) {
            throw new Error("recipients is null");
        }
        message.recipients = message.recipients.map(pair=>{
            pair.mkey = publicKeyMap[pair.addr]
            return pair
        })
    }

    _generateRandomStr(len:number){
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
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
    _compressMessageText(message:IMMessage){
        const compressed = LZString.compressToUint8Array(message.data)
        message.data = bytesToHex(compressed)
    }
    _decompressMessageText(message:IMMessage){
        const bytes = hexToBytes(message.data)
        const decompressed = LZString.decompressFromUint8Array(bytes)
        message.data = decompressed
    }
    async serializeMessage(message:IMMessage, extra:{encryptUsingPublicKey?:(key:string,data:string)=>Promise<Uint8Array>, groupSaltResolver?:(groupId:string)=>Promise<string>}):Promise<Uint8Array>{
        const {encryptUsingPublicKey,groupSaltResolver} = extra
        const groupSha256Hash = message.groupId
        const groupBytes = hexToBytes(groupSha256Hash)
        this._compressMessageText(message)
        // data encryption related
        if (message.messageType === MessageTypePrivate) {
            let salt = ''
            if (message.authScheme === MessageAuthSchemeRecipeintInMessage) {
                salt = this._generateRandomStr(32)
            } else if (message.authScheme === MessageAuthSchemeRecipeintOnChain) {
                if (!groupSaltResolver) throw new Error('groupSaltResolver is required for MessageAuthSchemeRecipeintOnChain')
                salt = await groupSaltResolver(message.groupId)
            }
            message.data =this._encrypt(message.data,salt)
            // recipient handling
            if (message.authScheme === MessageAuthSchemeRecipeintInMessage) {
                if (!encryptUsingPublicKey) throw new Error('encryptUsingPublicKey is required for MessageAuthSchemeRecipeintInMessage')
                // check if message.recipients is null
                if (message.recipients == undefined) {
                    throw new Error("recipients is null");
                }
                message.recipients = await Promise.all(message.recipients.map(async (pair)=>{
                    pair.mkey = bytesToHex(await encryptUsingPublicKey(pair.mkey,salt))
                    return pair
                }))
            }
        }
        
        const message_ = this._compileMessage(message)
        const ws = new WriteStream()
        serializeIMMessage(ws,message_)
        const msgBytes = ws.finalBytes()
        return msgBytes
    }
              
    async sleep(ms:number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    getMessageId(messageBytes:Uint8Array,senderAddressBytes:Uint8Array):string{
        const msgIdBytes = blake256Hash(concatBytes(messageBytes,senderAddressBytes))
        return bytesToHex(msgIdBytes, true)
    }
    async deserializeMessage(messageBytes:Uint8Array, address:string, extra:{decryptUsingPrivateKey?:(data:Uint8Array)=>Promise<string>, sharedOutputSaltResolver?:(outputId:string)=>Promise<string>} ):Promise<IMMessage>{
        const {decryptUsingPrivateKey,sharedOutputSaltResolver} = extra
        const rs = new ReadStream(messageBytes)
        const msg_ = deserializeIMMessage(rs)
        const msg = this._decompileMessage(msg_)
        // decryption handling
        if (msg.messageType === MessageTypePrivate) {
            let salt = ''
            if (msg.authScheme === MessageAuthSchemeRecipeintInMessage) {
                if (!decryptUsingPrivateKey) throw new Error('decryptUsingPrivateKey is required for MessageAuthSchemeRecipeintInMessage')
                const addressHashValue = this.getAddressHashStr(address)
                // check if message.recipients is null
                if (msg.recipients == undefined) {
                    throw new Error("recipients is null");
                }
                for (const recipient of msg.recipients) {
                    if (!recipient.mkey) continue
                    if (recipient.addr !== addressHashValue) continue
                    salt = await decryptUsingPrivateKey(hexToBytes(recipient.mkey))
                    if (!salt) break
                    if (!this.validateMsgWithSalt(msg,salt)) {
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
            msg.data = this._decrypt(msg.data,salt)
        }
        this._decompressMessageText(msg)
        return msg as IMMessage
    }
    

    serializeRecipientList(recipients:IMRecipient[], groupId:string):Uint8Array{
        const groupBytes = hexToBytes(groupId)
        const recipientIntermediateList = recipients.map(recipient=>this._compileRecipient(recipient))
        const ws = new WriteStream()
        serializeRecipientList(ws,{
            schemaVersion: MessageCurrentSchemaVersion,
            groupId: groupBytes,
            list: recipientIntermediateList,
        })
        const pl = ws.finalBytes()
        return pl;
    }
    deserializeRecipientList(recipientListBytes:Uint8Array):IMRecipient[]{
        const rs = new ReadStream(recipientListBytes)
        const  {list} = deserializeRecipientList(rs)

        return list.map(recipient=>this._decompileRecipient(recipient))
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
        const {schemaVersion,groupId,messageType,authScheme, timestamp, data} = message
        const portionOfRes = {
            schemaVersion,
            groupId: hexToBytes(groupId),
            messageType,
            authScheme,
            timestamp,
            data: strToBytes(data),
        }
        if (message.messageType === MessageTypePrivate) {
            if (message.authScheme === MessageAuthSchemeRecipeintInMessage) {
                // check if message.recipients is null
                if (message.recipients == undefined) {
                    throw new Error("recipients is null");
                }
                const recipients = message.recipients.map(recipient=>this._compileRecipient(recipient))
                return {
                    ...portionOfRes,
                    recipients,
                }
            } else if (message.authScheme === MessageAuthSchemeRecipeintOnChain) {
                // check if message.recipientOutputid is null
                if (message.recipientOutputid == undefined) {
                    throw new Error("recipient_outputid is null");
                }
                const recipientOutputid = hexToBytes(message.recipientOutputid)
                return {
                    ...portionOfRes,
                    recipientOutputid,
                }
            } else {
                throw new Error('invalid authScheme')
            }
        } else {
            return portionOfRes
        }
    }


    _decompileRecipient(recipient:IMRecipientIntermediate):IMRecipient{
        return {
            addr: bytesToHex(recipient.addr,false),
            mkey: bytesToHex(recipient.mkey,false),
        }
    }
    _decompileMessage(message:IMMessageIntermediate):IMMessage{
        const {schemaVersion,groupId,messageType,authScheme,timestamp,data} = message
        const compressedString = bytesToStr(data)
        const portionOfRes = {
            schemaVersion,
            groupId: bytesToHex(groupId,false),
            messageType,
            authScheme,
            timestamp,
            data:bytesToStr(data),
        }
        if (message.messageType === MessageTypePrivate) {
            if (message.authScheme === MessageAuthSchemeRecipeintInMessage) {
                // check if message.recipients is null
                if (message.recipients == undefined) {
                    throw new Error("recipients is null");
                }
                const recipients = message.recipients.map(recipient=>this._decompileRecipient(recipient))
                return {
                    ...portionOfRes,
                    recipients,
                }
            } else if (message.authScheme === MessageAuthSchemeRecipeintOnChain) {
                // check if message.recipientOutputid is null
                if (message.recipientOutputid == undefined) {
                    throw new Error("recipient_outputid is null");
                }
                const recipientOutputid = bytesToHex(message.recipientOutputid,true)
                return {
                    ...portionOfRes,
                    recipientOutputid,
                }
            } else {
                throw new Error('invalid authScheme')
            }
        } else {
            return portionOfRes
        }

    }
    makeErrorForGroupMemberTooMany(){
        const err = new Error('group member too many')
        err.name = 'GroupMemberTooManyError'
        return err
    }
    makeErrorForUserDoesNotHasEnoughToken(){
        const err = new Error('user does not has enough token')
        err.name = 'UserDoesNotHasEnoughTokenError'
        return err
    }
    makeErrorForSaltNotFound(){
        const err = new Error('salt not found')
        err.name = 'SaltNotFoundError'
        return err
    }
    // error for shared output not found
    makeErrorForSharedOutputNotFound(sharedOutputId:string):SharedNotFoundError{
        const err = new SharedNotFoundError('',sharedOutputId )
        err.name = 'SharedOutputNotFoundError'
        return err
    }
    // verify error for shared output not found
    verifyErrorForSharedOutputNotFound(err:any){
        return err.name === 'SharedOutputNotFoundError'
    }
    verifyErrorForGroupMemberTooMany(err:any){
        return err.name === 'GroupMemberTooManyError'
    }
    verifyErrorForUserDoesNotHasEnoughToken(err:any){
        return err.name === 'UserDoesNotHasEnoughTokenError'
    }
    verifyErrorForSaltNotFound(err:any){
        return err.name === 'SaltNotFoundError'
    }
    validateMsgWithSalt(msg:IMMessage, salt:string){
        const firstMsgDecrypted = this._decrypt(msg.data,salt)
        if (!firstMsgDecrypted) return false
        return true
    }
    _encrypt(content:string,salt:string){
        const contentWord = CryptoJS.enc.Hex.parse(content)
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
        const decrypted = CryptoJS.AES.decrypt(encryptedParam, kdf, this._decorateAesCfg({iv})).toString(CryptoJS.enc.Hex)
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
        if (type === ImInboxEventTypeNewMessage) {
            const sender = value.slice(2,34).toString('hex')
            const meta = value.slice(34).toString('hex')
            const groupId = value.slice(35,67).toString('hex')
            console.log('parsePushedValue',value,type,groupId)
            return {type, groupId, sender, meta}
        } else if (type === ImInboxEventTypeGroupMemberChanged) {
            const groupId = value.slice(1,33).toString('hex')
            const milestoneTimestamp = value.slice(37,41).readUInt32BE(0)
            const isNewMember = value[41] === 1
            const addressLen = value.slice(42,44).readUInt16BE(0)
            const buf = value.slice(44,44+addressLen)
            // buf to number[]
            // @ts-ignore
            const address = String.fromCharCode.apply(null, buf)
            return {type, groupId, timestamp:milestoneTimestamp, isNewMember, address}
        }
        
    }
    // EncryptedHexPayload to EncryptedPayload
    encryptedHexPayloadToEncryptedPayload(encryptedHexPayload:EncryptedHexPayload):EncryptedPayload{
        const {payload:hexPayload, ...rest} = encryptedHexPayload
        const payload = hexToBytes(hexPayload)
        return {
            ...rest,
            payload
        }
    }
    // EncryptedPayload to EncryptedHexPayload
    encryptedPayloadToEncryptedHexPayload(encryptedPayload:EncryptedPayload):EncryptedHexPayload{
        // log encryptedPayload
        console.log('encryptedPayloadToEncryptedHexPayload',encryptedPayload)
        const {payload, ...rest} = encryptedPayload
        console.log('encryptedPayloadToEncryptedHexPayload, payload',payload)
        const hexPayload = bytesToHex(payload)
        return {
            ...rest,
            payload:hexPayload
        }
    }
}

const instance = new IotaCatSDK

export const IOTACATTAG = 'GROUPFIV4'
export const IOTACATSHAREDTAG = 'GROUPFISHAREDV2'
export const GROUPFIMARKTAG = 'GROUPFIMARKV2'
export const GROUPFIMUTETAG = 'GROUPFIMUTEV1'
export const GROUPFIVOTETAG = 'GROUPFIVOTEV2'
export const GROUPFISELFPUBLICKEYTAG = 'GROUPFISELFPUBLICKEY'
export const IotaCatSDKObj = instance
export const OutdatedTAG = ['IOTACAT','IOTACATSHARED','IOTACATV2','IOTACATSHAREDV2','GROUPFIV1','GROUPFIV2','GROUPFIV3','GROUPFISHAREDV1','GROUPFIMARKV1']
export * from './misc'
