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
    IKeyPair,
    INodeInfo,
    INodeInfoProtocol,
    IPowProvider,
    COIN_TYPE_SHIMMER,
    IAddressUnlockCondition,
    IEd25519Address,
    IOutputResponse,
    REFERENCE_UNLOCK_TYPE,
    TIMELOCK_UNLOCK_CONDITION_TYPE
} from "@iota/iota.js";
import { Converter, WriteStream,  } from "@iota/util.js";
import { encrypt, decrypt, getEphemeralSecretAndPublicKey, util, setCryptoJS, setHkdf, setIotaCrypto, EncryptedPayload, decryptOneOfList, EncryptingPayload, encryptPayloadList } from 'ecies-ed25519-js';
import bigInt from "big-integer";
import { IMMessage, IotaCatSDKObj, IOTACATTAG, IOTACATSHAREDTAG, makeLRUCache,LRUCache, cacheGet, cachePut, MessageAuthSchemeRecipeintOnChain, MessageAuthSchemeRecipeintInMessage, INX_GROUPFI_DOMAIN, 
    IMUserMarkedGroupId, serializeUserMarkedGroupIds, deserializeUserMarkedGroupIds,
    IMUserMuteGroupMember,serializeUserMuteGroupMembers, deserializeUserMuteGroupMembers,
    IMUserVoteGroup, serializeUserVoteGroups, deserializeUserVoteGroups,
    GROUPFIMARKTAG, GROUPFIMUTETAG, GROUPFIVOTETAG

} from "iotacat-sdk-core";
import {runBatch, formatUrlParams} from 'iotacat-sdk-utils';

//TODO tune concurrency
const httpCallLimit = 5;
const consolidateBatchSize = 29;
setIotaCrypto({
    Bip39,
    Ed25519,
    Sha512
})

import hkdf from 'js-crypto-hkdf';
import { IMRecipient } from "iotacat-sdk-core";
import { EventEmitter } from 'events';
import { GroupMemberTooManyToPublicThreshold } from "iotacat-sdk-core";
import { MessageTypePublic } from "iotacat-sdk-core";
import { IMessage } from 'iotacat-sdk-core';
setHkdf(async (secret:Uint8Array, length:number, salt:Uint8Array)=>{
    const res = await hkdf.compute(secret, 'SHA-256', length, '',salt)
    return res.key;
})
setCryptoJS(CryptoJS)
const tag = Converter.utf8ToBytes(IOTACATTAG)

interface StorageFacade {
    prefix: string;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
}
type OutputResponseWrapper = {
    output: IOutputResponse;
    outputId: string;
}
type BasicOutputWrapper = {
    output: IBasicOutput;
    outputId: string;
}
type MessageResponseItem = {
    outputId: string;
    timestamp: number;
}
type MessageResponse = {
    messages:MessageResponseItem[]
    headToken:string
    tailToken:string
}
type InboxMessageResponse = {
    messages:MessageResponseItem[]
    token:string
}
export type MessageBody = {
    sender:string,
    message:string,
    messageId:string,
    groupId:string,
    timestamp:number
}
type NftItemReponse = {
    ownerAddress: string;
    publicKey: string;
    nftId: string;
}
type Network = {
    id: number;
    isFaucetAvailable: boolean;
    faucetUrl?: string;
    apiUrl: string;
    explorerApiUrl: string;
    explorerApiNetwork: string;
    networkId: string;
    inxMqttEndpoint: string;
}
const shimmerTestNet = {
    id: 101,
    isFaucetAvailable: true,
    faucetUrl: "https://faucet.alphanet.iotaledger.net/api/enqueue",
    apiUrl: "https://soon.dlt.builders/api/core/v2/info",
    explorerApiUrl: "https://explorer-api.shimmer.network/stardust",
    explorerApiNetwork: "testnet",
    networkId: "1856588631910923207",
    inxMqttEndpoint: "wss://test.api.iotacat.com/mqtt",
}

const shimmerMainNet = {
    id: 102,
    isFaucetAvailable: false,
    apiUrl: "https://mainnet.shimmer.node.tanglepay.com",
    explorerApiUrl: "https://explorer-api.shimmer.network/stardust",
    explorerApiNetwork: "shimmer",
    networkId: "14364762045254553490",
    inxMqttEndpoint: "wss://test.api.iotacat.com/api/iotacatmqtt/v1",
}
const nodes = [
    shimmerTestNet,
    shimmerMainNet
]
type Constructor<T> = new () => T;
class IotaCatClient {
    _curNode?:Network;
    _client?: SingleNodeClient;
    _indexer?: IndexerPluginClient;
    _nodeInfo?: INodeInfo;
    _protocolInfo?: INodeInfoProtocol;
    _walletKeyPair?: IKeyPair;
    _accountHexAddress?:string;
    _accountBech32Address?:string;
    _pubKeyCache?:LRUCache<string>;
    _storage?:StorageFacade;
    _hexSeed?:string;
    _events:EventEmitter = new EventEmitter();
    //TODO simple cache
    _saltCache:Record<string,string> = {};

    async setup(id:number, provider?:Constructor<IPowProvider>,...rest:any[]){
        const node = nodes.find(node=>node.id === id)
        if (!node) throw new Error('Node not found')
        this._curNode = node
        // @ts-ignore
        this._client = provider ? new SingleNodeClient(node.apiUrl, {powProvider: new provider(...rest)}) : new SingleNodeClient(node.apiUrl)
        this._indexer = new IndexerPluginClient(this._client)
        this._nodeInfo = await this._client.info();
        this._protocolInfo = await this._client.protocolInfo();
        this._pubKeyCache = makeLRUCache<string>(200)
        console.log('NodeInfo', this._nodeInfo);
        console.log('ProtocolInfo', this._protocolInfo);
    }
    setupStorage(storage:StorageFacade){
        this._storage = storage
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
    async setHexSeed(hexSeed:string){
        this._ensureClientInited()
        if (this._hexSeed == hexSeed) return
        this._hexSeed = hexSeed
        const baseSeed = this._hexSeedToEd25519Seed(hexSeed);
        this._walletKeyPair = this._getPair(baseSeed)
        const genesisEd25519Address = new Ed25519Address(this._walletKeyPair.publicKey);
        const genesisWalletAddress = genesisEd25519Address.toAddress();
        this._accountHexAddress = Converter.bytesToHex(genesisWalletAddress, true);
        console.log('AccountHexAddress', this._accountHexAddress);
        this._accountBech32Address = Bech32Helper.toBech32(ED25519_ADDRESS_TYPE, genesisWalletAddress, this._nodeInfo!.protocol.bech32Hrp);
        console.log('AccountBech32Address', this._accountBech32Address);
        
    }


    
    async _getPublicKeyFromLedgerEd25519(ed25519Address:string):Promise<string|undefined>{
        
        const addressBytes = Converter.hexToBytes(ed25519Address)

        const bech32Address = Bech32Helper.toBech32(ED25519_ADDRESS_TYPE, addressBytes, this._nodeInfo!.protocol.bech32Hrp)
        return await this._getPublicKeyFromLedger(bech32Address)
    }
    async _getPublicKeyFromLedger(bech32Address:string):Promise<string|undefined>{
        
        const outputId = await this._getTransactionHistory(bech32Address)
        if (!outputId) return
        const output = await this._client!.output(outputId)
        console.log('Output', output);
        const transactionId = output.metadata.transactionId
        const publicKey = await this._getPublicKeyViaTransactionId(transactionId)
        console.log('PublicKey', publicKey);
        return publicKey
    }
    async _getTransactionHistory(bech32Address:string):Promise<string|undefined>{
        if (!this._curNode) throw new Error('Node not initialized')
        const url = `${this._curNode.explorerApiUrl}/transactionhistory/${this._curNode.explorerApiNetwork}/${bech32Address}?pageSize=1000&sort=newest`
        console.log('TransactionHistoryUrl', url);
        const response = await fetch(url)
        const json = await response.json()
        console.log('TransactionHistory', json);
        if (json.items && json.items.length > 0) {
            const item = json.items.find((item:any)=>item.isSpent == true)
            if (!item) return
            const outputId = item.outputId
            return outputId
        }
    }
    async _getPublicKeyViaTransactionId(transactionId:string):Promise<string|undefined>{
        if (!this._curNode) throw new Error('Node not initialized')
        const url = `${this._curNode.explorerApiUrl}/transaction/${this._curNode.explorerApiNetwork}/${transactionId}`
        console.log('TransactionUrl', url);
        const response = await fetch(url)
        const json = await response.json()
        console.log('Transaction', json);
        for (const unlock of json.block.payload.unlocks) {
            if (unlock.type === 0) {
                const publicKey = unlock.signature.publicKey
                return publicKey
            }
        }
    }

    async getPublicKey(addressRaw:string, type='bech32'):Promise<string|undefined>{
        this._ensureClientInited()
        const address = this._storage?.prefix + addressRaw
        const memoryValue = cacheGet(address, this._pubKeyCache!)
        console.log('MemoryValue', memoryValue, addressRaw);
        if (memoryValue) return memoryValue

        /*
        const storageValue = await this._storage!.get(address)
        console.log('StorageValue', storageValue, addressRaw, typeof storageValue);
        if (storageValue) {
            cachePut(address, storageValue, this._pubKeyCache!)
            return storageValue
        }
        */
        let ledgerValue = type == 'bech32'? await this._getPublicKeyFromLedger(addressRaw) : await this._getPublicKeyFromLedgerEd25519(addressRaw)
        console.log('LedgerValue', ledgerValue, addressRaw);
        if (!ledgerValue) {
            ledgerValue = 'noop'
        }
        //await this._storage!.set(address, ledgerValue)
        cachePut(address, ledgerValue, this._pubKeyCache!)
        return ledgerValue
    }

    async _getAddressListForGroupFromInxApi(groupId:string):Promise<{publicKey:string,ownerAddress:string}[]>{
        //TODO try inx plugin 
        try {
            const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/nftswithpublickey?groupId=0x${groupId}`
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
    async _getSharedOutputIdForGroupFromInxApi(groupId:string):Promise<{outputId:string}|undefined>{
        try {
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
                        throw IotaCatSDKObj.makeErrorForGroupMemberTooMany()
                    } 
                }                    
                const data = await res.json() as {outputId:string}
                return data
            } catch (error) {
                if (IotaCatSDKObj.verifyErrorForGroupMemberTooMany(error)) {
                    throw error
                }
                console.log('error',error)
            }
            
        } catch (error) {
            if (IotaCatSDKObj.verifyErrorForGroupMemberTooMany(error)) {
                throw error
            }
            console.log('error',error)
        }
        return undefined
    }
    async _getSharedOutputForGroup(groupId:string):Promise<{outputId:string,output:IBasicOutput}|undefined>{
        this._ensureClientInited()
        const res = await this._getSharedOutputIdForGroupFromInxApi(groupId)
        if (res) {
            const {outputId} = res
            const outputsResponse = await this._client!.output(outputId)
            return {outputId,output:outputsResponse.output as IBasicOutput}
        } else {
            return await this._makeSharedOutputForGroup(groupId)
        }
    }
    //ensure group have shared output, if not create one
    async ensureGroupHaveSharedOutput(groupId:string){
        this._ensureClientInited()
        try {
            const res = await this._getSharedOutputIdForGroupFromInxApi(groupId)
            if (!res) {
                await this._makeSharedOutputForGroup(groupId)
            }
        } catch (error) {
            if (IotaCatSDKObj.verifyErrorForGroupMemberTooMany(error)) {
                console.log('GroupMemberTooMany,public for now', error);
            } else {
                throw error
            }
        }
        return {message:'ok'}
    }
    async _getSaltForGroup(groupId:string, address:string):Promise<{salt:string, outputId:string}>{
        console.log(`_getSaltForGroup groupId:${groupId}, address:${address}`);
        const sharedOutputResp = await this._getSharedOutputForGroup(groupId)
        if (!sharedOutputResp) throw new Error('Shared output not found')
        const {output:sharedOutput,outputId} = sharedOutputResp
        console.log('sharedOutput', sharedOutput, address);
        const salt = await this._getSaltFromSharedOutput(sharedOutput, address)
        return {salt, outputId}
    }
    async _getSaltFromSharedOutput(sharedOutput:IBasicOutput, address:string):Promise<string>{
        const metaFeature = sharedOutput.features?.find((feature)=>feature.type == 2) as IMetadataFeature
        if (!metaFeature) throw new Error('Metadata feature not found')
        const bytes = Converter.hexToBytes(metaFeature.data)
        const recipients = IotaCatSDKObj.deserializeRecipientList(bytes)
        const recipientsWithPayload = recipients.map((recipient)=>({...recipient,payload:Converter.hexToBytes(recipient.mkey)}))

        const addressHashValue = await IotaCatSDKObj.getAddressHashStr(address)
        console.log('recipients', recipients, address, addressHashValue);
        let salt = ''
        let idx = -1
        // find idx based on addr match
        for (let i=0;i<recipientsWithPayload.length;i++) {
            const recipient = recipientsWithPayload[i]
            if (!recipient.mkey) continue
            if (recipient.addr !== addressHashValue) continue
            idx = i;
            break
        }
        const decrypted = await decryptOneOfList({receiverSecret:this._walletKeyPair!.privateKey,
            payloadList:recipientsWithPayload,tag,idx})
        if(decrypted) {
            salt = decrypted.payload
        }
        if (!salt) throw new Error('Salt not found')
        return salt
    }
    async _getSaltFromSharedOutputId(outputId:string, address:string):Promise<{salt:string}>{
        const outputsResponse = await this._client!.output(outputId)
        const output = outputsResponse.output as IBasicOutput
        const salt = await this._getSaltFromSharedOutput(output, address)
        return {salt}
    }
    async _makeSharedOutputForGroup(groupId:string):Promise<{outputId:string,output:IBasicOutput}|undefined>{
         const nftsRes = await this._getAddressListForGroupFromInxApi(groupId)
         
         const recipients = nftsRes.map((nftRes)=>({addr:nftRes.ownerAddress,mkey:nftRes.publicKey}))

        console.log('_makeSharedOutputForGroup recipients', recipients);
        const salt = IotaCatSDKObj._generateRandomStr(32)
        //TODO remove
        console.log('shared salt', salt);
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
                    unixTime: (Date.now() / 1000) + 60 * 60 * 24 * 6
                }
            ],
            features: [
                metadataFeature,
                tagFeature
            ]
        };
        const {blockId,outputId} = await this._sendBasicOutput(basicOutput);

        return {outputId,output:basicOutput};
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
        if (!this._client || !this._indexer || !this._nodeInfo || !this._protocolInfo) throw new Error('Client not initialized')
    }
    _ensureWalletInited(){
        if (!this._walletKeyPair || !this._accountHexAddress || !this._accountBech32Address) throw new Error('Wallet not initialized')
    }
    _ensureStorageInited(){
        if (!this._storage) throw new Error('Storage not initialized')
    }
    async getMessageFromOutputId(outputId:string,address:string){
        this._ensureClientInited()
        try {
            const outputsResponse = await this._client!.output(outputId)
            const output = outputsResponse.output as IBasicOutput
            const addressUnlockcondition = output.unlockConditions.find(unlockCondition=>unlockCondition.type === 0) as IAddressUnlockCondition
            const senderAddress = addressUnlockcondition.address as IEd25519Address
            const senderAddressBytes = Converter.hexToBytes(senderAddress.pubKeyHash)
            
            const features = output.features
            if (!features) throw new Error('No features')
            const metadataFeature = features.find(feature=>feature.type === 2) as IMetadataFeature
            if (!metadataFeature) throw new Error('No metadata feature')
            const data = Converter.hexToBytes(metadataFeature.data)
            const {sender, message, messageId} = await this.getMessageFromMetafeaturepayloadAndSender({data,senderAddressBytes,address})
            return { sender, message, messageId }
        } catch(e) {
            console.log(`getMessageFromOutputId:${outputId}`);
        }
    }
    // getMessageFromMetafeaturepayloadandsender
    async getMessageFromMetafeaturepayloadAndSender({data,senderAddressBytes,address}:{data:Uint8Array|string,senderAddressBytes:Uint8Array|string,address:string}):Promise<{sender:string,message:IMMessage,messageId:string}>{
        const data_ = typeof data === 'string' ? Converter.hexToBytes(data) : data
        const senderAddressBytes_ = typeof senderAddressBytes === 'string' ? Converter.hexToBytes(senderAddressBytes) : senderAddressBytes
        const messageId = IotaCatSDKObj.getMessageId(data_, senderAddressBytes_)
        const sender = Bech32Helper.toBech32(ED25519_ADDRESS_TYPE, senderAddressBytes_, this._nodeInfo!.protocol.bech32Hrp);
        const message = await IotaCatSDKObj.deserializeMessage(data_, address, {decryptUsingPrivateKey:async (data:Uint8Array)=>{
            const decrypted = await decrypt(this._walletKeyPair!.privateKey, data, tag)
            return decrypted.payload
        },sharedOutputSaltResolver:async (sharedOutputId:string)=>{
            const {salt} = await this._getSaltFromSharedOutputId(sharedOutputId,address)
            return salt
        }})
        return {sender,message,messageId}
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
    async _getOutputIdsFromMessageConsolidationSharedApi(address:string){
        const params = {address:`${address}`}
        const paramStr = formatUrlParams(params)
        const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/consolidation/shared${paramStr}`
        // @ts-ignore
        const res = await fetch(url,{
            method:'GET',
            headers:{
            'Content-Type':'application/json',
            }})
        const data = await res.json() as string[]
        return data ?? []
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
        const outputsResponse = await this._indexer!.basicOutputs({
            addressBech32: this._accountBech32Address,
            hasStorageDepositReturn: false,
            hasExpiration: false,
            hasTimelock: false,
            hasNativeTokens: false,
            pageSize,
            cursor
        });
        const nextCursor = outputsResponse.cursor
        console.log('OutputsResponse', outputsResponse);
        let outputIds = outputsResponse.items
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
    _filterOutputsCannotBeConsolidated(outputs:BasicOutputWrapper){
        // filter out output that have tag feature or metadata feature or native tokens
        const features = outputs.output.features
        if (!features) return true
        const tagFeature = features.find(feature=>feature.type === 3)
        if (tagFeature) return false
        const metadataFeature = features.find(feature=>feature.type === 2)
        if (metadataFeature) return false
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
    _getAmount(output:IBasicOutput){
        console.log('_getAmount', output, this._protocolInfo!.rentStructure)
        const deposit = TransactionHelper.getStorageDeposit(output, this._protocolInfo!.rentStructure)
        return bigInt(deposit)
    }
    async _bech32AddrArrToRecipients(bech32AddrArr:string[]){
        console.log(`_bech32AddrArrToRecipients before remove duplications size:${bech32AddrArr.length}`);
        const set = new Set(bech32AddrArr)
        bech32AddrArr = Array.from(set)
        console.log(`_bech32AddrArrToRecipients after remove duplications size:${bech32AddrArr.length}`);
        
        const tasks = bech32AddrArr.map(addr=> async() => {
            
            try {
                const pubKey = await this.getPublicKey(addr)
                console.log('pubKey', pubKey, addr);
                return {mkey:pubKey,addr:addr} as IMRecipient
            } catch (error) {
                console.log('error',error)
                return {mkey:'noop',addr:addr} as IMRecipient
            }
        })
            
        
        let recipients = await runBatch(tasks, httpCallLimit)
        /*
        let recipients:{mkey:string,addr:string}[] = []
        let recipients2:{mkey:string,addr:string}[] = []
        for (const addr of bech32AddrArr) {
            let recipient:{mkey:string,addr:string}
            try {
                let pubKey = await this.getPublicKey(addr)
                pubKey = pubKey??'noop'
                console.log('pubKey', pubKey, addr, typeof pubKey);
                recipient = {mkey:pubKey,addr:addr}
            } catch (error) {
                console.log('error',error)
                recipient = {mkey:'noop',addr:addr}
            }
            console.log('recipient', recipient);
            recipients.push(recipient)
            recipients2.push({...recipient})
        }
        */
        console.log('recipients with PublicKeys', recipients);

        const total = recipients.length
        recipients = recipients.filter(recipient=>recipient && recipient.mkey!=null && recipient.mkey!='noop')
        const withKey = recipients.length
        console.log('recipients with PublicKeys filtered', recipients)
        console.log(`_bech32AddrArrToRecipients  recipients total:${total}, withKey:${withKey}`);
        return recipients.filter(r=>r && r.mkey!=null && r.mkey!='noop')
    }
    async sendMessage(senderAddr:string, groupId:string,message: IMMessage){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {data:rawText} = message
        try {
            const protocolInfo = await this._client!.protocolInfo();
            console.log('ProtocolInfo', protocolInfo);
            const groupSaltMap:Record<string,string> = {}
            const groupSaltResolver = async (groupId:string)=>groupSaltMap[groupId]
            try {
                
                if (message.authScheme == MessageAuthSchemeRecipeintInMessage) {
                    const nftsRes = await this._getAddressListForGroupFromInxApi(groupId)
                    const recipients = nftsRes.map((nftRes)=>({addr:nftRes.ownerAddress,mkey:nftRes.publicKey}))


                    message.recipients = recipients
                } else {
                    // get shared output
                    
                    const {salt, outputId} = await this._getSaltForGroup(groupId,senderAddr)
                    message.recipientOutputid = outputId
                    groupSaltMap[groupId] = salt
                    
                }
            } catch (error) {
                if (IotaCatSDKObj.verifyErrorForGroupMemberTooMany(error)) {
                    message.messageType = MessageTypePublic
                } else {
                    throw error
                }
            }
            console.log('MessageWithPublicKeys', message);
            const pl = await IotaCatSDKObj.serializeMessage(message,{encryptUsingPublicKey:async (key,data)=>{
                const publicKey = Converter.hexToBytes(key)
                const encrypted = await encrypt(publicKey, data, tag)
                return encrypted.payload
            },groupSaltResolver})
            console.log('MessagePayload', pl);
            
            const tagFeature: ITagFeature = {
                type: 3,
                tag: `0x${Converter.utf8ToHex(IOTACATTAG)}`
            };
            const metadataFeature: IMetadataFeature = {
                type: 2,
                data: Converter.bytesToHex(pl, true)
            };
            const messageId = IotaCatSDKObj.getMessageId(pl, Converter.hexToBytes(this._accountHexAddress!))
            // IMessage = {messageId:string, groupId:string, sender:string, message:string, timestamp:number}
            const messageSent: IMessage = {
                messageId,
                groupId,
                sender: senderAddr,
                message: rawText,
                timestamp: message.timestamp
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
                        unixTime: message.timestamp + 60 * 60 * 24 * 3
                    }
                ],
                features: [
                    metadataFeature,
                    tagFeature
                ]
            };
            console.log("Basic Output: ", basicOutput);

            
            const {blockId,outputId} = await this._sendBasicOutput(basicOutput);
            return {blockId,outputId,messageSent}
        } catch (e) {
            console.log("Error submitting block: ", e);
        }
        
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
    async _sendBasicOutput(basicOutput:IBasicOutput,extraOutputsToBeConsumed:BasicOutputWrapper[] = []){
        const amountToSend = this._getAmount(basicOutput)
        console.log('AmountToSend', amountToSend);
        basicOutput.amount = amountToSend.toString()
        const createdOutputs:IBasicOutput[] = [basicOutput]
        // get first output with amount > amountToSend
        let depositFromExtraOutputs = bigInt('0')

        for (const extraOutput of extraOutputsToBeConsumed) {
            const amount = bigInt(extraOutput.output.amount)
            depositFromExtraOutputs = depositFromExtraOutputs.add(amount)
        }
        const cashNeeded = amountToSend.subtract(depositFromExtraOutputs)
        console.log('cashNeeded', cashNeeded);
        if (cashNeeded.lesser(bigInt('0'))) {
            basicOutput.amount = depositFromExtraOutputs.toString()
        } else {
            const threshold = cashNeeded.multiply(2)
            const idsForFiltering = new Set(extraOutputsToBeConsumed.map(output=>output.outputId))
            const outputs = await this._getUnSpentOutputs({amountLargerThan:threshold,numbersWanted:1,idsForFiltering})
            console.log('unspent Outputs', outputs);
            
            const consumedOutputWrapper = outputs.find(output=>bigInt(output.output.amount).greater(threshold))
            
            if (!consumedOutputWrapper ) throw new Error('No output with enough amount')
            extraOutputsToBeConsumed.push(consumedOutputWrapper)
            const {output:consumedOutput, outputId:consumedOutputId}  = consumedOutputWrapper
            console.log('ConsumedOutput', consumedOutput);
            const remainderBasicOutput: IBasicOutput = {
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
        return await this._sendTransactionWithConsumedOutputsAndCreatedOutputs(extraOutputsToBeConsumed, createdOutputs)
    }
    // sendTransactionWithConsumedOutputsAndCreatedOutputs
    async _sendTransactionWithConsumedOutputsAndCreatedOutputs(consumedOutputs:BasicOutputWrapper[],createdOutputs:IBasicOutput[]){
        this._ensureClientInited()
        this._ensureWalletInited()
        const inputArray:IUTXOInput[] = []
        const consumedOutputArray:IBasicOutput[] = []
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
            networkId: this._curNode!.networkId, //this._protocolInfo!.networkName,
            inputs: inputArray, 
            inputsCommitment,
            outputs: createdOutputs,
            payload: undefined
        };

        const wsTsxEssence = new WriteStream();
        serializeTransactionEssence(wsTsxEssence, transactionEssence);
        const essenceFinal = wsTsxEssence.finalBytes();
        const essenceHash = Blake2b.sum256(essenceFinal);
        console.log("Transaction Essence: ", transactionEssence);

        // 6. Create the unlocks
        const addressUnlockCondition: UnlockTypes = {
            type: SIGNATURE_UNLOCK_TYPE,
            signature: {
                type: ED25519_SIGNATURE_TYPE,
                publicKey: Converter.bytesToHex(this._walletKeyPair!.publicKey, true),
                signature: Converter.bytesToHex(Ed25519.sign(this._walletKeyPair!.privateKey, essenceHash), true)
            }
        };
        const referenceUnlockCondition: UnlockTypes = {
            type: REFERENCE_UNLOCK_TYPE,
            reference: 0
        }
        console.log("Unlock condition: ", addressUnlockCondition);
        const unlockConditionArray:UnlockTypes[] = [];

        for (let i = 0; i < inputArray.length; i++) {
            if (i === 0) {
                unlockConditionArray.push(addressUnlockCondition);
            } else {
                unlockConditionArray.push(referenceUnlockCondition);
            }
        }
        // 7. Create transaction payload
        const transactionPayload: ITransactionPayload = {
            type: TRANSACTION_PAYLOAD_TYPE,
            essence: transactionEssence,
            unlocks:unlockConditionArray
        };
        console.log("Transaction payload: ", transactionPayload);
        const outputId = this.getFirstOutputIdFromTransactionPayload(transactionPayload)
        // 8. Create Block
        const block: IBlock = {
            protocolVersion: DEFAULT_PROTOCOL_VERSION,
            parents: [],
            payload: transactionPayload,
            nonce: "0"
        };
        console.log("Block: ", block);
        
        // 9. Submit block with pow
        console.log("Calculating PoW, submitting block...");
    
        try {
            const blockId = await this._client!.blockSubmit(block);
            console.log("Submitted blockId is: ", blockId);
            return {blockId,outputId};
        } catch (e) {
            console.log("Error submitting block: ", e);
            throw e
        }
    }
    async fetchMessageListFrom(groupId:string, address:string, coninuationToken?:string, limit:number=10) {
        try {
            const params = {groupId:`0x${groupId}`,size:limit, token:coninuationToken}
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
            const params = {groupId:`0x${groupId}`,size:limit, token:coninuationToken}
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
    // fetch inbox message list
    async fetchInboxMessageList(address:string, coninuationToken?:string, limit:number=10) {
        try {
            const params = {address:`${address}`,size:limit, token:coninuationToken}
            const paramStr = formatUrlParams(params)
            const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/inboxmessage${paramStr}`
            // @ts-ignore
            const res = await fetch(url,{
                method:'GET',
                headers:{
                'Content-Type':'application/json',
                }})
            const data = await res.json() as InboxMessageResponse
            const {messages,token} = data
            const messageList = await this._messagesToMessageBodies(messages,address)
            return {messageList,token}
        } catch (error) {
            console.log('error',error)
        }
    }
    async _messageResponseToMesssageListAndTokens(response:MessageResponse, address:string):Promise<{messageList:MessageBody[],headToken?:string,  tailToken?:string}>{
        const messages = response.messages
        const messageList = await this._messagesToMessageBodies(messages,address)
        return {messageList,headToken:response.headToken, tailToken:response.tailToken}
    }
    // messagesToMessageBodies
    async _messagesToMessageBodies(messages:MessageResponseItem[],address:string):Promise<MessageBody[]>{
        const messagePayloads = await Promise.all(messages.map(msg => this.getMessageFromOutputId(msg.outputId,address)))
        const messageBodyArr:(MessageBody|undefined)[] = messagePayloads.map((payload,index)=>{
            if (!payload) return undefined;
            return {
            timestamp:messages[index].timestamp,
            groupId:payload.message.groupId,
            message:payload.message.data??'',
            messageId:payload.messageId,
            sender:payload.sender
            }
        })
        const filterdMessageBodyArr = messageBodyArr.filter(msg=>msg!=undefined) as MessageBody[]
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
    async getMarkedGroupIds(){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {list} = await this._getMarkedGroupIds()
        return list
    }
    async markGroup(groupId:string){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {outputWrapper,list} = await this._getMarkedGroupIds()
        // log existing list
        console.log('existing list', list, outputWrapper);
        if (list.find(id=>id.groupId === groupId)) {
            // already marked, log
            console.log('already marked', groupId);
            return
        }
        list.push({groupId,timestamp:Date.now()})
        return await this._persistMarkedGroupIds(list,outputWrapper)
    }
    async unmarkGroup(groupId:string){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {outputWrapper,list} = await this._getMarkedGroupIds()
        const idx = list.findIndex(id=>id.groupId === groupId)
        if (idx === -1) return
        list.splice(idx,1)
        return await this._persistMarkedGroupIds(list,outputWrapper)
    }
    async _persistMarkedGroupIds(list:IMUserMarkedGroupId[],outputWrapper?:BasicOutputWrapper){
        const tag = `0x${Converter.utf8ToHex(GROUPFIMARKTAG)}`
        const data = serializeUserMarkedGroupIds(list)
        const basicOutput = await this._dataAndTagToBasicOutput(data,tag)
        const toBeConsumed = outputWrapper ? [outputWrapper] : []
        return await this._sendBasicOutput(basicOutput,toBeConsumed);
    }
    async _getMarkedGroupIds():Promise<{outputWrapper?:BasicOutputWrapper, list:IMUserMarkedGroupId[]}>{
        const existing = await this._getOneOutputWithTag(GROUPFIMARKTAG)
        console.log('_getMarkedGroupIds existing', existing);
        if (!existing) return {list:[]}
        const {output} = existing
        const meta = output.features?.find(feature=>feature.type === 2) as IMetadataFeature
        if (!meta) return {list:[]}
        const data = Converter.hexToBytes(meta.data)
        const groupIds = deserializeUserMarkedGroupIds(data)
        return {outputWrapper:existing,list:groupIds}
    }

    async _dataAndTagToBasicOutput(data:Uint8Array,tag:string):Promise<IBasicOutput>{
        const tagFeature: ITagFeature = {
            type: 3,
            tag
        };
        const metadataFeature: IMetadataFeature = {
            type: 2,
            data: Converter.bytesToHex(data, true)
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

    async muteGroupMember(groupId:string,addrSha256Hash:string){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {outputWrapper,list} = await this._getUserMuteGroupMembers()
        if (list.find(id=>id.groupId === groupId && id.addrSha256Hash === addrSha256Hash)) return
        list.push({groupId,addrSha256Hash})
        return await this._persistUserMuteGroupMembers(list,outputWrapper)
    }
    async unmuteGroupMember(groupId:string,addrSha256Hash:string){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {outputWrapper,list} = await this._getUserMuteGroupMembers()
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
        return await this._sendBasicOutput(basicOutput,toBeConsumed);
    }

    async _getUserMuteGroupMembers():Promise<{outputWrapper?:BasicOutputWrapper, list:IMUserMuteGroupMember[]}>{
        const existing = await this._getOneOutputWithTag(GROUPFIMUTETAG)
        if (!existing) return {list:[]}
        const {output} = existing
        const meta = output.features?.find(feature=>feature.type === 2) as IMetadataFeature
        if (!meta) return {list:[]}
        const data = Converter.hexToBytes(meta.data)
        const groupIds = deserializeUserMuteGroupMembers(data)
        return {outputWrapper:existing,list:groupIds}
    }
    async getAllUserMuteGroupMembers(){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {list} = await this._getUserMuteGroupMembers()
        return list
    }
    // get group votes
    async getAllGroupVotes(){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {outputWrapper,list} = await this._getUserVoteGroups()
        return list
    }
    async voteGroup(groupId:string, vote:number){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {outputWrapper,list} = await this._getUserVoteGroups()
        const existing = list.find(id=>id.groupId === groupId)
        if (existing) {
            if (existing.vote === vote) return
            existing.vote = vote
        } else {
            list.push({groupId,vote})
        }
        return await this._persistUserVoteGroups(list,outputWrapper)
    }

    async unvoteGroup(groupId:string){
        this._ensureClientInited()
        this._ensureWalletInited()
        const {outputWrapper,list} = await this._getUserVoteGroups()
        const idx = list.findIndex(id=>id.groupId === groupId)
        if (idx === -1) return
        list.splice(idx,1)
        return await this._persistUserVoteGroups(list,outputWrapper)
    }

    async _persistUserVoteGroups(list:IMUserVoteGroup[],outputWrapper?:BasicOutputWrapper){
        const tag = `0x${Converter.utf8ToHex(GROUPFIVOTETAG)}`
        const data = serializeUserVoteGroups(list)
        const basicOutput = await this._dataAndTagToBasicOutput(data,tag)
        const toBeConsumed = outputWrapper ? [outputWrapper] : []
        return await this._sendBasicOutput(basicOutput,toBeConsumed);
    }
    async _getUserVoteGroups():Promise<{outputWrapper?:BasicOutputWrapper, list:IMUserVoteGroup[]}>{
        const existing = await this._getOneOutputWithTag(GROUPFIVOTETAG)
        if (!existing) return {list:[]}
        const {output} = existing
        const meta = output.features?.find(feature=>feature.type === 2) as IMetadataFeature
        if (!meta) return {list:[]}
        const data = Converter.hexToBytes(meta.data)
        const groupIds = deserializeUserVoteGroups(data)
        return {outputWrapper:existing,list:groupIds}
    }
}

const instance = new IotaCatClient()
export default instance