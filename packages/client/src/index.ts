import CryptoJS from 'crypto-js'
import { Bip32Path, Blake2b, Ed25519, Bip39, Sha512 } from "@iota/crypto.js";
import {
    ADDRESS_UNLOCK_CONDITION_TYPE,
    BASIC_OUTPUT_TYPE, Bech32Helper,
    DEFAULT_PROTOCOL_VERSION,
    Ed25519Address,
    generateBip44Address,
    Ed25519Seed,
    ED25519_ADDRESS_TYPE,
    ED25519_SIGNATURE_TYPE,
    IBasicOutput, IBlock, IndexerPluginClient, IOutputsResponse, ITransactionEssence, ITransactionPayload, IUTXOInput,
    serializeTransactionEssence, SIGNATURE_UNLOCK_TYPE, SingleNodeClient,
    TransactionHelper,
    TRANSACTION_ESSENCE_TYPE,
    TRANSACTION_PAYLOAD_TYPE,
    UnlockTypes,
    ITagFeature,
    IMetadataFeature,
    HexEncodedString,
    IKeyPair,
    INodeInfo,
    INodeInfoProtocol,
    IPowProvider,
    COIN_TYPE_SHIMMER,
    IAddressUnlockCondition,
    IEd25519Address,
    IOutputResponse,
    REFERENCE_UNLOCK_TYPE,
    TIMELOCK_UNLOCK_CONDITION_TYPE,
    OutputTypes,
    ClientError,
    IIssuerFeature,
    IExpirationUnlockCondition,
    IStateControllerAddressUnlockCondition,
    ITimelockUnlockCondition,
    IStorageDepositReturnUnlockCondition,
    IOutputMetadataResponse,
    INftOutput,
    NFT_OUTPUT_TYPE,
    ISSUER_FEATURE_TYPE,
    METADATA_FEATURE_TYPE,
    TAG_FEATURE_TYPE,
} from "@iota/iota.js";
import { Converter, WriteStream } from "@iota/util.js";
import { encrypt, decrypt, getEphemeralSecretAndPublicKey, util, setCryptoJS, setHkdf, setIotaCrypto, EncryptedPayload, decryptOneOfList, EncryptingPayload, encryptPayloadList } from 'ecies-ed25519-js';
import bigInt from "big-integer";
import { IMMessage, IotaCatSDKObj, IOTACATTAG, IOTACATSHAREDTAG, makeLRUCache,LRUCache, cacheGet, cachePut, MessageAuthSchemeRecipeintOnChain, MessageAuthSchemeRecipeintInMessage, INX_GROUPFI_DOMAIN, 
    IMUserMarkedGroupId, serializeUserMarkedGroupIds, deserializeUserMarkedGroupIds,
    IMUserMuteGroupMember,serializeUserMuteGroupMembers, deserializeUserMuteGroupMembers,
    IMUserVoteGroup, serializeUserVoteGroups, deserializeUserVoteGroups,
    GROUPFIMARKTAG, GROUPFIMUTETAG, GROUPFIVOTETAG, GROUPFIPAIRXTAG,
    GROUPFIPROFILETAG,
    GROUPFICASHTAG,MessageGroupMeta,
    GROUPFILIKETAG,
    IMUserLikeGroupMember,
    serializeUserLikeGroupMembers,
    AddressType,
    MessageResponseItemPlus,
    IMAGE_PRESIGN_SERVICE_URL,
    MessageTypePrivate
} from "groupfi-sdk-core";
import {runBatch, formatUrlParams, getCurrentEpochInSeconds, getAllBasicOutputs, concatBytes, EthEncrypt, generateSMRPair, bytesToHex, tracer, getImageDimensions } from 'groupfi-sdk-utils';
import AddressMappingStore from './AddressMappingStore';
import nameMappingCache from './nameMappingCache';
import { IRequestAdapter, PairX, IProxyModeRequestAdapter } from './types'
export * from './types'
export { AddressMappingStore, nameMappingCache}
type IntermediateResult = {
    outputIdHex: string;
    senderAddress: string;
    senderAddressBytes: Uint8Array;
    name?: string;
    avatar?: string
    data: Uint8Array;
};
//TODO tune concurrency
const httpCallLimit = 5;
const consolidateBatchSize = 29;
const cashSplitNums = 8;
setIotaCrypto({
    Bip39,
    Ed25519,
    Sha512
})

import hkdf from 'js-crypto-hkdf';
import { IMRecipient } from "groupfi-sdk-core";
import { EventEmitter } from 'events';
import { GroupMemberTooManyToPublicThreshold } from "groupfi-sdk-core";
import { MessageTypePublic } from "groupfi-sdk-core";
import { IMessage } from 'groupfi-sdk-core';
import { ImInboxEventTypeNewMessage } from 'groupfi-sdk-core';
import { EventGroupMemberChanged } from 'groupfi-sdk-core';
import { ImInboxEventTypeGroupMemberChanged } from 'groupfi-sdk-core';
import { GROUPFISELFPUBLICKEYTAG } from 'groupfi-sdk-core';
import { SharedNotFoundError } from 'groupfi-sdk-core';
import { createBlobURLFromUint8Array } from 'groupfi-sdk-utils';
import { releaseBlobUrl } from 'groupfi-sdk-utils';
import { ConcurrentPipe } from 'groupfi-sdk-utils';
import { GROUPFIReservedTags } from 'groupfi-sdk-core';

import { Mode, DelegationMode, ImpersonationMode, ShimmerMode } from './types'

import { GROUPFIQUALIFYTAG } from 'groupfi-sdk-core';
import { serializeEvmQualify } from 'groupfi-sdk-core';
import addressMappingCache from './AddressMappingCache';
setHkdf(async (secret:Uint8Array, length:number, salt:Uint8Array)=>{
    const res = await hkdf.compute(secret, 'SHA-256', length, '',salt)
    return res.key;
})
setCryptoJS(CryptoJS)
const tag = Converter.utf8ToBytes(IOTACATTAG)

export interface StorageFacade {
    prefix: string;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
}
type OutputResponseWrapper = {
    output: IOutputResponse;
    outputId: string;
}
type BasicOutputWrapper = {
    output: IBasicOutput;
    outputId: string;
}
type OutputWrapper = {
    output: OutputTypes;
    outputId: string;
}
type MessageResponseItem = {
    type: typeof ImInboxEventTypeNewMessage
    outputId: string;
    timestamp: number;
}
type EventItem = MessageResponseItem | EventGroupMemberChanged

type MessageResponse = {
    messages:MessageResponseItem[]
    headToken:string
    tailToken:string
}
type InboxItemResponse = {
    items:EventItem[]
    token:string
}
/*
type PublicItemsResponse struct {
	Items      []MessageResponseItem `json:"items"`
	StartToken string             `json:"startToken"`
	EndToken   string             `json:"endToken"`
}
*/
type PublicItemsResponse = {
    items:MessageResponseItem[]
    startToken:string
    endToken:string
}
export type MessageBody = {
    type: typeof ImInboxEventTypeNewMessage,
    sender:string,
    message:string,
    messageId:string,
    groupId:string,
    timestamp:number
}
export type EventItemFullfilled = EventGroupMemberChanged | MessageBody
type NftItemReponse = {
    ownerAddress: string;
    publicKey: string;
    nftId: string;
}


export const SharedNotFoundLaterRecoveredMessageKey = 'SharedNotFoundLaterRecovered'
type Constructor<T> = new () => T;
export class GroupfiSdkClient {
    _client?: SingleNodeClient;
    _indexer?: IndexerPluginClient;
    // _nodeInfo?: INodeInfo;
    _protocolInfo?: INodeInfoProtocol;
    _walletKeyPair?: IKeyPair;
    _accountHexAddress?:string;
    _accountBech32Address?:string;
    _pubKeyCache?:LRUCache<string>;
    _storage?:StorageFacade;
    _networkId?:string;
    _events:EventEmitter = new EventEmitter();
    //TODO simple cache
    _saltCache:Record<string,string> = {};
    _sharedNotFoundRecoveringMessageCheckInterval:NodeJS.Timeout|undefined;

    _sharedNotFoundRecoveringMessage:Record<string,{payload:{data:Uint8Array,senderAddressBytes:Uint8Array,address:string}[],lastCheckTime:number,numOfChecks:number}> = {};

    _sharedSaltCache:Record<string,string> = {}
    _sharedSaltFailedCache:Set<string> = new Set()
    _sharedSaltWaitingCache:Record<string,{resolve:Function,reject:Function}[]> = {}
    _lastSendTimestamp:number = 0
    _remainderHintOutdatedTimeperiod = 35 * 1000

    _requestAdapter?: IRequestAdapter
    _mode?: Mode
    _pairX?: PairX
    _updateNodeProtocolInfoInterval:NodeJS.Timeout|undefined
    // get pairX publickey in hex
    getPairXPublicKey():string|undefined{
        if (!this._pairX) return
        return bytesToHex(this._pairX.publicKey) 
    }
    switchAdapter(params: {adapter: IRequestAdapter, mode: Mode}) {
        const { adapter, mode } = params 
        this._mode = mode
        this._requestAdapter = adapter
    }

    getRequestAdapter() {
        if (!this._requestAdapter) {
            throw new Error('request adapter is undefined.')
        }
        return this._requestAdapter
    }

    async switchAddress(bech32Address: string, pairX?: PairX){
        this._pairX = pairX
        this._accountBech32Address = bech32Address
        // const res = Bech32Helper.fromBech32(bech32Address, this._nodeInfo!.protocol.bech32Hrp)
        const res = Bech32Helper.fromBech32(bech32Address, this._protocolInfo!.bech32Hrp)
        if (!res) throw new Error('Invalid bech32 address')
        const {addressType, addressBytes} = res
        if (addressType !== ED25519_ADDRESS_TYPE) throw new Error('Address type not supported')
        this._accountHexAddress = Converter.bytesToHex(addressBytes,true)
        // reset _remainderHintSet only if bech32Address is different
        if (this._remainderHintSet.length > 0) {
            const first = this._remainderHintSet[0]
            const firstAddress = (first.output.unlockConditions.filter((unlockCondition)=>unlockCondition.type === ADDRESS_UNLOCK_CONDITION_TYPE)[0] as IAddressUnlockCondition).address as IEd25519Address
            const addressBytes = Converter.hexToBytes(firstAddress.pubKeyHash)
            const firstBech32Address = Bech32Helper.toBech32(ED25519_ADDRESS_TYPE,addressBytes, this._protocolInfo!.bech32Hrp)
            if (firstBech32Address !== bech32Address) {
                this._remainderHintSet = []
            }
        }
        this._lastSendTimestamp = 0;
        this._sharedSaltCache = {}
    }
    
    _queuePromise:Promise<any>|undefined;
    async setup(){
        const apiUrl = `https://${INX_GROUPFI_DOMAIN}`
        this._client = new SingleNodeClient(apiUrl)
        this._indexer = new IndexerPluginClient(this._client)
        this._protocolInfo = await this.firstGetNodeProtocolInfo(this._client)
        this._networkId = TransactionHelper.networkIdFromNetworkName(this._protocolInfo!.networkName)
        this._pubKeyCache = makeLRUCache<string>(200)
        this._sharedNotFoundRecoveringMessageCheckInterval = setInterval(()=>{
            this._tryProcessSharedNotFoundRecoveringMessage()
        }, 5000);
        // Execute once every 10 minutes
        this._updateNodeProtocolInfoInterval = setInterval(() => {
            this.periodicUpdateNodeProtocolInfo()
        }, 1000*60*10)
        this._queuePromise = Promise.resolve()
        // console.log('NodeInfo', this._nodeInfo);
        console.log('ProtocolInfo', this._protocolInfo);
    }
    getNodeProtocolInfoStorageKey() {
        return `${this._storage?.prefix}.ProtocolInfo`
    }
    async firstGetNodeProtocolInfo(client: SingleNodeClient) {
        this._ensureStorageInited()
        try {
            const key = this.getNodeProtocolInfoStorageKey()
            const storageValue = await this._storage!.get(key)
            if (storageValue !== null) {
                return JSON.parse(storageValue)
            }
            const res = await client.protocolInfo()
            this._storage!.set(key, JSON.stringify(res))
            return res
        } catch(error) {
            console.log('getNodeProtocolInfo error: ', error)
        }
    }
    async periodicUpdateNodeProtocolInfo() {
        this._ensureStorageInited()
        if (!this._client) return
        const protocolInfo = await this._client.protocolInfo()
        console.log('protocolInfo update success', protocolInfo)
        this._protocolInfo = protocolInfo
        this._storage!.set(this.getNodeProtocolInfoStorageKey(), JSON.stringify(protocolInfo))
    }
    setupStorage(storage:StorageFacade){
        this._storage = storage
    }
    _prepareRemainderHintSwitch:boolean = false
    // enable prepare remainder hint
    enablePrepareRemainderHint(){
        this._prepareRemainderHintSwitch = true
    }
    // disable prepare remainder hint
    disablePrepareRemainderHint(){
        this._prepareRemainderHintSwitch = false
    }
// prepare remainder hint
    // first check timeelapsed > 15 seconds since last send
    // then fetch all basic outputs for address with no timelock, no metadata
    // also fetch all basic outputs that timelock expires
    // then pick all as inputs, and split to 3 equal amount outputs, and send, outputs will be used as remainder hint
    async prepareRemainderHint(){
        if (!this._prepareRemainderHintSwitch) return false
        try {
            const timeElapsed = Date.now() - this._lastSendTimestamp
            if (timeElapsed < this._remainderHintOutdatedTimeperiod && this._remainderHintSet.length > 0) return false
            // log actually start prepare
            console.log('Actually start prepare remainder hint');
            const outputs = await this._getUnSpentOutputs({numbersWanted:100})
            // log outputs
            console.log('outputs', outputs);
            if (outputs.length === 0) return false
            let amount = outputs.reduce((acc,output)=>acc.add(bigInt(output.output.amount)),bigInt(0))
            // log amount
            console.log('amount', amount);
            const amountPerOutput = amount.divide(cashSplitNums)
            const outputsToSend:IBasicOutput[] = []
            for (let i = 0; i < cashSplitNums-1; i++) {
                outputsToSend.push(this._makeCashBasicOutput(amountPerOutput))
                amount = amount.subtract(amountPerOutput)
            }
            outputsToSend.push(this._makeCashBasicOutput(amount))
            const depositOfFirstOutput = TransactionHelper.getStorageDeposit(outputsToSend[0],this._protocolInfo!.rentStructure)
            // check if first output is enough for deposit
            if (amountPerOutput.compare(depositOfFirstOutput) < 0) {
                // log then return
                console.log('First output is not enough for deposit');
                this._remainderHintSet = []
                return false
            }
            // log outputsToSend and outputs in one line
            console.log('outputsToSend', outputsToSend, 'outputs', outputs);
            const {transactionId} = await this._sendTransactionWithConsumedOutputsAndCreatedOutputs(outputs,outputsToSend)
            const newRemainderHints = [] as BasicOutputWrapper[]
            for (let idx =0;idx<outputsToSend.length;idx++) {
                const output = outputsToSend[idx]
                newRemainderHints.push({output,outputId:TransactionHelper.outputIdFromTransactionData(transactionId,idx)})
            }
            this.resetAllRemainderHints(newRemainderHints);
            return true
        } catch (error) {
            console.log('prepareRemainderHint error', error);
            return false
        }
    }
    async _getDltShimmer(){
        const url = 'https://dlt.green/api?dns=shimmer&id=tanglepay&token=egm9jvee56sfjrohylvs0tkc6quwghyo'
        const res = await fetch(url)
        const json = await res.json()
        const domains = json.filter((item:any)=>item.ShimmerHornet.isHealthy).map((item:any) => item.ShimmerHornet.Domain)
        // random pick one
        const domain = domains[Math.floor(Math.random() * domains.length)];
        return domain
    }


    _outputIdToMessagePipe?: ConcurrentPipe<{outputId:string,output?:IBasicOutput,token:string,address:string,type:number},{message?:IMessage,outputId:string,status:number}>;
    _makeOutputIdToMessagePipe(){
        const processor = async (
            {outputId,output,token,address,type}:{outputId:string,output?:IBasicOutput,address:string,type:number,token:string},
            callback: (error?: Error | null) => void,
            stream:ConcurrentPipe<{outputId:string,output?:IBasicOutput,token:string,address:string,type:number},{message:IMessage,outputId:string}|undefined>
        )=>{
            const res = await this.getMessageFromOutputId({outputId,output,address,type})
            if (!res) {
                stream.push({outputId,status:-1})
                callback()
                return
            }
            const message = res
            ? {
                type: ImInboxEventTypeNewMessage,
                sender: res.sender,
                message: res.message.data,
                messageId: res.messageId,
                timestamp: res.message.timestamp,
                groupId: res.message.groupId,
                token
                }
            : undefined;
            if (this._mode === ShimmerMode) {
                const res = {message,outputId}
                stream.push(res)
                callback()
            } else {
                const fn = (evmAddress:string)=>{
                    message!.sender = evmAddress
                    const res = {message,outputId}
                    stream.push(res)
                    callback()
                }
                AddressMappingStore.getMapping(message!.sender, fn,callback)
            }
        }
        this._outputIdToMessagePipe = new ConcurrentPipe(processor, 12, 64, true)
    }
    getOutputIdToMessagePipe(){
        // if not inited, init
        if (!this._outputIdToMessagePipe) {
            this._makeOutputIdToMessagePipe()
        }
        return this._outputIdToMessagePipe!
    }
    async outputIdstoMessages (
        params:MessageResponseItemPlus[],
    ):Promise<{message?:IMessage,outputId:string}[]>
    {
        const resp = [] as {message?:IMessage,outputId:string}[]
        for (const item of params) {
            const res = await this.getMessageFromOutputId(item)
            const message = res
                            ? {
                                type: ImInboxEventTypeNewMessage,
                                sender: res.sender,
                                message: res.message.data,
                                messageId: res.messageId,
                                timestamp: res.message.timestamp,
                                groupId: res.message.groupId,
                                token: item.token,
                                name: undefined
                                } as IMessage
                            : undefined;
            resp.push({outputId:item.outputId, message})
        }
        // if not shimmer mode, then map sender to evm address
        if (this._mode !== ShimmerMode) {
            const smrAddressSet = new Set(resp.map(o=>o.message?.sender).filter(o=>!!o)) as Set<string>
            const smrAddressList = Array.from(smrAddressSet)
            const mapping = await addressMappingCache.batchGetEvmAddresses(smrAddressList)
            for (const item of resp) {
                // skip if no message
                if (!item.message) continue
                const evmAddress = mapping.get(item.message.sender)
                if (evmAddress) {
                    item.message.sender = evmAddress
                }
            }
        }
        // map sender to name
        const senderAddressSet = new Set(resp.map(o=>o.message?.sender).filter(Boolean)) as Set<string>
        const senderAddressList = Array.from(senderAddressSet)
        const nameMappingRes = await nameMappingCache.batchGetRes(senderAddressList)
        for(const item of resp) {
            if (!item.message) continue
            const nameMap = nameMappingRes.get(item.message.sender)
            if (nameMap) {
                item.message.name = nameMap.name
            }
        }
        return resp
    }

    async _getAddressListForGroupFromInxApi(groupId:string):Promise<{publicKey:string,ownerAddress:string}[]>{
        //TODO try inx plugin 
        try {
            const prefixedGroupId = IotaCatSDKObj._addHexPrefixIfAbsent(groupId)
            const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/nftswithpublickey?groupId=${prefixedGroupId}`
            console.log('_getAddressListForGroupFromInxApi url', url);
            const res = await fetch(url,
            {
                method:'GET',
                headers:{
                'Content-Type':'application/json'
                }
            })
            if (!res.ok) {
                console.log('_getAddressListForGroupFromInxApi res not ok', res.status);
            }
            console.log('_getAddressListForGroupFromInxApi res', res);
            const data = await res.json() as NftItemReponse[]
            const memberList = data.filter(o=>o.publicKey)
            // if length is more than GroupMemberTooManyThreshold, throw GroupMemberTooManyError
            if (memberList.length > GroupMemberTooManyToPublicThreshold) throw IotaCatSDKObj.makeErrorForGroupMemberTooMany()
            return memberList
        } catch (error) {
            console.log('_getAddressListForGroupFromInxApi error',error)
            if (IotaCatSDKObj.verifyErrorForGroupMemberTooMany(error)) {
                console.log('re throwing', error);
                throw error
            }
        }
        return []
    }
    async _getSharedOutputIdForGroupFromInxApi(groupId: string): Promise<{ outputId: string } | undefined> {
        try {
            const prefixedGroupId = IotaCatSDKObj._addHexPrefixIfAbsent(groupId);
            const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/shared/v2?groupId=${prefixedGroupId}`;
            try {
                // @ts-ignore
                const res = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                if (!res.ok) {
                    console.log('_getSharedOutputIdForGroupFromInxApi res not ok', res.status);
                    throw new Error('Failed to get shared output id from inx api with status code: ' + res.status);
                }
                const data = await res.json() as {code:number; outputId: string };
                if (data.code === 901) {
                    throw IotaCatSDKObj.makeErrorForGroupMemberTooMany();
                } 
                return data;
            } catch (error) {
                /*
                if (IotaCatSDKObj.verifyErrorForGroupMemberTooMany(error)) {
                    throw error;
                }
                */
                throw error;
            }
        } catch (error) {
            /*
            if (IotaCatSDKObj.verifyErrorForGroupMemberTooMany(error)) {
                throw error;
            }
            */
            console.log('error', error);
            throw error;
        }
        return undefined;
    }
    
    // make cash basic output for given amount
    _makeCashBasicOutput(amount:bigInt.BigInteger):IBasicOutput{
        const basicOutput: IBasicOutput = {
            type: BASIC_OUTPUT_TYPE,
            amount: amount.toString(),
            features: [
                {
                    type: 3,
                    tag: `0x${Converter.utf8ToHex(GROUPFICASHTAG)}`
                }
            ],
            unlockConditions: [
                {
                    type: ADDRESS_UNLOCK_CONDITION_TYPE,
                    address: {
                        type: ED25519_ADDRESS_TYPE,
                        pubKeyHash: this._accountHexAddress!
                    }
                }
            ]
        };
        return basicOutput
    }
    async _tryGetSharedOutputIdForGroup(groupId:string):Promise<{outputId:string}|undefined>{
        this._ensureClientInited()
        const apiRes = await this._getSharedOutputIdForGroupFromInxApi(groupId)
        if (apiRes && apiRes.outputId) {
            const {outputId} = apiRes
            return {outputId}
        } 
    }
    
    _getMemberSelfFromAddress(address:string):{addr:string,publicKey:string}|undefined{
        const pairXPublicKey = this.getPairXPublicKey()
        if (pairXPublicKey) {
            return {addr:address,publicKey:pairXPublicKey}
        }
    }
    async _getSaltForGroup(groupId:string, address:string,memberList?:{addr:string,publicKey:string}[]):Promise<{salt:string, outputId?:string, outputs?:IBasicOutput[],isHA:boolean}>{
        console.log(`_getSaltForGroup groupId:${groupId}, address:${address}`);
        const memberSelf = this._getMemberSelfFromAddress(address)
        const sharedOutputResp = await this._tryGetSharedOutputIdForGroup(groupId)
        // log sharedOutputResp
        console.log('sharedOutputResp', sharedOutputResp);
        let outputId:string|undefined
        let outputs:IBasicOutput[]|undefined
        if (sharedOutputResp) {
            const {outputId:outputIdUnwrapped} = sharedOutputResp
            outputId = outputIdUnwrapped
        }
        // try get salt from shared output cache
        if (outputId) {
            const saltFromCache = this._getSharedIdAndSaltFromCache(outputId)
            if (saltFromCache) return {salt:saltFromCache,outputId,isHA:false}
            try {
                const outputsResponse = await this._client!.output(outputId)
                outputs = [outputsResponse.output as IBasicOutput]
            } catch (error) {
                if (error instanceof ClientError) {
                    if (error.httpStatus == 404) {
                        const {outputs:outputsCreated,salt} = await this._makeSharedOutputForGroup({groupId,memberList,memberSelf})
                        return {salt, outputId,outputs:outputsCreated,isHA:true}
                    }
                }
            }
        }
        const {salt,outputs:outputUnwrapped} = await this._getSaltFromSharedOutput({sharedOutput:outputs?outputs[0]:undefined, address,isHA:true,groupId,memberList})
        const isHA = !!outputUnwrapped
        outputs = outputUnwrapped || outputs
        return {salt, outputId,outputs,isHA}
    }
    // get recipients from shared output
    _getRecipientsFromSharedOutput(sharedOutput:IBasicOutput):IMRecipient[]{
        const metaFeature = sharedOutput.features?.find((feature)=>feature.type == 2) as IMetadataFeature
        if (!metaFeature) throw new Error('Metadata feature not found')
        const bytes = Converter.hexToBytes(metaFeature.data)
        const recipients = IotaCatSDKObj.deserializeRecipientList(bytes)
        return recipients
    }
    // check if address is in recipient
    _checkIfAddressInRecipient(address:string,recipients:IMRecipient[]){
        const addressHashValue = IotaCatSDKObj.getAddressHashStr(address)
        const idx = recipients.findIndex((recipient)=>recipient.addr === addressHashValue)
        return idx
    }
    _isProcessingSharedNotFoundRecoveringMessage:boolean = false
    async _tryProcessSharedNotFoundRecoveringMessage(){
        if (this._isProcessingSharedNotFoundRecoveringMessage) return
        try {
            this._isProcessingSharedNotFoundRecoveringMessage = true
            const sharedNotFoundRecoveringMessage = this._sharedNotFoundRecoveringMessage
            const keys = Object.keys(sharedNotFoundRecoveringMessage)
            console.log('keys', keys);
            const existing = new Map()
            for (const outputId of keys) {
                try {
                    const res = await this._client!.output(outputId)
                    if (res) {
                        existing.set(outputId,res)
                    }
                } catch (error) {
                }
            }
            if (existing.size === 0) return
            const neoObject:Record<string,{payload:{data:Uint8Array,senderAddressBytes:Uint8Array,address:string}[],lastCheckTime:number,numOfChecks:number}> = {}
            const payloadToBeProcessed:{data:Uint8Array,senderAddressBytes:Uint8Array,address:string}[] = []
            for (const outputId of keys) {
                const item = sharedNotFoundRecoveringMessage[outputId]
                    
                if (!existing.has(outputId)) {
                    // if numOfChecks > 3, or timeelapsed > 30 seconds, bypass
                    const timeElapsed = Date.now() - item.lastCheckTime
                    if (item.numOfChecks > 3 || timeElapsed > 30 * 1000) {
                        // if not found, add to failed cache
                        this._sharedSaltFailedCache.add(outputId)
                        continue
                    }
                    // increase numOfChecks, update lastCheckTime
                    item.numOfChecks += 1
                    item.lastCheckTime = Date.now()
                    neoObject[outputId] = item
                } else {
                    const sharedOutputResponse = existing.get(outputId)
                    const {salt} = await this._getSaltFromSharedOutput({sharedOutput:sharedOutputResponse.output as IBasicOutput, address:item.payload[0].address,isHA:false})
                    this._resolveSharedSaltWaitingCache(outputId,salt)
                    payloadToBeProcessed.push(...item.payload)
                }
            }
            this._sharedNotFoundRecoveringMessage = neoObject
            console.log('sharedNotFoundRecoveringMessagePayloadToBeProcessed', payloadToBeProcessed);
            for (const payload of payloadToBeProcessed) {
                const messageRes = await this.getMessageFromMetafeaturepayloadAndSender(payload)
                if (messageRes) {
                    // emit event
                    this._events.emit(SharedNotFoundLaterRecoveredMessageKey,messageRes)
                }
            }
        } catch (error) {
            console.log('_tryProcessSharedNotFoundRecoveringMessage error', error);
        } finally {
            this._isProcessingSharedNotFoundRecoveringMessage = false
        }
    }
    async _getSaltFromSharedOutput({sharedOutputId, sharedOutput,address,isHA=false,groupId,memberList}:{sharedOutputId?:string,sharedOutput?:IBasicOutput, address:string,isHA?:boolean,groupId?:string,memberList?:{addr:string,publicKey:string}[]}):Promise<{salt:string,outputs?:IBasicOutput[]}>{
        let idx = -1
        let recipients:IMRecipient[]|undefined
        if (sharedOutput) {
            recipients = this._getRecipientsFromSharedOutput(sharedOutput)
            idx = this._checkIfAddressInRecipient(address,recipients)
            console.log('recipients', recipients,'idx', idx);      
        }
        if (idx === -1) {
            if (isHA && groupId) {
                // log ha and groupid and memberList
                console.log('isHA and groupId and memberList', isHA, groupId, memberList);
                const memberSelf = this._getMemberSelfFromAddress(address)
                const {outputs,salt} = await this._makeSharedOutputForGroup({groupId,memberList,memberSelf})
                return {salt,outputs}
            } else {
                throw new Error(`Address not found in shared output, address:${address},sharedOutputId:${sharedOutputId}`)
            }
        } else {
            // move idx recipient to first, and prepare ephemeral public key at start, adjust idx to 0
            let recipientPayload:Uint8Array
            const first = recipients![0]
            if (idx === 0) {
                recipientPayload = Converter.hexToBytes(first.mkey)
            } else {
                const first = recipients![0]
                const pubkey = Converter.hexToBytes(first.mkey).slice(0,32)
                const target = recipients![idx]
                recipientPayload = concatBytes(pubkey,Converter.hexToBytes(target.mkey))
            }
            // const recipientPayloadUrl = createBlobURLFromUint8Array(recipientPayload)
            const salt = await this._decryptAesKeyFromRecipientsWithPayload(recipientPayload)
            if (!salt) {
                if (isHA && groupId) {
                    // log ha and groupid and memberList
                    console.log('isHA and groupId and memberList', isHA, groupId, memberList);
                    const memberSelf = this._getMemberSelfFromAddress(address)
                    const {outputs,salt} = await this._makeSharedOutputForGroup({groupId,memberList,memberSelf})
                    return {salt,outputs}
                } else {
                    throw new Error('Salt not found')
                }
            }
            // successfully got salt from shared output, cache it
            if (sharedOutputId) {
                this._setSharedIdAndSaltToCache(sharedOutputId,salt)
            }
            return {salt}
        }
    }
    async _getSaltFromSharedOutputId(outputId:string, address:string):Promise<{salt:string}>{
        
        // check if in failed cache
        if (this._sharedSaltFailedCache.has(outputId)) {
            // log salt failed cache hit
            console.log('salt failed cache hit', outputId);
            // TODO error type?
            throw new Error('Shared output not found')
        }
        // try get salt from shared output cache
        const saltFromCache = this._getSharedIdAndSaltFromCache(outputId)
        if (saltFromCache) {
            return {salt:saltFromCache}
        }
        
        // if not in cache, check if in waiting cache
        const waiting = this._sharedSaltWaitingCache[outputId]
        if (waiting) {
            // log waiting cache hit
            console.log('waiting cache hit', outputId);
            const wait = new Promise((resolve,reject)=>{
                waiting.push({resolve,reject})
                setTimeout(()=>{
                    reject(new Error('Timeout'))
                }, 5000)
            })
            try {
                const salt = await wait as string
                return {salt}
            } catch (error) {
                //TODO log for now
                console.log('error', error);
                throw error
            }
        } else {
            // if not in waiting cache, add to waiting cache
            this._sharedSaltWaitingCache[outputId] = []
        }
        try {
            // log salt cache miss, fetch from network
            console.log('cache miss fetch from network', outputId);
            const outputsResponse = await this._client!.output(outputId)
            const output = outputsResponse.output as IBasicOutput
            // log
            console.log('cache miss fetch from network,output fetched', output);
            const {salt} = await this._getSaltFromSharedOutput({sharedOutputId:outputId, sharedOutput:output, address, isHA:false})
            this._resolveSharedSaltWaitingCache(outputId,salt)
            return {salt}
        } catch (error) {
            if (error instanceof ClientError) {
                if (error.httpStatus === 404) {
                    throw IotaCatSDKObj.makeErrorForSharedOutputNotFound(outputId)
                }
            }
            
            // check if in waiting cache
            const waiting = this._sharedSaltWaitingCache[outputId]
            if (waiting) {
                for (const item of waiting) {
                    item.reject(error)
                }
                delete this._sharedSaltWaitingCache[outputId]
            }
            throw error
        }
        
    }
   // resolve _sharedSaltWaitingCache with outputId and salt
    async _resolveSharedSaltWaitingCache(outputId:string,salt:string){
        const waiting = this._sharedSaltWaitingCache[outputId]
        if (waiting) {
            for (const item of waiting) {
                item.resolve(salt)
            }
            delete this._sharedSaltWaitingCache[outputId]
        }
    }
    // get evm qualify list
    async getEvmQualifyList(groupId:string, memberSelf?:{addr:string,publicKey:string}):Promise<{addressKeyList:{addr:string,publicKey:string}[],signature:string,isSelfInList:boolean}>{
        let previouslyQualified =  (await IotaCatSDKObj.fetchGroupQualifiedAddressPublicKeyPairs(groupId)) ?? []
        const memberList = previouslyQualified.map((pair:{ownerAddress:string,publicKey:string})=>({addr:pair.ownerAddress,publicKey:pair.publicKey}))
        // add memberSelf to memberList, if memberSelf exist and memberSelf is not in memberList
        if (memberSelf) {
            const idx = memberList!.findIndex((pair)=>pair.addr === memberSelf.addr)
            if (idx === -1) {
                memberList!.push(memberSelf)
            }
        }
        const addressToBeFiltered = memberList ? memberList.map(member=>member.addr) : []
        
        const {addressList:addressListFiltered,signature} = await IotaCatSDKObj.filterEvmGroupQualify(addressToBeFiltered,groupId)
        const memberListFiltered = memberList?.filter((pair)=>{
            const {addr} = pair
            return addressListFiltered.includes(addr)
        })
        // log memberListFiltered
        console.log('EvmQualifyList', memberListFiltered);
        const isSelfInList = !!(memberSelf && memberListFiltered?.findIndex((pair)=>pair.addr === memberSelf.addr) !== -1)
        return {addressKeyList:memberListFiltered,signature,isSelfInList}
    }
    // get plugin evm qualify list
    async getPluginEvmQualifyList(groupId:string):Promise<{addr:string,publicKey:string}[]>{
        const list =  (await IotaCatSDKObj.fetchGroupQualifiedAddressPublicKeyPairs(groupId)) ?? [] 
        return list.map((pair:{ownerAddress:string,publicKey:string})=>({addr:pair.ownerAddress,publicKey:pair.publicKey}))     
    }
    // _makeSharedOutputForEvmGroup
    async _makeSharedOutputForEvmGroup({groupId,memberList,memberSelf}:{groupId:string,memberList?:{addr:string,publicKey:string}[],memberSelf?:{addr:string,publicKey:string}}):Promise<{outputs:IBasicOutput[],salt:string}>{
        // log entering
        console.log(`_makeSharedOutputForEvmGroup groupId:${groupId}, memberList:${memberList}, memberSelf:${memberSelf}`);
        try {
            //TODO move to group meta domain
            //const {addressKeyList:memberListFiltered,signature} = await this.getEvmQualifyList(groupId,memberSelf)
            //const addressListFiltered = memberListFiltered.map((member)=>member.addr)
            //const qualifyOutput = await this._getEvmQualify(groupId,addressListFiltered,signature)
            const {output,salt} = await this._makeSharedOutputForGroupInternal({groupId,memberList:memberList})
            return {
                outputs:[output],
                salt
            }
        } catch (error) {
            console.log('_makeSharedOutputForEvmGroup error', error);
            throw error
        }
    }

    async _makeSharedOutputForGroup({groupId,memberList,memberSelf}:{groupId:string,memberList?:{addr:string,publicKey:string}[],memberSelf?:{addr:string,publicKey:string}}):Promise<{outputs:IBasicOutput[],salt:string}>{
        // log entering
        console.log(`_makeSharedOutputForGroup groupId:${groupId}, memberList:${memberList}, memberSelf:${memberSelf}`);
        const isEvm = this._mode != ShimmerMode 
        if (isEvm) {
            return this._makeSharedOutputForEvmGroup({groupId,memberList,memberSelf})
        } else {
            const {output,salt} = await this._makeSharedOutputForGroupInternal({groupId,memberList})
            return {outputs:[output],salt}
        }
    }
    async _makeSharedOutputForGroupInternal({groupId,memberList}:{groupId:string,memberList?:{addr:string,publicKey:string}[]}):Promise<{output:IBasicOutput,salt:string}>{
        // log entering
        console.log(`_makeSharedOutputForGroupInternal groupId:${groupId}, memberList:${memberList}`);
        let recipients
        if (memberList) {
            recipients = memberList.map((member)=>({addr:member.addr,mkey:member.publicKey}))
        } else {
            const memberRes = await IotaCatSDKObj.fetchGroupMemberAddresses(groupId) as {ownerAddress:string,publicKey:string, timestamp: number}[]  
            recipients = memberRes.map((nftRes)=>({addr:nftRes.ownerAddress,mkey:nftRes.publicKey}))
        }

        console.log('_makeSharedOutputForGroup recipients', recipients);
        recipients = recipients.filter((recipient)=>!!recipient.mkey)
        const salt = IotaCatSDKObj._generateRandomStr(32)
        const payloadList:EncryptingPayload[] = recipients.map((pair)=>({addr:pair.addr,publicKey:Converter.hexToBytes(pair.mkey), content:salt}))

        const encryptedPayloadList:EncryptedPayload[] = await encryptPayloadList({payloadList,tag})
        const preparedRecipients:IMRecipient[] = encryptedPayloadList.map((payload)=>({addr:payload.addr,mkey:Converter.bytesToHex(payload.payload)}))
        console.log('preparedRecipients', preparedRecipients,preparedRecipients.map(r => ({addr:IotaCatSDKObj.getAddressHashStr(r.addr),mkey:r.mkey})));
        const pl = IotaCatSDKObj.serializeRecipientList(preparedRecipients,groupId)
        const tagFeature: ITagFeature = {
            type: 3,
            tag: `0x${Converter.utf8ToHex(IOTACATSHAREDTAG)}`
        };
        const metadataFeature: IMetadataFeature = {
            type: 2,
            data: Converter.bytesToHex(pl, true)
        };
        // 3. Create outputs, in this simple example only one basic output and a remainder that goes back to genesis address
        const basicOutput: IBasicOutput = {
            type: BASIC_OUTPUT_TYPE,
            amount: '',
            nativeTokens: [],
            unlockConditions: [
                {
                    type: ADDRESS_UNLOCK_CONDITION_TYPE,
                    address: {
                        type: ED25519_ADDRESS_TYPE,
                        pubKeyHash: this._accountHexAddress!
                    }
                },
                {
                    type: TIMELOCK_UNLOCK_CONDITION_TYPE,
                    unixTime: getCurrentEpochInSeconds() + 60 * 60 * 24 * 6
                }
            ],
            features: [
                metadataFeature,
                tagFeature
            ]
        };
       return {output:basicOutput,salt}
    }
    // add timeunlock to basic output
    _addTimeUnlockToBasicOutput(basicOutput:IBasicOutput,timeFromNow:number){
        basicOutput.unlockConditions.push({
            type: TIMELOCK_UNLOCK_CONDITION_TYPE,
            unixTime: getCurrentEpochInSeconds() + timeFromNow
        })
    }
    _addMinimalAmountToBasicOutput(basicOutput:IBasicOutput){
        const deposit = TransactionHelper.getStorageDeposit(basicOutput,this._protocolInfo!.rentStructure)
        basicOutput.amount = deposit.toString()
    }
    _getPair(baseSeed:Ed25519Seed){
        const addressGeneratorAccountState = {
            accountIndex: 0,
            addressIndex: 0,
            isInternal: false
        };
        const path = generateBip44Address(addressGeneratorAccountState,COIN_TYPE_SHIMMER);

        console.log(`Wallet Index ${path}`);

        const addressSeed = baseSeed.generateSeedFromPath(new Bip32Path(path));
        const addressKeyPair = addressSeed.keyPair();
        return addressKeyPair
    }
    _hexSeedToEd25519Seed(hexSeed:string):Ed25519Seed{
        const uint8arr = Converter.hexToBytes(hexSeed);
        return new Ed25519Seed(uint8arr);
    }
    _ensureClientInited(){
        // if (!this._client || !this._indexer || !this._nodeInfo || !this._protocolInfo) throw new Error('Client not initialized')
        if (!this._client || !this._indexer || !this._protocolInfo) throw new Error('Client not initialized')
    }
    _ensureWalletInited(){
        // if (!this._accountHexAddress || !this._accountBech32Address) throw new Error('Wallet not initialized')
    }
    _ensureStorageInited(){
        if (!this._storage) throw new Error('Storage not initialized')
    }
    // getMessagesFromOutputIds
    async getMessagesFromOutputIds({outputIds,address,type}:{outputIds:string[],address:string,type:number}){
        const tasks = outputIds.map(outputId=>this.getMessageFromOutputId({outputId,address,type}))
        const res = await Promise.all(tasks)
        return res
    }
    async getMessageFromOutputId({outputId,output,address,type}:{outputId:string,output?:IBasicOutput,address:string,type:number}){
        this._ensureClientInited()
        try {
            if (!output) {
                const outputsResponse = await this._client!.output(outputId)
                output = outputsResponse.output as IBasicOutput
            }
            const addressUnlockcondition = output.unlockConditions.find(unlockCondition=>unlockCondition.type === 0) as IAddressUnlockCondition
            const senderAddress = addressUnlockcondition.address as IEd25519Address
            const senderAddressBytes = Converter.hexToBytes(senderAddress.pubKeyHash)
            
            const features = output.features
            if (!features) throw new Error('No features')
            const metadataFeature = features.find(feature=>feature.type === 2) as IMetadataFeature
            if (!metadataFeature) throw new Error('No metadata feature')
            const data = Converter.hexToBytes(metadataFeature.data)
            const {sender, message, messageId} = await this.getMessageFromMetafeaturepayloadAndSender({data,senderAddressBytes,address})
            return { type, sender, message, messageId }
        } catch(e) {
            
            console.log(`getMessageFromOutputId:${outputId}`, e);
        }
    }
    // getMessageFromMetafeaturepayloadandsender
    async getMessageFromMetafeaturepayloadAndSender({data,senderAddressBytes,address}:{data:Uint8Array|string,senderAddressBytes:Uint8Array|string,address:string}):Promise<{sender:string,message:IMMessage,messageId:string}>{
        const data_ = typeof data === 'string' ? Converter.hexToBytes(data) : data
        const senderAddressBytes_ = typeof senderAddressBytes === 'string' ? Converter.hexToBytes(senderAddressBytes) : senderAddressBytes
        const messageId = IotaCatSDKObj.getMessageId(data_, senderAddressBytes_)
        // const sender = Bech32Helper.toBech32(ED25519_ADDRESS_TYPE, senderAddressBytes_, this._nodeInfo!.protocol.bech32Hrp);
        const sender = Bech32Helper.toBech32(ED25519_ADDRESS_TYPE, senderAddressBytes_, this._protocolInfo!.bech32Hrp);

        try {
            const message = await IotaCatSDKObj.deserializeMessage(data_, address, {decryptUsingPrivateKey:async (data:Uint8Array)=>{
                //const decrypted = await decrypt(this._walletKeyPair!.privateKey, data, tag)
                //return decrypted.payload
                throw new Error('decryptUsingPrivateKey not supported')
            },sharedOutputSaltResolver:async (sharedOutputId:string)=>{
                const {salt} = await this._getSaltFromSharedOutputId(sharedOutputId,address)
                return salt
            }})
            return {sender,message,messageId}
        } catch (error) {
            if (IotaCatSDKObj.verifyErrorForSharedOutputNotFound(error)) {
                // log error
                console.log('Shared output not found', error);
                const sharedNotFoundError = error as SharedNotFoundError
                const {sharedOutputId} = sharedNotFoundError
                const pl = {data:data_,senderAddressBytes:senderAddressBytes_,address}
                if (!this._sharedNotFoundRecoveringMessage[sharedOutputId]) this._sharedNotFoundRecoveringMessage[sharedOutputId] = {
                    payload:[],
                    lastCheckTime:0,
                    numOfChecks:0
                }
                this._sharedNotFoundRecoveringMessage[sharedOutputId].payload.push(pl)
            }

            console.log('getMessageFromMetafeaturepayloadAndSender error', error);
            throw error
        }
    }
    processMessageOutput(output: IBasicOutput): { senderAddress:string,senderAddressBytes: Uint8Array, data: Uint8Array } {
        // Find the address unlock condition
        const addressUnlockCondition = output.unlockConditions.find(unlockCondition => unlockCondition.type === 0) as IAddressUnlockCondition;
        if (!addressUnlockCondition) {
            throw new Error('No address unlock condition found');
        }
    
        // Extract the sender address and convert it to bytes
        const senderAddress = addressUnlockCondition.address as IEd25519Address;
        const senderAddressBytes = Converter.hexToBytes(senderAddress.pubKeyHash);
        const smrAddress = Bech32Helper.toBech32(ED25519_ADDRESS_TYPE, senderAddressBytes, this._protocolInfo!.bech32Hrp);
    
        // Ensure the output has features
        const features = output.features;
        if (!features) {
            throw new Error('No features');
        }
    
        // Find the metadata feature and convert its data to bytes
        const metadataFeature = features.find(feature => feature.type === 2) as IMetadataFeature;
        if (!metadataFeature) {
            throw new Error('No metadata feature');
        }
        const data = Converter.hexToBytes(metadataFeature.data);
    
        return { senderAddressBytes, senderAddress:smrAddress, data };
    }
    convertIMMessageToIMessage(imMessage: IMMessage, messageId: string, sender: string, name?:string, avatar?: string): IMessage {
        return {
            type: ImInboxEventTypeNewMessage,
            messageId,
            groupId: imMessage.groupId,
            sender,
            message: imMessage.data, // Assuming `data` holds the message content
            timestamp: imMessage.timestamp,
            name,
            avatar
            // Optionally include other fields like `token` or `name` if they exist in `IMMessage`
        };
    }
    
    async batchConvertOutputIdsToMessages(
        outputIds: string[], 
        address: string, 
        onMessageCompleted: (msg: IMessage, outputId: string) => void
    ): Promise<{ failedMessageOutputIds: string[] }> {
        const failedMessageOutputIds: string[] = [];
    
        try {
            // Step 1: Batch convert outputIds to outputs
            const outputIdToOutput = await this.batchOutputIdToOutput(outputIds);
            const foundOutputIds = outputIdToOutput.map(({ outputIdHex }) => outputIdHex);
    
            // Calculate the diff to find the outputIds that were not found
            const initialMissedMessageOutputIds = outputIds.filter(outputId => !foundOutputIds.includes(outputId));
            failedMessageOutputIds.push(...initialMissedMessageOutputIds);
    
            // Log counts, outputIds, foundOutputIds, failedMessageOutputIds in one line
            console.log('batchConvertOutputIdsToMessages Step 1 counts, outputIds count:', outputIds.length, 'foundOutputIds count:', foundOutputIds.length, 'failedMessageOutputIds count:', failedMessageOutputIds.length);
    
            // Step 2: Loop through the outputs and attempt to deserialize each message without extra
            const sharedOutputIdToMsgMap: { [sharedOutputId: string]: Array<{ imMessage: IMMessage, data: Uint8Array, senderAddressBytes: Uint8Array,name?:string, avatar?: string, messageId: string, messageOutputId: string, sender: string }> } = {};
            let totalMessagesNeedingSharedOutput = 0;
            
            
            // Array to hold the intermediate results
            const intermediateResults: IntermediateResult[] = [];
            
            for (const { outputIdHex, output } of outputIdToOutput) {
                try {
                    // Cast the output to IBasicOutput
                    const basicOutput = output as IBasicOutput;
            
                    // Process the message output and store the result
                    const { senderAddressBytes, senderAddress, data } = this.processMessageOutput(basicOutput);
            
                    // Store the intermediate result
                    intermediateResults.push({ outputIdHex, senderAddressBytes, senderAddress, data });
                } catch (error) {
                    console.log(`Error processing message output for outputId: ${outputIdHex}`, error);
                    failedMessageOutputIds.push(outputIdHex);
                }
            }

            // if not shimmer mode, then map sender to evm address
            if (this._mode !== ShimmerMode) {
                const smrAddressList = intermediateResults.map(({ senderAddress }) => senderAddress);
                const smrAddressSet = new Set(smrAddressList) as Set<string>
                const smrAddressUniqueList = Array.from(smrAddressSet)
                const mapping = await addressMappingCache.batchGetEvmAddresses(smrAddressUniqueList)
                for (const intermediateResult of intermediateResults) {
                    const { senderAddress } = intermediateResult;
                    const evmAddress = mapping.get(senderAddress)
                    if (evmAddress) {
                        intermediateResult.senderAddress = evmAddress
                    }
                }
            }

            // map address to name
            const addressList = intermediateResults.map(({ senderAddress }) => senderAddress);
            const addressMap = new Set(addressList)
            const addressUniqueList = Array.from(addressMap)
            const nameRes = await nameMappingCache.batchGetRes(addressUniqueList);
            for (const intermediateResult of intermediateResults) {
                const { senderAddress } = intermediateResult;
                const profile = nameRes.get(senderAddress);
                if (profile?.name) {
                    intermediateResult.name = profile?.name
                }
                if (profile?.avatar) {
                    intermediateResult.avatar = profile.avatar
                }
            }

            for (const { outputIdHex, senderAddressBytes, name, avatar, data, senderAddress: sender } of intermediateResults) {
                try {
                    // Get the messageId
                    const messageId = IotaCatSDKObj.getMessageId(data, senderAddressBytes);
            
                    // Attempt to deserialize the message without extra
                    const { sharedOutputId, msg: imMessage } = await IotaCatSDKObj.deserializeMessageWithoutExtra(data, address);
                    // const sender = ''; // You'll need to determine the sender value based on your context
            
                    if (sharedOutputId) {
                        if (!sharedOutputIdToMsgMap[sharedOutputId]) {
                            sharedOutputIdToMsgMap[sharedOutputId] = [];
                        }
                        sharedOutputIdToMsgMap[sharedOutputId].push({ imMessage, data, senderAddressBytes, name, avatar, messageId, messageOutputId: outputIdHex, sender });
                        totalMessagesNeedingSharedOutput++;
                    } else {
                        const iMessage = this.convertIMMessageToIMessage(imMessage, messageId, sender, name, avatar);
                        onMessageCompleted(iMessage, outputIdHex); // Trigger the callback immediately
                    }
                } catch (error) {
                    console.log(`Error deserializing message for outputId: ${outputIdHex}`, error);
                    failedMessageOutputIds.push(outputIdHex);
                }
            }
            
    
            // Log step 2 counts, completedMessages count, totalMessagesNeedingSharedOutput count
            console.log('batchConvertOutputIdsToMessages Step 2 counts, totalMessagesNeedingSharedOutput count:', totalMessagesNeedingSharedOutput);
    
            // Step 3: Handle messages requiring salts (SharedOutputId handling)
            if (totalMessagesNeedingSharedOutput > 0) {
                // Fetch salts from cache first
                const { results, cacheMissedIds: stillMissingSaltSharedIds } = await this._batchFetchSaltFromCache(Object.keys(sharedOutputIdToMsgMap));
                // Log step 3 counts, salts fetched from cache count, stillMissingSaltSharedIds count
                console.log('batchConvertOutputIdsToMessages Step 3 counts, salts fetched from cache count:', results.length, 'stillMissingSaltSharedIds count:', stillMissingSaltSharedIds.length);
    
                // Complete the messages using the cached salts
                for (const { outputId, salt } of results) {
                    const messageList = sharedOutputIdToMsgMap[outputId];
                    for (const { imMessage, messageId, senderAddressBytes, messageOutputId, name, avatar, sender} of messageList) {
                        try {
                            const completedIMMessage = IotaCatSDKObj.completeMessageWithSalt(imMessage, salt);
                            // const sender = ''; // You'll need to determine the sender value based on your context
                            const iMessage = this.convertIMMessageToIMessage(completedIMMessage, messageId, sender,name, avatar);
                            onMessageCompleted(iMessage, messageOutputId); // Trigger the callback immediately
                        } catch (error) {
                            console.log('Error converting completed message to IMessage:', error);
                            failedMessageOutputIds.push(messageOutputId);
                            continue;
                        }
                    }
                }
    
                // Log step 3 counts, completedMessages count after using cache, stillMissingSaltSharedIds count
                console.log('batchConvertOutputIdsToMessages Step 3 counts, completedMessages count after using cache:', stillMissingSaltSharedIds.length);
    
                // Fetch missing shared outputs and then the salts
                if (stillMissingSaltSharedIds.length > 0) {
                    const sharedOutputResults = await this.batchOutputIdToOutput(stillMissingSaltSharedIds);
                    const sharedOutputIdsFound = sharedOutputResults.map(({ outputIdHex }) => outputIdHex);
    
                    const sharedNotFoundIds = stillMissingSaltSharedIds.filter(id => !sharedOutputIdsFound.includes(id));
    
                    for (const { outputIdHex, output } of sharedOutputResults) {
                        const basicOutput = output as IBasicOutput;
                        let salt = '';
                        try {
                            const getSaltFromSharedOutputRes = await this._getSaltFromSharedOutput({ sharedOutputId: outputIdHex, sharedOutput: basicOutput, address, isHA: false });
                            salt = getSaltFromSharedOutputRes.salt;
                        } catch (error) {
                            console.log('Error fetching salt for shared output:', outputIdHex, error);
                            const messageList = sharedOutputIdToMsgMap[outputIdHex];
                            messageList.forEach(({ messageOutputId }) => {
                                failedMessageOutputIds.push(messageOutputId);
                            });
                            continue;
                        }
                        const messageList = sharedOutputIdToMsgMap[outputIdHex];
                        for (const { imMessage, messageId, senderAddressBytes, messageOutputId, name, avatar, sender } of messageList) {
                            try {
                                const completedIMMessage = IotaCatSDKObj.completeMessageWithSalt(imMessage, salt);
                                // const sender = ''; // You'll need to determine the sender value based on your context
                                const iMessage = this.convertIMMessageToIMessage(completedIMMessage, messageId, sender, name, avatar);
                                onMessageCompleted(iMessage, messageOutputId); // Trigger the callback immediately
                            } catch (error) {
                                console.log('Error converting completed message to IMessage:', error);
                                failedMessageOutputIds.push(messageOutputId);
                                continue;
                            }
                        }
                    }
    
                    // Log step 3 counts, completedMessages count after fetching missing shared outputs, sharedNotFoundIds count
                    console.log('batchConvertOutputIdsToMessages Step 3 counts, completedMessages count after fetching missing shared outputs:', sharedNotFoundIds.length);
    
                    for (const sharedOutputId of sharedNotFoundIds) {
                        console.log(`Shared output not found for sharedOutputId: ${sharedOutputId}`);
                        const messageList = sharedOutputIdToMsgMap[sharedOutputId];
                        messageList.forEach(({ messageOutputId }) => {
                            failedMessageOutputIds.push(messageOutputId);
                        });
                    }
                }
            }
        } catch (error) {
            console.log('Error in batchConvertOutputIdsToMessages:', error);
            throw error;
        }
    
        return { failedMessageOutputIds };
    }
    
    
    
    
    
    
    
    
    async _getUnSpentOutputs({numbersWanted, amountLargerThan, idsForFiltering}:{numbersWanted:number,amountLargerThan?:bigInt.BigNumber, idsForFiltering?:Set<string>} = {numbersWanted : 100}) {
        this._ensureClientInited()
        this._ensureWalletInited()
        const res:BasicOutputWrapper[] = []
        let cursor:string|undefined
        while (true) {
            const {outputs,nextCursor} = await this._getOneBatchUnSpentOutputs({pageSize:100, amountLargerThan ,cursor,idsForFiltering})
            cursor = nextCursor
            res.push(...outputs)
            if (res.length >= numbersWanted) break
            if (!nextCursor) break
        }
        return res.slice(0,numbersWanted)
    }

    // given outputids to be consolidated, try find 100 unspent outputs, filter out the ones in outputIds, then find larget within the 100
    async _getLargestUnSpentOutputAsideThoseForConsolidation(outputIds:string[]){
        this._ensureClientInited()
        this._ensureWalletInited()
        const idsForFiltering = new Set(outputIds)
        const outputs = await this._getUnSpentOutputs({numbersWanted:100,idsForFiltering})
        if (outputs.length === 0) return undefined
        const largestOutput = this._findLargestOutput(outputs)
        return largestOutput
    }

    // get outputids from message consolidation api
    async _getOutputIdsFromMessageConsolidationApi(address:string){
        const params = {address:`${address}`}
        const paramStr = formatUrlParams(params)
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/consolidation/message${paramStr}`
        // @ts-ignore
        const res = await fetch(url,{
            method:'GET',
            headers:{
            'Content-Type':'application/json',
            }})
        const data = await res.json() as string[]
        return data ?? []
    }
    // check then consolidate messages
    async checkThenConsolidateMessages(){
        this._ensureClientInited()
        this._ensureWalletInited()
        const outputIds = await this._getOutputIdsFromMessageConsolidationApi(this._accountBech32Address!)
        console.log('outputIds', outputIds);
        if (outputIds.length === 0) return
        const res = await this._consolidateOutputIdsFromApiResult(outputIds)
        return {
            message:'ok',
            outputIds,
            ...res
        }
    }

    // get outputids from message consolidation shared api
    async _getOutputIdsFromMessageConsolidationSharedApi(address: string): Promise<string[]> {
        const params = { address: `${address}` };
        const paramStr = formatUrlParams(params);
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/consolidation/shared${paramStr}`;
        // @ts-ignore
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        const data = await res.json() as string[];
        return data ?? [];
    }

    // batchoutputidtooutput api, it is an inx api
    async batchOutputIdToOutput(outputIds:string[]){
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/batchoutputidtooutput`
        const res = await fetch(url,{
            method:'POST',
            headers:{
            'Content-Type':'application/json',
            },
            body:JSON.stringify(outputIds)
        })
        const data = await res.json() as {outputIdHex:string,output:OutputTypes}[]
        return data
    }
    // check then consolidate shared
    async checkThenConsolidateShared(){
        this._ensureClientInited()
        this._ensureWalletInited()
        const outputIds = await this._getOutputIdsFromMessageConsolidationSharedApi(this._accountBech32Address!)
        console.log('outputIds', outputIds);
        if (outputIds.length === 0) return
        const res = await this._consolidateOutputIdsFromApiResult(outputIds)
        return {
            message:'ok',
            outputIds,
            ...res
        }
    }
    // consolidate outputids from api result
    async _consolidateOutputIdsFromApiResult(outputIds:string[]){
        const consumedOutputsResponse = await this._outputIdsToOutputResponseWrappers(outputIds)
        const consumedOutputs = consumedOutputsResponse.map(outputResponseWrapper=>this._outputResponseWrapperToBasicOutputWrapper(outputResponseWrapper))
        const largest = await this._getLargestUnSpentOutputAsideThoseForConsolidation(outputIds)
        if (largest) {
            consumedOutputs.push(largest)
        }
        const res = await this._consolidateOutputs(consumedOutputs)
        return res
    }

    async _getOneBatchUnSpentOutputs({cursor,pageSize = 100, amountLargerThan, idsForFiltering}:{cursor?:string, amountLargerThan?:bigInt.BigNumber, pageSize?:number,idsForFiltering?:Set<string>} = {}) {
        this._ensureClientInited()
        this._ensureWalletInited()
        const [outputsResponse,outputsWithTimelockResponse] = await Promise.all([
            this._indexer!.basicOutputs({
            addressBech32: this._accountBech32Address,
            hasStorageDepositReturn: false,
            hasExpiration: false,
            hasTimelock: false,
            hasNativeTokens: false,
            pageSize,
            cursor
        }),
        //TODO
        this._indexer!.basicOutputs({
            addressBech32: this._accountBech32Address,
            hasStorageDepositReturn: false,
            hasExpiration: false,
            hasTimelock: true,
            timelockedBefore: Math.floor(Date.now() / 1000),
            hasNativeTokens: false,
            pageSize,
            cursor
        })]);
        const nextCursor = outputsResponse.cursor
        console.log('OutputsResponse', outputsResponse);
        let outputIds = [...outputsResponse.items,...outputsWithTimelockResponse.items]
        if (idsForFiltering) {
            outputIds = outputIds.filter(outputId=>!idsForFiltering.has(outputId))
        }
        let outputsRaw = await this._getUnSpentOutputsFromOutputIds(outputIds)
        console.log('Unspent Outputs', outputsRaw);
        let outputs = outputsRaw.map(output=>this._outputResponseWrapperToBasicOutputWrapper(output))
        if (amountLargerThan) {
            outputs = outputs.filter(output=>bigInt(output.output.amount).greater(amountLargerThan))
        }
        // filter out output that have tag feature or metadata feature or native tokens
        outputs = outputs.filter(this._filterOutputsCannotBeConsolidated)
        return {outputs,nextCursor}
    }

    _checkIfSelfOwnedOutput<T extends INftOutput>(outputResponse: IOutputResponse, {addressBech32, expirationReturnAddressBech32}: {addressBech32?: string, expirationReturnAddressBech32?: string}): {owned: boolean, locked?: boolean} {
        const unlockConditions = (outputResponse.output as T).unlockConditions ?? []
        const nowUnixTime = Math.round(Date.now() / 1000)

        let storageDepositReturnUnlockCondition: IStorageDepositReturnUnlockCondition | undefined
        let timelockUnlockCondition: ITimelockUnlockCondition | undefined
        let expirationUnlockCondition: IExpirationUnlockCondition | undefined

        for(const unlockCondition of unlockConditions) {
            if(unlockCondition.type === 1) {
                storageDepositReturnUnlockCondition = unlockCondition
            }else if(unlockCondition.type === 2) {
                timelockUnlockCondition = unlockCondition
            }else if(unlockCondition.type === 3) {
                expirationUnlockCondition = unlockCondition
            }
        }

        let owned: boolean = true
        let locked: boolean = false

        if(addressBech32 !== undefined) {
            if(expirationUnlockCondition !== undefined && nowUnixTime > expirationUnlockCondition.unixTime ) {
                owned = false
            } 
        }else if(expirationReturnAddressBech32 !== undefined) {
            if(expirationUnlockCondition !== undefined && nowUnixTime <= expirationUnlockCondition.unixTime) {
                owned = false
            }
        }

        if(owned) {
            if(timelockUnlockCondition !== undefined && timelockUnlockCondition.unixTime >= nowUnixTime) {
                locked = true
            }else if(expirationUnlockCondition !== undefined) {
                locked = true
            }else if(storageDepositReturnUnlockCondition !== undefined) {
                locked = true
            }
        }

        return owned ? {owned, locked} : {owned: false}
    }

    async hasUnclaimedNameNFT(address: string): Promise<boolean> {
        try {
            const {items}: IOutputsResponse = await this._indexer!.nfts({
                addressBech32: address,
                hasStorageDepositReturn: true,
                hasExpiration: true,
                expiresAfter: Math.floor(Date.now() / 1000),
                tagHex: `0x${Converter.utf8ToHex('groupfi-id')}`
            })
            for (const outputId of items) {
                const { output } = await this._client!.output(outputId) as {metadata: IOutputMetadataResponse,  output: INftOutput}
                if(!output.immutableFeatures) {
                    continue
                }
                const metadataFeature = output.immutableFeatures.find(({type}) => type === 2) as IMetadataFeature | undefined
                if(!metadataFeature || !metadataFeature.data) {
                    continue
                }
                const metadataFeatureObj = JSON.parse(Converter.hexToUtf8(metadataFeature.data))
                if(metadataFeatureObj && metadataFeatureObj.property === 'groupfi-name') {
                    console.log('UnclaimedNameNFT:', outputId, output)
                    return true
                }
            }
            
            return false
            
        }catch(error) {
            return false
        }
    }

    _filterOutputsCannotBeConsolidated(outputs:BasicOutputWrapper){
        // filter out output that have tag feature or metadata feature or native tokens
        const features = outputs.output.features
        if (!features) return true
        const tagFeature = features.find(feature=>feature.type === 3)
        if (tagFeature) {
            const tag = (tagFeature as ITagFeature).tag
            const tagStr = Converter.hexToUtf8(tag)
            // filter out groupfi tag by GROUPFIReservedTags
            if (GROUPFIReservedTags.includes(tagStr)) return false
        }
        if (outputs.output.nativeTokens && outputs.output.nativeTokens.length > 0) return false
        return true
    }

    //get outputs from outputIds filter out spent
    async _getUnSpentOutputsFromOutputIds(outputIds:string[]){
        this._ensureClientInited()
        const outputs = await this._outputIdsToOutputResponseWrappers(outputIds)
        return outputs.filter(output=>
            output.output.metadata.isSpent === false && 
            output.output.output.type === BASIC_OUTPUT_TYPE
        )
    }
    async _outputIdsToOutputResponseWrappers(outputIds:string[]):Promise<OutputResponseWrapper[]>{
        this._ensureClientInited()
        const tasks = outputIds.map(outputId=>this._client!.output(outputId))
        let outputsRaw = await Promise.all(tasks)
        let outputs = outputsRaw.map((output,idx)=>{return {outputId:outputIds[idx],output}})
        return outputs
    }
    _outputResponseWrapperToBasicOutputWrapper(outputResponseWrapper:OutputResponseWrapper):BasicOutputWrapper{
        const output = outputResponseWrapper.output.output as IBasicOutput
        return {outputId:outputResponseWrapper.outputId,output}
    }
    _getAmount(output:IBasicOutput | INftOutput){
        console.log('_getAmount', output, this._protocolInfo!.rentStructure)
        const deposit = TransactionHelper.getStorageDeposit(output, this._protocolInfo!.rentStructure)
        return bigInt(deposit)
    }

    // set shared id and salt to cache
    _setSharedIdAndSaltToCache(rawSharedId:string,salt:string){
        const sharedId = IotaCatSDKObj._addHexPrefixIfAbsent(rawSharedId)
        this._sharedSaltCache[sharedId!] = salt
    }
    // get shared id and salt from cache
    _getSharedIdAndSaltFromCache(rawSharedId:string){
        const sharedId = IotaCatSDKObj._addHexPrefixIfAbsent(rawSharedId)
        const cachedValue = this._sharedSaltCache[sharedId!]
        // log cache hit or miss
        if (cachedValue) {
            console.log('salt cache hit', sharedId);
        } else if (this._sharedSaltFailedCache.has(sharedId!)) {
            // log salt failed cache hit
            console.log('salt failed cache hit', sharedId);
            // TODO error type?
            throw new Error('Shared output not found')
        } else  {
            console.log('salt cache miss', sharedId);
        }
        return cachedValue
    }
    async _batchFetchSaltFromCache(sharedOutputIds: string[]): Promise<{ results: { outputId: string, salt: string }[], cacheMissedIds: string[] }> {
        const results: { outputId: string, salt: string }[] = [];
        const cacheMissedIds: string[] = [];
    
        for (const rawSharedId of sharedOutputIds) {
            const sharedId = IotaCatSDKObj._addHexPrefixIfAbsent(rawSharedId);
            const cachedValue = this._sharedSaltCache[sharedId!];
    
            if (cachedValue) {
                console.log('salt cache hit', sharedId);
                results.push({ outputId: sharedId, salt: cachedValue });
            } else if (this._sharedSaltFailedCache.has(sharedId!)) {
                console.log('salt failed cache hit', sharedId);
                // If a failed cache hit is considered a miss, you can add it to cacheMissedIds as well
                cacheMissedIds.push(sharedId);
            } else {
                console.log('salt cache miss', sharedId);
                cacheMissedIds.push(sharedId);
            }
        }
    
        // Return the results and the list of cache-missed IDs
        return { results, cacheMissedIds };
    }
    
    _preloadGroupSaltCacheWaits:Record<string,{resolve:(value:undefined)=>void,reject:(error:Error)=>void}[]> = {}
    async preloadGroupSaltCache({
        senderAddr,
        groupId,
        memberList
    }:{senderAddr:string, groupId:string,memberList?:{addr:string,publicKey:string}[]}){
        // if in waiting cache, create a promise, add to waiting cache, return promise
        const waiting = this._preloadGroupSaltCacheWaits[groupId]
        if (waiting) {
            const wait = new Promise<undefined>((resolve,reject)=>{
                waiting.push({resolve,reject})
            })
            return wait
        } else {
            this._preloadGroupSaltCacheWaits[groupId] = []
        }
        let err:Error|undefined
        try {
            const {salt, outputId,outputs,isHA} = await this._getSaltForGroup(groupId,senderAddr,memberList)
            if (isHA) {
                // log ha and groupid and memberList
                console.log('isHA and groupId and memberList', isHA, groupId, memberList);
                const {outputId:outputIdFromHA} = await this._sendBasicOutput(outputs!);
                // set shared id and salt to cache
                this._setSharedIdAndSaltToCache(outputIdFromHA,salt)
            }
        } catch (error) {
            console.log('preloadGroupSaltCache error', error);
            err = error as Error
        } finally {
            const waiting = this._preloadGroupSaltCacheWaits[groupId]
            if (waiting) {
                delete this._preloadGroupSaltCacheWaits[groupId]
                for (const item of waiting) {
                    if (err) {
                        item.reject(err)
                    } else {
                        item.resolve(undefined)
                    }
                }
            }
        }
    }
    async sendMessage(senderAddr:string, groupId:string,isGroupPublic:boolean,message: IMMessage, memberList?:{addr:string,publicKey:string}[])
    :Promise<
    {
        sentMessagePromise:Promise<IMessage>,
        sendBasicOutputPromise:Promise<{blockId:string,outputId:string}>
    }|undefined>
    {
        this._ensureClientInited()
        this._ensureWalletInited()
        tracer.startStep('sendMessageToGroup','client start send message')
        const {data:rawText} = message
        try {
            const protocolInfo = this._protocolInfo
            console.log('ProtocolInfo', protocolInfo);
            const groupSaltMap:Record<string,string> = {}
            const groupSaltResolver = async (groupId:string)=>groupSaltMap[groupId]
            if (isGroupPublic) {
                message.messageType = MessageTypePublic
            } else {
                message.messageType = MessageTypePrivate
                try {
                    
                    if (message.authScheme == MessageAuthSchemeRecipeintInMessage) {
                        const memberRes = await IotaCatSDKObj.fetchGroupMemberAddresses(groupId) as {ownerAddress:string,publicKey:string, timestamp: number}[]  
                        const recipients = memberRes.map((nftRes)=>({addr:nftRes.ownerAddress,mkey:nftRes.publicKey}))
            
                        message.recipients = recipients
                    } else {
                        // get shared output
                        
                        const {salt, outputId,outputs,isHA} = await this._getSaltForGroup(groupId,senderAddr,memberList)
                        if (isHA) {
                            const {outputId:outputIdFromHA} = await this._sendBasicOutput(outputs!);
                            // set shared id and salt to cache
                            this._setSharedIdAndSaltToCache(outputIdFromHA,salt)
                            message.recipientOutputid = outputIdFromHA
                        } else {
                            message.recipientOutputid = outputId
                        }
                        groupSaltMap[groupId] = salt
                        
                    }
                } catch (error) {
                    if (IotaCatSDKObj.verifyErrorForGroupMemberTooMany(error)) {
                        message.messageType = MessageTypePublic
                    } else {
                        throw error
                    }
                }
            }
            console.log('MessageWithPublicKeys', message);
            tracer.startStep('sendMessageToGroup','client start serialize message')
            const pl = await IotaCatSDKObj.serializeMessage(message,{encryptUsingPublicKey:async (key,data)=>{
                const publicKey = Converter.hexToBytes(key)
                const encrypted = await encrypt(publicKey, data, tag)
                return encrypted.payload
            },groupSaltResolver})
            console.log('MessagePayload', pl);
            tracer.startStep('sendMessageToGroup','client create message output')
            const tagFeature: ITagFeature = {
                type: 3,
                tag: `0x${Converter.utf8ToHex(IOTACATTAG)}`
            };
            const metadataFeature: IMetadataFeature = {
                type: 2,
                data: Converter.bytesToHex(pl, true)
            };
            const messageId = IotaCatSDKObj.getMessageId(pl, Converter.hexToBytes(this._accountHexAddress!))
            const nameRes = await nameMappingCache.getRes(senderAddr)
            // IMessage = {messageId:string, groupId:string, sender:string, message:string, timestamp:number}
            const messageSent: IMessage = {
                type: ImInboxEventTypeNewMessage,
                messageId,
                groupId,
                sender: senderAddr,
                message: rawText,
                timestamp: message.timestamp,
                name: nameRes?.name 
            };
            // 3. Create outputs, in this simple example only one basic output and a remainder that goes back to genesis address
            const expireInDays = message.isAnnouncement ? 30 : 5;
            const basicOutput: IBasicOutput = {
                type: BASIC_OUTPUT_TYPE,
                amount: '',
                nativeTokens: [],
                unlockConditions: [
                    {
                        type: ADDRESS_UNLOCK_CONDITION_TYPE,
                        address: {
                            type: ED25519_ADDRESS_TYPE,
                            pubKeyHash: this._accountHexAddress!
                        }
                    },
                    {
                        type: TIMELOCK_UNLOCK_CONDITION_TYPE,
                        unixTime: message.timestamp + 60 * 60 * 24 * expireInDays
                    }
                ],
                features: [
                    metadataFeature,
                    tagFeature
                ]
            };
            console.log("Basic Output: ", basicOutput);
            tracer.endStep('sendMessageToGroup','client create message output')
            // promise for ui, resolve messageSent after 0.2s, reject on _sendBasicOutput error,
            let rejectForSentMessage:((error:Error)=>void)|undefined
            const sentMessagePromise = new Promise<IMessage>((resolve,reject)=>{
                setTimeout(()=>{
                    resolve(messageSent)
                },200)
                rejectForSentMessage = reject
            })
            // promise for _sendBasicOutput, resolve on success, reject on error
            let sendBasicOutputPromise = this._sendBasicOutput([basicOutput])
            sendBasicOutputPromise = sendBasicOutputPromise.catch((error)=>{
                if (rejectForSentMessage) rejectForSentMessage(error)
                throw error
            })
            // return both promises
            return {sentMessagePromise,sendBasicOutputPromise}
        } catch (e) {
            console.log("Error submitting block: ", e);
        }
        
    }
    async _getPresignedImageUploadUrl({publicKey,signature,message,ext}:{publicKey:string,signature:string,message:string,ext:string}):Promise<{uploadURL:string,imageURL:string}>{
        const url = IMAGE_PRESIGN_SERVICE_URL!
        const body = {publicKey,signature,message,ext}
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        })
        const json = await res.json() as {uploadURL:string}
        const {uploadURL} = json
        const imageURL = uploadURL.split('?')[0]
        return {uploadURL,imageURL}
    }
    async uploadImageToS3({fileGetter,pairX, fileObj}:{fileGetter?:()=>Promise<File>,pairX:PairX, fileObj?:File}):Promise<{imageURL:string, 
        dimensionsPromise:Promise<{width:number,height:number}>,
        uploadPromise:Promise<void>}>{
        const message = this._accountBech32Address!
        let file:File|undefined = fileObj
        const signAndPerhapsGetFileTasks:Promise<any>[] = []
        signAndPerhapsGetFileTasks.push(this._requestAdapter!.ed25519SignAndGetPublicKey({message,pairX}))  
        if (!file && fileGetter) {
            signAndPerhapsGetFileTasks.push(fileGetter())
        }
        const signAndPerhapsGetFileTasksRes = await Promise.all(signAndPerhapsGetFileTasks)
        const sigRes = signAndPerhapsGetFileTasksRes[0] as {signature:string,publicKey:string}
        if (!file && fileGetter) {
            file = signAndPerhapsGetFileTasksRes[1] as File
        }
        if (!file) throw new Error('No file')
        // get ext from file
        const ext = file.name.split('.').pop()
        if (!ext) throw new Error('No ext')
        const dimensionsPromise = new Promise<
    {width:number,height:number}
    >((resolve)=>{
            getImageDimensions(file!).then((dimensions)=>{
                resolve(dimensions)
            })
        })
        const {signature,publicKey} = sigRes 
        const {uploadURL,imageURL} = await this._getPresignedImageUploadUrl({publicKey,signature,message,ext})
        let uploadPromise = this._uploadFileToS3({file,uploadURL})
        uploadPromise = uploadPromise.catch((error)=>{
            console.log('uploadImageToS3 error', error);
            throw error
        })
        return {imageURL, dimensionsPromise, uploadPromise}
    }
    // given File object and a presigned url, upload file to s3
    async _uploadFileToS3({file,uploadURL}:{file:File,uploadURL:string}){
        // content type should be steamed
        const res = await fetch(uploadURL, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Cache-Control': 'max-age=31536000'
            },
            body: file
        })
    }
    async _findLargestUnspentOutput(outputIds:string[]){
        let largestAmount = bigInt('0')
        let largestOutput = undefined
        const outputs = await this._getUnSpentOutputsFromOutputIds(outputIds)
        for (const output of outputs) {
            const amount = bigInt(output.output.output.amount)
            if (amount.greater(largestAmount)) {
                largestAmount = amount
                largestOutput = output
            }
        }
        return largestOutput
    }

    // given outputs, find largest one
    _findLargestOutput(outputs:BasicOutputWrapper[]):BasicOutputWrapper|undefined{
        let largestAmount = bigInt('0')
        let largestOutput = undefined
        for (const output of outputs) {
            const amount = bigInt(output.output.amount)
            if (amount.greater(largestAmount)) {
                largestAmount = amount
                largestOutput = output
            }
        }
        return largestOutput
    }
    // _consolidateOutputs
    async _consolidateOutputs(consumedOutputs:BasicOutputWrapper[]){
        this._ensureClientInited()
        this._ensureWalletInited()
        // last output is the largest one, slice it out, then slice rest to consolidateBatchSize, then add back the largest one
        const largestOutput = consumedOutputs[consumedOutputs.length-1]
        consumedOutputs = consumedOutputs.slice(0,consumedOutputs.length-1)
        consumedOutputs = consumedOutputs.slice(0,consolidateBatchSize)
        consumedOutputs.push(largestOutput)
        let totalAmount = bigInt('0')
        for (const basicOutputWrapper of consumedOutputs) {
            const {outputId,output} = basicOutputWrapper
            const amount = bigInt(output.amount)
            totalAmount = totalAmount.add(amount)
        }
        const consolidatedBasicOutput: IBasicOutput = {
            type: BASIC_OUTPUT_TYPE,
            amount: totalAmount.toString(),
            nativeTokens: [],
            unlockConditions: [
                {
                    type: ADDRESS_UNLOCK_CONDITION_TYPE,
                    address: {
                        type: ED25519_ADDRESS_TYPE,
                        pubKeyHash: this._accountHexAddress!
                    }
                }
            ],
            features: []
        };
        return await this._sendTransactionWithConsumedOutputsAndCreatedOutputs(consumedOutputs, [consolidatedBasicOutput])
    }
    async _sendBasicOutput(basicOutputs:(IBasicOutput | INftOutput)[],extraOutputsToBeConsumed:BasicOutputWrapper[] = []){
        const createdOutputs:(IBasicOutput | INftOutput)[] = []
        let amountToSend = bigInt('0')
        for (const basicOutput of basicOutputs) {
            const amountToSend_ = this._getAmount(basicOutput)
            basicOutput.amount = amountToSend_.toString()
            createdOutputs.push(basicOutput)
            amountToSend = amountToSend.add(amountToSend_)
        }
        
        // get first output with amount > amountToSend
        let depositFromExtraOutputs = bigInt('0')

        for (const extraOutput of extraOutputsToBeConsumed) {
            const amount = bigInt(extraOutput.output.amount)
            depositFromExtraOutputs = depositFromExtraOutputs.add(amount)
        }
        const cashNeeded = amountToSend.subtract(depositFromExtraOutputs)
        console.log('cashNeeded', cashNeeded);
        let remainderBasicOutput:IBasicOutput|undefined
        if (cashNeeded.lesser(bigInt('0'))) {
            // add diff to first created output, diff is -1 * cashNeeded
            createdOutputs[0].amount = bigInt(createdOutputs[0].amount).subtract(cashNeeded).toString()
        } else {
            const threshold = cashNeeded.multiply(2)
            let consumedOutputWrapper:BasicOutputWrapper|undefined
            // first try get cash from remainder hint
            const remainderBasicOutputWrapperFromHint = this._tryGetCashFromRemainderHint()
            if (remainderBasicOutputWrapperFromHint) {
                const amount = bigInt(remainderBasicOutputWrapperFromHint.output.amount)
                if (amount.greaterOrEquals(threshold)) {
                    consumedOutputWrapper = remainderBasicOutputWrapperFromHint
                    // log get cash from remainder hint
                    console.log('get cash from remainder hint', remainderBasicOutputWrapperFromHint);
                }
            } 
        
            if (!consumedOutputWrapper ) {
                // log get cash from unspent outputs on the fly
                console.log('get cash from unspent outputs on the fly');
                const idsForFiltering = new Set(extraOutputsToBeConsumed.map(output=>output.outputId))
                const outputs = await this._getUnSpentOutputs({amountLargerThan:threshold,numbersWanted:1,idsForFiltering})
                console.log('unspent Outputs', outputs);
                if (!outputs || outputs.length === 0) throw IotaCatSDKObj.makeErrorForUserDoesNotHasEnoughToken()
                
                consumedOutputWrapper = outputs.find(output=>bigInt(output.output.amount).greater(threshold))
            }
            if (!consumedOutputWrapper ) throw new Error('No output with enough amount')
            extraOutputsToBeConsumed.push(consumedOutputWrapper)
            const {output:consumedOutput, outputId:consumedOutputId}  = consumedOutputWrapper
            console.log('ConsumedOutput', consumedOutput);
            remainderBasicOutput = {
                type: BASIC_OUTPUT_TYPE,
                amount: bigInt(consumedOutput.amount).minus(cashNeeded).toString(),
                nativeTokens: [],
                unlockConditions: [
                    {
                        type: ADDRESS_UNLOCK_CONDITION_TYPE,
                        address: {
                            type: ED25519_ADDRESS_TYPE,
                            pubKeyHash: this._accountHexAddress!
                        }
                    }
                ],
                features: []
            };
            createdOutputs.push(remainderBasicOutput)
            console.log("Remainder Basic Output: ", remainderBasicOutput);
        }
        const res = await this._sendTransactionWithConsumedOutputsAndCreatedOutputs(extraOutputsToBeConsumed, createdOutputs)
        console.log('===> send transaction res', res)
        const {blockId,outputId,transactionId,remainderOutputId} = res
        this._setRemainderHint(remainderBasicOutput,remainderOutputId)
        return res
    }
    _remainderHintSet:{output:IBasicOutput,outputId:string,timestamp:number}[] = []
    _isRemainderHintSetDirty = false
    _setRemainderHint(output?:IBasicOutput,outputId?:string){
        // log set remainder hint, outputId and output
        // console.log('set remainder hint', outputId, output);
        if (!output || !outputId) {
            return
        }
        // log actual set remainder hint
        // console.log('actual set remainder hint');

        this._remainderHintSet.push({output,outputId,timestamp:Date.now()})
    }
    resetAllRemainderHints(remainderHints:BasicOutputWrapper[]){
        // remove old hints
        this._remainderHintSet = []
        // log reset all remainder hints
        console.log('reset all remainder hints');
        for (const {output,outputId} of remainderHints) {
            this._setRemainderHint(output,outputId)
        }
        // log reset all remainder hints done
        console.log('reset all remainder hints done');
        this._lastSendTimestamp = Date.now()
    }
    _tryGetCashFromRemainderHint():BasicOutputWrapper|undefined{
        // log enter try get cash from remainder hint
        console.log('try get cash from remainder hint');
        if (this._remainderHintSet.length === 0) return undefined
        // find then remove the one with oldest timestamp
        let oldest = this._remainderHintSet[0]
        let oldestIdx = 0
        for (let i = 1; i < this._remainderHintSet.length; i++) {
            const hint = this._remainderHintSet[i]
            if (hint.timestamp < oldest.timestamp) {
                oldest = hint
                oldestIdx = i
            }
        }
        this._remainderHintSet.splice(oldestIdx,1)
        // log oldest remainder hint
        console.log('oldest remainder hint', oldest);
        // return undefined if the oldest is too old
        if (Date.now() - oldest.timestamp > this._remainderHintOutdatedTimeperiod) {
            // log oldest remainder hint too old
            console.log('oldest remainder hint too old', Date.now() - oldest.timestamp)
            return undefined
        }
        const {output,outputId} = oldest
        return {output,outputId}
    }
    // sendTransactionWithConsumedOutputsAndCreatedOutputs
    async _sendTransactionWithConsumedOutputsAndCreatedOutputs(consumedOutputs:OutputWrapper[],createdOutputs:OutputTypes[]){
        this._ensureClientInited()
        this._ensureWalletInited()
        const inputArray:IUTXOInput[] = []
        const consumedOutputArray:OutputTypes[] = []
        for (const basicOutputWrapper of consumedOutputs) {
            const {outputId,output} = basicOutputWrapper
            const input: IUTXOInput = TransactionHelper.inputFromOutputId(outputId); 
            inputArray.push(input)
            consumedOutputArray.push(output)
        }

        // 4. Get inputs commitment
        const inputsCommitment = TransactionHelper.getInputsCommitment(consumedOutputArray);
        console.log("Inputs Commitment: ", inputsCommitment);

        // 14364762045254553490 is the networkId of the mainnet
        // 1856588631910923207 is the networkId of the testnet
        const transactionEssence: ITransactionEssence = {
            type: TRANSACTION_ESSENCE_TYPE,
            networkId: this._networkId!,
            inputs: inputArray, 
            inputsCommitment,
            outputs: createdOutputs,
            payload: undefined
        };

        // reduce consumed outputs to inputsOutputMap
        const inputsOutputMap:{[key:string]:OutputTypes} = {}
        for (const basicOutputWrapper of consumedOutputs) {
            const {outputId,output} = basicOutputWrapper
            inputsOutputMap[outputId] = output
        }
        const res = await this._signAndSendTransactionEssence({transactionEssence})
        return res
    }
    // sendAnyOneOutputToSelf
    async sendAnyOneOutputToSelf(){
        this._ensureClientInited()
        this._ensureWalletInited()
        const tagFeature: ITagFeature = {
            type: 3,
            tag: `0x${Converter.utf8ToHex(GROUPFISELFPUBLICKEYTAG)}`
        };

        // 3. Create outputs, in this simple example only one basic output and a remainder that goes back to genesis address
        const basicOutput: IBasicOutput = {
            type: BASIC_OUTPUT_TYPE,
            amount: '',
            nativeTokens: [],
            unlockConditions: [
                {
                    type: ADDRESS_UNLOCK_CONDITION_TYPE,
                    address: {
                        type: ED25519_ADDRESS_TYPE,
                        pubKeyHash: this._accountHexAddress!
                    }
                }
            ],
            features: [
                tagFeature
            ]
        };
        return await this._sendBasicOutput([basicOutput])
    }
    /*helperContext:{SingleNodeClient:SingleNodeClient,IndexerPluginClient:IndexerPluginClient, bech32Address:string }*/
    // _getHelperContext
    _getHelperContext(){
        this._ensureClientInited()
        this._ensureWalletInited()
        const helperContext = {SingleNodeClient:this._client!,IndexerPluginClient:this._indexer!, bech32Address:this._accountBech32Address! }
        return helperContext
    }
    
// _trySendAnyOneBasicOutputToSelf
    async _trySendAnyOneBasicOutputToSelf(){
        /*
        const helperContext = this._getHelperContext()
        const drainContextForBasicOutputs = await getAllBasicOutputs(helperContext)
        let cd = drainContextForBasicOutputs.inChannel.numPushed;
        let isSent = false
        let outputWrapper:OutputWrapper|undefined
        for(;;) {
            cd--;
            if (cd < 0) {
                break;
            }
            const basicOutput = await drainContextForBasicOutputs.outChannel.poll();
            if (basicOutput) {
                outputWrapper = basicOutput
                break;
            }
        }
        drainContextForBasicOutputs.isStop = true;
        if (outputWrapper) {
            const res = await this._sentOneOutputToSelf(outputWrapper)
            isSent = true
        }
        return isSent
        */

    }
    // _sentOneOutputToSelf
    async _sentOneOutputToSelf(outputWrapper:OutputWrapper){
        this._ensureClientInited()
        this._ensureWalletInited()
        const output = outputWrapper.output as IBasicOutput | INftOutput
        let features = output.features??[]
        // filter tag feature out
        features = features.filter(feature=>feature.type!=3)
        // add tag feature, with tag GROUPFISELFPUBLICKEYTAG
        const tagFeature: ITagFeature = {
            type: 3,
            tag: `0x${Converter.utf8ToHex(GROUPFISELFPUBLICKEYTAG)}`
        };
        features.push(tagFeature)
        output.features = features
        const res = await this._sendTransactionWithConsumedOutputsAndCreatedOutputs([outputWrapper],[outputWrapper.output])
        console.log('res', res);
        return res
    }
    async fetchMessageListFrom(groupId:string, address:string, coninuationToken?:string, limit:number=10) {
        try {
            const prefixedGroupId = IotaCatSDKObj._addHexPrefixIfAbsent(groupId)
            const params = {groupId:prefixedGroupId,size:limit, token:coninuationToken}
            const paramStr = formatUrlParams(params)
            const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/messages${paramStr}`
            // @ts-ignore
            const res = await fetch(url,{
                method:'GET',
                headers:{
                'Content-Type':'application/json',
                }})
            const data = await res.json() as MessageResponse
            const {messageList,headToken,tailToken} = await this._messageResponseToMesssageListAndTokens(data,address)
            return {messageList,headToken,tailToken}
        } catch (error) {
            console.log('error',error)
        }
    }
    getTransactionPayloadHash(transactionPayload:ITransactionPayload){

        return Converter.bytesToHex(TransactionHelper.getTransactionPayloadHash(transactionPayload), true)
    }
    getOutputIdFromTransactionPayloadHashAndIndex(transactionPayloadHash:string,index:number){
        return TransactionHelper.outputIdFromTransactionData( transactionPayloadHash, index)
    }
    getFirstOutputIdFromTransactionPayload(transactionPayload:ITransactionPayload){
        const transactionPayloadHash = this.getTransactionPayloadHash(transactionPayload)
        return this.getOutputIdFromTransactionPayloadHashAndIndex(transactionPayloadHash,0)
    }
    // fetchMessageListUntil
    async fetchMessageListUntil(groupId:string, address:string, coninuationToken:string, limit:number=10) {
        try {
            const prefixedGroupId = IotaCatSDKObj._addHexPrefixIfAbsent(groupId)
            
            const params = {groupId:prefixedGroupId,size:limit, token:coninuationToken}
            const paramStr = formatUrlParams(params)
            const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/messages/until${paramStr}`
            // @ts-ignore
            const res = await fetch(url,{
                method:'GET',
                headers:{
                'Content-Type':'application/json',
                }})
            const data = await res.json() as MessageResponse
            const {messageList,headToken,tailToken} = await this._messageResponseToMesssageListAndTokens(data,address)
            return {messageList,headToken,tailToken}
        } catch (error) {
            console.log('error',error)
        }
    }
    // fetch inbox item list
    async fetchInboxItemList(address:string, coninuationToken?:string, limit:number=10) {
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
            const itemList = await this._messagesToMessageBodies(items,address)
            return {itemList,token}
        } catch (error) {
            console.log('error',error)
        }
    }
    async _messageResponseToMesssageListAndTokens(response:MessageResponse, address:string):Promise<{messageList:EventItemFullfilled[],headToken?:string,  tailToken?:string}>{
        const messages = response.messages
        const messageList = await this._messagesToMessageBodies(messages,address)
        return {messageList,headToken:response.headToken, tailToken:response.tailToken}
    }
    // messagesToMessageBodies
    async _messagesToMessageBodies(items:EventItem[],address:string):Promise<(EventGroupMemberChanged|MessageBody)[]>{
        const messagePayloads = await Promise.all(items.map((item:EventItem) => {
            if (item.type == ImInboxEventTypeNewMessage) {
                return this.getMessageFromOutputId({outputId:item.outputId,address,type:item.type})
            } else if (item.type == ImInboxEventTypeGroupMemberChanged) {
                const fn = async () => item
                return fn()
            }
        }))
        const messageBodyArr:(EventGroupMemberChanged|MessageBody|undefined)[] = messagePayloads.map((payload,index)=>{
            if (!payload) return undefined;
            if (payload.type == ImInboxEventTypeGroupMemberChanged) {
                return payload as EventGroupMemberChanged;
            } else if (payload.type == ImInboxEventTypeNewMessage){
                return {
                    type:payload.type,
                    timestamp:items[index].timestamp,
                    groupId:payload.message.groupId,
                    message:payload.message.data??'',
                    messageId:payload.messageId,
                    sender:payload.sender
                }
            }
        })
        const filterdMessageBodyArr = messageBodyArr.filter(msg=>msg!=undefined) as EventItemFullfilled[]
        return filterdMessageBodyArr
    }

    // iota shimmer service
    async _getOneOutputWithTag(tag:string):Promise<{outputId:string,output:IBasicOutput}|undefined>{
        this._ensureClientInited()
        this._ensureWalletInited()
        const outputsResponse = await this._indexer!.basicOutputs({
            addressBech32: this._accountBech32Address,
            tagHex:`0x${Converter.utf8ToHex(tag)}`,
            hasStorageDepositReturn: false,
            hasExpiration: false,
            hasTimelock: false,
            hasNativeTokens: false,
            pageSize:1,
        });
        const outputId = outputsResponse.items ? outputsResponse.items[0] : undefined
        if (!outputId) return undefined
        const outputResponse = await this._client!.output(outputId)
        const output = outputResponse.output as IBasicOutput
        return {outputId,output}
    }
    async getMarkedGroupIds(userAddress: string){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {list} = await this._getMarkedGroupIds(userAddress)
        return list
    }
    // memberList should contain self if already qualified
    async markGroup({groupId,memberList, userAddress,memberSelf,
        qualifyList
    }:{groupId:string,
        memberList?:{addr:string,publicKey:string}[], userAddress: string,
        memberSelf?:{addr:string,publicKey:string},
        qualifyList?:{addr:string,publicKey:string}[]
    }){
        this._ensureClientInited()
        this._ensureWalletInited()
        // log markGroup, groupId, memberList, userAddress, memberSelf
        console.log('markGroup', groupId, memberList, userAddress, memberSelf);
        try {
            const tasks:Promise<any>[] = [this._getMarkedGroupIds(userAddress)]
            const isMakeSharedOutput = memberList && memberList.length > 0
            if (isMakeSharedOutput) {
                tasks.push(this._makeSharedOutputForGroup({groupId,memberList,memberSelf}))
            }
            const tasksRes = await Promise.all(tasks)
            const {outputWrapper,list} = tasksRes.shift() as {outputWrapper?:BasicOutputWrapper, list:IMUserMarkedGroupId[]}
            let extraOutputs
            if (isMakeSharedOutput) {
                const sharedOutputRes = tasksRes.shift() as {outputs:IBasicOutput[]}
                extraOutputs = sharedOutputRes.outputs
            }
            // log existing list
            console.log('existing list', list, outputWrapper);
            if (list.find(id=>id.groupId === groupId)) {
                // already marked, log
                console.log('already marked', groupId);
                return
            }
            list.push({groupId,timestamp:Date.now()})
            console.log('new list', list)
            return await this._persistMarkedGroupIds({list,outputWrapper,extraOutputs})
        } catch (error) {
            console.log('markGroup error',error)
        }
    }
    async unmarkGroup(groupId:string, userAddress: string){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {outputWrapper,list} = await this._getMarkedGroupIds(userAddress)
        const idx = list.findIndex(id=>id.groupId === groupId)
        if (idx === -1) {
            console.log('already unmark')
            return
        }
        list.splice(idx,1)
        return await this._persistMarkedGroupIds({list,outputWrapper})
    }
    async _persistMarkedGroupIds({
        list,
        outputWrapper,
        extraOutputs
    }:{list:IMUserMarkedGroupId[],extraOutputs?:IBasicOutput[],outputWrapper?:BasicOutputWrapper}){
        const tag = `0x${Converter.utf8ToHex(GROUPFIMARKTAG)}`
        const data = serializeUserMarkedGroupIds(list)
        const basicOutput = await this._dataAndTagToBasicOutput(data,tag)
        const toBeConsumed = outputWrapper ? [outputWrapper] : []
        console.log('created and consumed', basicOutput, toBeConsumed);
        const createdOutputs = extraOutputs ? [basicOutput, ...extraOutputs] : [basicOutput]
        return await this._sendBasicOutput(createdOutputs,toBeConsumed);
    }
    async setProfile(profileJsonStr: string, outputIdToBeConsumed?: string) {
        console.log('===>setProfile params', profileJsonStr, outputIdToBeConsumed)
        const res = await this._persistSelectedProfile(profileJsonStr, outputIdToBeConsumed)
        console.log('===>setProfile res', res)
        return res
    }
    async _persistSelectedProfile(metadataJsonStr: string, outputIdToBeConsumed?: string) {
        const tag = `0x${Converter.utf8ToHex(GROUPFIPROFILETAG)}`
        const metadataHex = Converter.utf8ToHex(metadataJsonStr, true)
        const basicOutput = await this._dataAndTagToBasicOutput(metadataHex, tag)
        let toBeConsumed: BasicOutputWrapper[] = []
        if (outputIdToBeConsumed) {
            const outputResponse = await this._client!.output(outputIdToBeConsumed)
            const output = outputResponse.output as IBasicOutput
            toBeConsumed.push({
                output,
                outputId: outputIdToBeConsumed
            })
        }
        const createdOutputs = [basicOutput]
        return await this._sendBasicOutput(createdOutputs, toBeConsumed)
    }
    // async _getMarkedGroupIds():Promise<{outputWrapper?:BasicOutputWrapper, list:IMUserMarkedGroupId[]}>{
    //     const existing = await this._getOneOutputWithTag(GROUPFIMARKTAG)
    //     console.log('_getMarkedGroupIds existing', existing);
    //     if (!existing) return {list:[]}
    //     const {output} = existing
    //     const meta = output.features?.find(feature=>feature.type === 2) as IMetadataFeature
    //     if (!meta) return {list:[]}
    //     const data = Converter.hexToBytes(meta.data)
    //     const groupIds = deserializeUserMarkedGroupIds(data)
    //     return {outputWrapper:existing,list:groupIds}
    // }
    async _getMarkedGroupIds(userAddress: string):Promise<{outputWrapper?:BasicOutputWrapper, list:IMUserMarkedGroupId[]}>{
        // log enter _getMarkedGroupIds
        console.log('enter _getMarkedGroupIds');
        try {
            const existing = await this._getOneOutputWithTag(GROUPFIMARKTAG)
            const markedGroups = await IotaCatSDKObj.fetchAddressMarkGroupDetails(userAddress)
            return {outputWrapper:existing,list:markedGroups}
        } catch (error) {
            console.log('getMarkedGroupIds error', error);
            throw error
        }
    }

    async _dataAndTagToBasicOutput(data:Uint8Array | HexEncodedString,tag:string):Promise<IBasicOutput>{
        const tagFeature: ITagFeature = {
            type: 3,
            tag
        };
        const metadataFeature: IMetadataFeature = {
            type: 2,
            data: typeof data === 'string' ? data : Converter.bytesToHex(data, true)
        };
        const basicOutput: IBasicOutput = {
            type: BASIC_OUTPUT_TYPE,
            amount: '',
            nativeTokens: [],
            unlockConditions: [
                {
                    type: ADDRESS_UNLOCK_CONDITION_TYPE,
                    address: {
                        type: ED25519_ADDRESS_TYPE,
                        pubKeyHash: this._accountHexAddress!
                    }
                }
            ],
            features: [
                metadataFeature,
                tagFeature
            ]
        };
        return basicOutput
    }

    async muteGroupMember(groupId:string,addrSha256Hash:string, userAddress: string){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {outputWrapper,list} = await this._getUserMuteGroupMembers(userAddress)
        if (list.find(id=>id.groupId === groupId && id.addrSha256Hash === addrSha256Hash)) return
        list.push({groupId,addrSha256Hash})
        return await this._persistUserMuteGroupMembers(list,outputWrapper)
    }
    async unmuteGroupMember(groupId:string,addrSha256Hash:string, userAddress: string){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {outputWrapper,list} = await this._getUserMuteGroupMembers(userAddress)
        const idx = list.findIndex(id=>id.groupId === groupId && id.addrSha256Hash === addrSha256Hash)
        if (idx === -1) return
        list.splice(idx,1)
        return await this._persistUserMuteGroupMembers(list,outputWrapper)
    }
    async _persistUserMuteGroupMembers(list:IMUserMuteGroupMember[],outputWrapper?:BasicOutputWrapper){
        const tag = `0x${Converter.utf8ToHex(GROUPFIMUTETAG)}`
        const data = serializeUserMuteGroupMembers(list)
        const basicOutput = await this._dataAndTagToBasicOutput(data,tag)
        const toBeConsumed = outputWrapper ? [outputWrapper] : []
        return await this._sendBasicOutput([basicOutput],toBeConsumed);
    }

    async _getUserMuteGroupMembers(userAddress: string):Promise<{outputWrapper?:BasicOutputWrapper, list:IMUserMuteGroupMember[]}>{
        const existing = await this._getOneOutputWithTag(GROUPFIMUTETAG)
        const muteGroups = await IotaCatSDKObj.fetchAddressMutes(userAddress)
        // if (!existing) return {list:[]}
        // const {output} = existing
        // const meta = output.features?.find(feature=>feature.type === 2) as IMetadataFeature
        // if (!meta) return {list:[]}
        // const data = Converter.hexToBytes(meta.data)
        // const groupIds = deserializeUserMuteGroupMembers(data)
        return {outputWrapper:existing,list:muteGroups}
    }
    async getAllUserMuteGroupMembers(userAddress: string){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {list} = await this._getUserMuteGroupMembers(userAddress)
        return list
    }
    // same sets of function for user like group members
    async likeGroupMember(groupId:string,addrSha256Hash:string, userAddress: string){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {outputWrapper,list} = await this._getUserLikeGroupMembers(userAddress)
        if (list.find(id=>id.groupId === groupId && id.addrSha256Hash === addrSha256Hash)) return
        list.push({groupId,addrSha256Hash})
        return await this._persistUserLikeGroupMembers(list,outputWrapper)
    }

    async unlikeGroupMember(groupId:string,addrSha256Hash:string, userAddress: string){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {outputWrapper,list} = await this._getUserLikeGroupMembers(userAddress)
        const idx = list.findIndex(id=>id.groupId === groupId && id.addrSha256Hash === addrSha256Hash)
        if (idx === -1) return
        list.splice(idx,1)
        return await this._persistUserLikeGroupMembers(list,outputWrapper)
    }

    async _persistUserLikeGroupMembers(list:IMUserLikeGroupMember[],outputWrapper?:BasicOutputWrapper){
        const tag = `0x${Converter.utf8ToHex(GROUPFILIKETAG)}`
        const data = serializeUserLikeGroupMembers(list)
        const basicOutput = await this._dataAndTagToBasicOutput(data,tag)
        const toBeConsumed = outputWrapper ? [outputWrapper] : []
        return await this._sendBasicOutput([basicOutput],toBeConsumed);
    }

    async _getUserLikeGroupMembers(userAddress: string):Promise<{outputWrapper?:BasicOutputWrapper, list:IMUserLikeGroupMember[]}>{
        const existing = await this._getOneOutputWithTag(GROUPFILIKETAG)
        const likeGroups = await IotaCatSDKObj.fetchAddressLikes(userAddress)
        return {outputWrapper:existing,list:likeGroups}
    }

    async getAllUserLikeGroupMembers(userAddress: string){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {list} = await this._getUserLikeGroupMembers(userAddress)
        return list
    }
    // get group votes
    async getAllGroupVotes(userAddress: string){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {outputWrapper,list} = await this._getUserVoteGroups(userAddress)
        return list
    }
    async voteGroup(groupId:string, vote:number, userAddress: string){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {outputWrapper,list} = await this._getUserVoteGroups(userAddress)
        const existing = list.find(id=>id.groupId === groupId)
        if (existing) {
            if (existing.vote === vote) return
            existing.vote = vote
        } else {
            list.push({groupId,vote})
        }
        return await this._persistUserVoteGroups(list,outputWrapper)
    }
    
    async unvoteGroup(groupId:string, userAddress: string){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {outputWrapper,list} = await this._getUserVoteGroups(userAddress)
        const idx = list.findIndex(id=>id.groupId === groupId)
        if (idx === -1) {
            console.log('alreay unvote')
            return
        }
        list[idx].vote = 2
        // list.splice(idx,1)
        return await this._persistUserVoteGroups(list,outputWrapper)
    }

    async _persistUserVoteGroups(list:IMUserVoteGroup[],outputWrapper?:BasicOutputWrapper){
        const tag = `0x${Converter.utf8ToHex(GROUPFIVOTETAG)}`
        const data = serializeUserVoteGroups(list)
        const basicOutput = await this._dataAndTagToBasicOutput(data,tag)
        const toBeConsumed = outputWrapper ? [outputWrapper] : []
        return await this._sendBasicOutput([basicOutput],toBeConsumed);
    }
    // async _getUserVoteGroups():Promise<{outputWrapper?:BasicOutputWrapper, list:IMUserVoteGroup[]}>{
    //     const existing = await this._getOneOutputWithTag(GROUPFIVOTETAG)
    //     if (!existing) return {list:[]}
    //     const {output} = existing
    //     const meta = output.features?.find(feature=>feature.type === 2) as IMetadataFeature
    //     if (!meta) return {list:[]}
    //     const data = Converter.hexToBytes(meta.data)
    //     const groupIds = deserializeUserVoteGroups(data)
    //     return {outputWrapper:existing,list:groupIds}
    // }
    async _getUserVoteGroups(userAddress: string):Promise<{outputWrapper?:BasicOutputWrapper, list:IMUserVoteGroup[]}>{
        const existing = await this._getOneOutputWithTag(GROUPFIVOTETAG)
        const voteGroups = await IotaCatSDKObj.fetchAddressVotes(userAddress)
        // if (!existing) return {list:[]}
        // const {output} = existing
        // const meta = output.features?.find(feature=>feature.type === 2) as IMetadataFeature
        // if (!meta) return {list:[]}
        // const data = Converter.hexToBytes(meta.data)
        // const groupIds = deserializeUserVoteGroups(data)
        return {outputWrapper:existing,list:voteGroups}
    }
    // _persistEvmQualify
    async _getEvmQualify(groupId:string,addressList:string[],signature:string, addressType:AddressType,timestamp:number):Promise<IBasicOutput>{
        const tag = `0x${Converter.utf8ToHex(GROUPFIQUALIFYTAG)}`
        const data = serializeEvmQualify(groupId,addressList,signature,addressType,timestamp)
        const basicOutput = await this._dataAndTagToBasicOutput(data,tag)
        const twoWeekSecs =  60 * 60 * 24 * 14
        this._addTimeUnlockToBasicOutput(basicOutput, twoWeekSecs)
        this._addMinimalAmountToBasicOutput(basicOutput)
        return basicOutput
    }
    //TODO
    async _signAndSendTransactionEssence({transactionEssence}:{transactionEssence:ITransactionEssence}):Promise<{blockId:string,outputId:string,transactionId:string,remainderOutputId?:string}>{
        // log enter _signAndSendTransactionEssence
        console.log('===> enter _signAndSendTransactionEssence',transactionEssence);
        const writeStream = new WriteStream();
        serializeTransactionEssence(writeStream, transactionEssence);
        const essenceFinal = writeStream.finalBytes();
        // const transactionEssenceUrl = createBlobURLFromUint8Array(essenceFinal);
        const res = await this._requestAdapter!.sendTransaction({
            essence: essenceFinal,
            pairX: this._pairX,
            essenceOutputsLength: transactionEssence.outputs.length
        })

        this._lastSendTimestamp = Date.now()
        return res
    }
    async _decryptAesKeyFromRecipientsWithPayload(recipientPayload:Uint8Array):Promise<string>{
        try {
            const res = await this._requestAdapter!.decrypt({
                dataTobeDecrypted: recipientPayload,
                pairX:this._pairX
            })
            return res
        } catch(error) {
            return ''
        }
        
        // const res = await this._sdkRequest({
        //     method: 'iota_im_decrypt_key',
        //     params: {
        //       content: {
        //         addr: this._accountBech32Address,
        //         recipientPayloadUrl,
        //         nodeUrlHint:this._curNode!.apiUrl
        //       },
        //     },
        //   }) as string;
        // releaseBlobUrl(recipientPayloadUrl) 
        // return res
    }
    async _sdkRequest(call: (...args: any[]) => Promise<any>) {
        this._queuePromise = this._queuePromise!.then(call, call)
        return this._queuePromise
    }
    
    // async _sdkRequest(args:any){
    //     const newCall = () => IotaSDK.request(args)
    //     this._queuePromise = this._queuePromise!.then(newCall, newCall)
    //     return this._queuePromise
    // }

    async decryptPairX({privateKeyEncrypted, publicKey}: {privateKeyEncrypted: string, publicKey: string}): Promise<{
        password: string,
        pairX: PairX | null
    }> {
        const  proxyModeRequestAdapter = this._requestAdapter as IProxyModeRequestAdapter
        const {password, decryptedResult:first32BytesOfPrivateKeyHex} = await proxyModeRequestAdapter.decryptPairX({encryptedData: privateKeyEncrypted})
        console.log('decryptPairX first32BytesOfPrivateKeyHex', first32BytesOfPrivateKeyHex, first32BytesOfPrivateKeyHex === '')

        if (!first32BytesOfPrivateKeyHex) {
            return {
                password,
                pairX: null
            }
        }

        const first32BytesOfPrivateKey = Converter.hexToBytes(first32BytesOfPrivateKeyHex) 
        console.log('decryptPairX first32BytesOfPrivateKey', first32BytesOfPrivateKey)
        const publicKeyBytes = Converter.hexToBytes(publicKey)
        const pairX = {
            publicKey: publicKeyBytes,
            privateKey: concatBytes(first32BytesOfPrivateKey, publicKeyBytes)
        }
        console.log('===>decryptPairX pairX', pairX)
        return {
            pairX,
            password
        }
    }

    async registerTanglePayPairX(params: {
        pairX: PairX,
        metadataObjWithSignature: Object
    }) {
        const { metadataObjWithSignature, pairX } = params
        const pairXNftOutput = await this.createPairXNftOutput(metadataObjWithSignature)
        const res = await this._sendBasicOutput([pairXNftOutput])
        console.log('===> registerTanglePayPairX res', res)
        this._pairX = pairX
    }

    // async registerTanglePayPairX(params: {evmAddress: string, pairX: PairX}) {
    //     const {pairX, evmAddress} = params
    //     const pairXNftOutput = await this.createPairXNftOutput(evmAddress, pairX)
    //     const res = await this._sendBasicOutput([pairXNftOutput])
    //     console.log('===> registerTanglePayPairX res', res)
    //     this._pairX = pairX
    // }
    async createPairXNftOutput(metadataObjWithSignature: Object) {
        const metadata = Converter.utf8ToHex(JSON.stringify(metadataObjWithSignature), true)

        const tagFeature: ITagFeature = {
            type: 3,
            tag: `0x${Converter.utf8ToHex(GROUPFIPAIRXTAG)}`
        };

        const collectionOutput: INftOutput = {
            type: NFT_OUTPUT_TYPE,
            amount: '',
            nativeTokens: [],
            nftId:
                '0x0000000000000000000000000000000000000000000000000000000000000000',
            unlockConditions: [
                {
                    type: ADDRESS_UNLOCK_CONDITION_TYPE,
                    address: {
                        type: ED25519_ADDRESS_TYPE,
                        pubKeyHash: this._accountHexAddress!
                    }
                }
            ],
            features: [
                tagFeature
            ],
            immutableFeatures: [
                {
                type: ISSUER_FEATURE_TYPE,
                address: {
                    type: ED25519_ADDRESS_TYPE,
                    pubKeyHash: this._accountHexAddress!
                },
                },
                {
                type: METADATA_FEATURE_TYPE,
                data: metadata
                },
            ],
        };
        return collectionOutput
    }
    // async createPairXNftOutput(evmAddress: string, pairX: PairX) {
    //     if (!this._requestAdapter) {
    //         throw new Error('request dapter is undefined')
    //     }

    //     const proxyModeRequestAdapter = this._requestAdapter as IProxyModeRequestAdapter

    //     const encryptionPublicKey = await proxyModeRequestAdapter.getEncryptionPublicKey()

    //     // The last 32 bytes of the private key Uint8Array are the public key Uint8Array
    //     // only the first 32 bytes can be encrypted
    //     const first32BytesOfPrivateKeyHex = Converter.bytesToHex(pairX.privateKey.slice(0, 32))
    //     console.log('===>hexPrivateKeyFirst32Bytes', first32BytesOfPrivateKeyHex)

    //     const encryptedPrivateKeyHex = EthEncrypt({
    //         publicKey: encryptionPublicKey,
    //         dataTobeEncrypted: first32BytesOfPrivateKeyHex
    //     })

    //     console.log('====> encryptedPrivateKeyHex', encryptedPrivateKeyHex)

    //     const tagFeature: ITagFeature = {
    //         type: 3,
    //         tag: `0x${Converter.utf8ToHex(GROUPFIPAIRXTAG)}`
    //     };

    //     const metadataObj = {
    //         encryptedPrivateKey: encryptedPrivateKeyHex,
    //         pairXPublicKey: Converter.bytesToHex(pairX.publicKey, true),
    //         evmAddress: evmAddress,
    //         timestamp: getCurrentEpochInSeconds(),
    //         // 1: tp  2: mm
    //         scenery: 1
    //     }
            
    //     console.log('===> metadataObj', metadataObj)

    //     const dataTobeSignedStr = [
    //         metadataObj.encryptedPrivateKey,
    //         metadataObj.evmAddress,
    //         metadataObj.pairXPublicKey,
    //         metadataObj.scenery,
    //         metadataObj.timestamp
    //     ].join('')

    //     console.log('===> dataToBeSignedStr', dataTobeSignedStr)

    //     const dataToBeSignedHex = Converter.utf8ToHex(dataTobeSignedStr, true)
    //     const signature = await proxyModeRequestAdapter.ethSign({dataToBeSignedHex})

    //     console.log('===> signature', signature)

    //     const metadata = Converter.utf8ToHex(JSON.stringify({
    //         ...metadataObj,
    //         signature,
    //     }), true)

    //     console.log('===> metadata final', metadata)

    //     const collectionOutput: INftOutput = {
    //         type: NFT_OUTPUT_TYPE,
    //         amount: '',
    //         nativeTokens: [],
    //         nftId:
    //             '0x0000000000000000000000000000000000000000000000000000000000000000',
    //         unlockConditions: [
    //             {
    //                 type: ADDRESS_UNLOCK_CONDITION_TYPE,
    //                 address: {
    //                     type: ED25519_ADDRESS_TYPE,
    //                     pubKeyHash: this._accountHexAddress!
    //                 }
    //             }
    //         ],
    //         features: [
    //             tagFeature
    //         ],
    //         immutableFeatures: [
    //             {
    //             type: ISSUER_FEATURE_TYPE,
    //             address: {
    //                 type: ED25519_ADDRESS_TYPE,
    //                 pubKeyHash: this._accountHexAddress!
    //             },
    //             },
    //             {
    //             type: METADATA_FEATURE_TYPE,
    //             data: metadata
    //             },
    //         ],
    //     };
    //     return collectionOutput
    // }
}

