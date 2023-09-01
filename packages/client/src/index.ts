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
    REFERENCE_UNLOCK_TYPE
} from "@iota/iota.js";
import { Converter, WriteStream,  } from "@iota/util.js";
import { encrypt, decrypt, getEphemeralSecretAndPublicKey, util, setCryptoJS, setHkdf, setIotaCrypto, EncryptedPayload, decryptOneOfList, EncryptingPayload, encryptPayloadList } from 'ecies-ed25519-js';
import bigInt from "big-integer";
import { IMMessage, IotaCatSDKObj, IOTACATTAG, IOTACATSHAREDTAG, makeLRUCache,LRUCache, cacheGet, cachePut, MessageAuthSchemeRecipeintOnChain, MessageAuthSchemeRecipeintInMessage, INX_GROUPFI_DOMAIN } from "iotacat-sdk-core";
import {runBatch, formatUrlParams} from 'iotacat-sdk-utils';

//TODO tune concurrency
const httpCallLimit = 5;
const consolidateBatchSize = 29;
setIotaCrypto({
    Bip39,
    Ed25519,
    Sha512
})
import CryptoJS from 'crypto-js';
import hkdf from 'js-crypto-hkdf';
import { IMRecipient } from "iotacat-sdk-core";
import { EventEmitter } from 'events';
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
type MessageBody = {
    sender:string,
    message:string,
    timestamp:number
}
type NftItemReponse = {
    ownerAddress: string;
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
    apiUrl: "https://test.shimmer.node.tanglepay.com",
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

    async setHexSeed(hexSeed:string){
        this._ensureClientInited()
        if (this._hexSeed == hexSeed) return
        this._hexSeed = hexSeed
        console.log('HexSeed', hexSeed);
        const baseSeed = this._hexSeedToEd25519Seed(hexSeed);
        console.log('BaseSeed', baseSeed);
        this._walletKeyPair = this._getPair(baseSeed)
        console.log('WalletKeyPair', this._walletKeyPair);
        const genesisEd25519Address = new Ed25519Address(this._walletKeyPair.publicKey);
        console.log('GenesisEd25519Address', genesisEd25519Address);
        const genesisWalletAddress = genesisEd25519Address.toAddress();
        console.log('GenesisWalletAddress', genesisWalletAddress);   
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

    async _getAddressListForGroupFromInxApi(groupId:string):Promise<string[]>{
        //TODO try inx plugin 
        try {
            const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/nfts?groupId=0x${groupId}`
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
            return data.map(item=>item.ownerAddress)
        } catch (error) {
            console.log('_getAddressListForGroupFromInxApi error',error)
        }
        return []
    }
    async _getSharedOutputIdForGroupFromInxApi(groupId:string):Promise<{outputId:string}|undefined>{
        const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiIxMkQzS29vV0RqdnFSRFNHYzJKeE0xZ3U5aEJ6RFVORUZhaGhwZXBGcFVUaUhEYkF0Tm15IiwianRpIjoiMTY5MDk0NDk4MiIsImlhdCI6MTY5MDk0NDk4MiwiaXNzIjoiMTJEM0tvb1dEanZxUkRTR2MySnhNMWd1OWhCekRVTkVGYWhocGVwRnBVVGlIRGJBdE5teSIsIm5iZiI6MTY5MDk0NDk4Miwic3ViIjoiSE9STkVUIn0.suSlg42-9svWgh-4tCWIFgX3o-NXz_mYdLAUUN6opCM'
        try {
            const url = `https://${INX_GROUPFI_DOMAIN}/api/groupfi/v1/shared?groupId=0x${groupId}`
            try {
            // @ts-ignore
            const res = await fetch(url,{
                method:'GET',
                headers:{
                'Content-Type':'application/json',
                "Authorization":`Bearer ${jwtToken}`
                }})
                const data = await res.json() as {outputId:string}
                return data
            } catch (error) {
                console.log('error',error)
            }
            
        } catch (error) {
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
        const res = await this._getSharedOutputIdForGroupFromInxApi(groupId)
        if (!res) {
            await this._makeSharedOutputForGroup(groupId)
        }
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
        const bech32AddrArr = await this._getAddressListForGroupFromInxApi(groupId)
        // TODO remove commented test code
        /*
        if (!bech32AddrArr.includes(this._accountBech32Address!)) {
            bech32AddrArr.push(this._accountBech32Address!)
        }
        */
        const recipients = await this._bech32AddrArrToRecipients(bech32AddrArr)
        console.log('_makeSharedOutputForGroup recipients', recipients);
        const salt = IotaCatSDKObj._generateRandomStr(32)
        //TODO remove
        console.log('shared salt', salt);
        const payloadList:EncryptingPayload[] = recipients.map((pair)=>({addr:pair.addr,publicKey:Converter.hexToBytes(pair.mkey), content:salt}))

        const encryptedPayloadList:EncryptedPayload[] = await encryptPayloadList({payloadList,tag})
        const preparedRecipients:IMRecipient[] = encryptedPayloadList.map((payload)=>({addr:payload.addr,mkey:Converter.bytesToHex(payload.payload)}))
        
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
            const {sender, message} = await this.getMessageFromMetafeaturepayloadAndSender({data,senderAddressBytes,address})
            return { sender , message }
        } catch(e) {
            console.log(`getMessageFromOutputId:${outputId}`);
        }
    }
    // getMessageFromMetafeaturepayloadandsender
    async getMessageFromMetafeaturepayloadAndSender({data,senderAddressBytes,address}:{data:Uint8Array|string,senderAddressBytes:Uint8Array|string,address:string}):Promise<{sender:string,message:IMMessage}>{
        const data_ = typeof data === 'string' ? Converter.hexToBytes(data) : data
        const senderAddressBytes_ = typeof senderAddressBytes === 'string' ? Converter.hexToBytes(senderAddressBytes) : senderAddressBytes
        console.log('getMessageFromMetafeaturepayloadAndSender', data_, senderAddressBytes_, address);
        const sender = Bech32Helper.toBech32(ED25519_ADDRESS_TYPE, senderAddressBytes_, this._nodeInfo!.protocol.bech32Hrp);
        const message = await IotaCatSDKObj.deserializeMessage(data_, address, {decryptUsingPrivateKey:async (data:Uint8Array)=>{
            const decrypted = await decrypt(this._walletKeyPair!.privateKey, data, tag)
            return decrypted.payload
        },sharedOutputSaltResolver:async (sharedOutputId:string)=>{
            const {salt} = await this._getSaltFromSharedOutputId(sharedOutputId,address)
            return salt
        }})
        return {sender,message}
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
        return res
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
        return res
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
        return {outputs,nextCursor}
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
        return bigInt(deposit).multiply(bigInt('2'))
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
        try {
            const protocolInfo = await this._client!.protocolInfo();
            console.log('ProtocolInfo', protocolInfo);


            const groupSaltMap:Record<string,string> = {}
            if (message.authScheme == MessageAuthSchemeRecipeintInMessage) {
                const recipientAddresses = await this._getAddressListForGroupFromInxApi(groupId)
                //TODO for demo add senderAddr if not exist

                if (!recipientAddresses.includes(senderAddr)) {
                    recipientAddresses.push(senderAddr)
                    //return undefined
                }


                message.recipients = recipientAddresses.map(addr=>({addr,mkey:''}))
            
                const bech32AddrArr = message.recipients.map(recipient=>recipient.addr)
                message.recipients = await this._bech32AddrArrToRecipients(bech32AddrArr)
            } else {
                // get shared output
                const {salt, outputId} = await this._getSaltForGroup(groupId,senderAddr)
                message.recipientOutputid = outputId
                groupSaltMap[groupId] = salt
            }
            console.log('MessageWithPublicKeys', message);
            const pl = await IotaCatSDKObj.serializeMessage(message,{encryptUsingPublicKey:async (key,data)=>{
                const publicKey = Converter.hexToBytes(key)
                const encrypted = await encrypt(publicKey, data, tag)
                return encrypted.payload
            },groupSaltResolver:async (groupId:string)=>groupSaltMap[groupId]})
            console.log('MessagePayload', pl);
            
            const tagFeature: ITagFeature = {
                type: 3,
                tag: `0x${Converter.utf8ToHex(IOTACATTAG)}`
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
                    }
                ],
                features: [
                    metadataFeature,
                    tagFeature
                ]
            };
            console.log("Basic Output: ", basicOutput);

            
            const {blockId,outputId} = await this._sendBasicOutput(basicOutput);
            return blockId
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
    async _sendBasicOutput(basicOutput:IBasicOutput){
        const amountToSend = this._getAmount(basicOutput)
        console.log('AmountToSend', amountToSend);
        basicOutput.amount = amountToSend.toString()
        // get first output with amount > amountToSend

        const threshold = amountToSend.multiply(2)
        const outputs = await this._getUnSpentOutputs({amountLargerThan:threshold,numbersWanted:1})
        console.log('unspent Outputs', outputs);
        
        const consumedOutputWrapper = outputs.find(output=>bigInt(output.output.amount).greater(threshold))
        if (!consumedOutputWrapper ) throw new Error('No output with enough amount')
        const {output:consumedOutput, outputId:consumedOutputId}  = consumedOutputWrapper
        console.log('ConsumedOutput', consumedOutput);
        const remainderBasicOutput: IBasicOutput = {
            type: BASIC_OUTPUT_TYPE,
            amount: bigInt(consumedOutput.amount).minus(amountToSend).toString(),
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
        console.log("Remainder Basic Output: ", remainderBasicOutput);
        return await this._sendTransactionWithConsumedOutputsAndCreatedOutputs([{outputId:consumedOutputId,output:consumedOutput}], [basicOutput,remainderBasicOutput])
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
        const outputId = Converter.bytesToHex(TransactionHelper.getTransactionPayloadHash(transactionPayload), true) + "0000";
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
    async _messageResponseToMesssageListAndTokens(response:MessageResponse, address:string):Promise<{messageList:MessageBody[],headToken?:string,  tailToken?:string}>{
        const messages = response.messages
        const messagePayloads = await Promise.all(messages.map(msg => this.getMessageFromOutputId(msg.outputId,address)))
        const messageBodyArr:(MessageBody|undefined)[] = messagePayloads.map((payload,index)=>{
            if (!payload) return undefined;
            return {
            timestamp:messages[index].timestamp,
            message:payload.message.data[0]??'',
            sender:payload.sender
            }
        })
        const filterdMessageBodyArr = messageBodyArr.filter(msg=>msg!=undefined) as MessageBody[]
        return {messageList:filterdMessageBodyArr,headToken:response.headToken, tailToken:response.tailToken}
    }
}

const instance = new IotaCatClient()
export default instance