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
    TIMELOCK_UNLOCK_CONDITION_TYPE,
    INftOutput,
    OutputTypes,
    NFT_OUTPUT_TYPE
} from "@iota/iota.js";
import { Converter, WriteStream } from "@iota/util.js";
import { encrypt, decrypt, getEphemeralSecretAndPublicKey, util, setCryptoJS, setHkdf, setIotaCrypto, EncryptedPayload, decryptOneOfList, EncryptingPayload, encryptPayloadList } from 'ecies-ed25519-js';
import bigInt from "big-integer";
import { IMMessage, IotaCatSDKObj, IOTACATTAG, IOTACATSHAREDTAG, makeLRUCache,LRUCache, cacheGet, cachePut, MessageAuthSchemeRecipeintOnChain, MessageAuthSchemeRecipeintInMessage, INX_GROUPFI_DOMAIN, 
    EncryptedHexPayload

} from "iotacat-sdk-core";
import {runBatch, formatUrlParams, getCurrentEpochInSeconds, getAllNftOutputs, getAllBasicOutputs} from 'iotacat-sdk-utils';

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
import { ImInboxEventTypeNewMessage } from 'iotacat-sdk-core';
import { EventGroupMemberChanged } from 'iotacat-sdk-core';
import { ImInboxEventTypeGroupMemberChanged } from 'iotacat-sdk-core';
import { GROUPFISELFPUBLICKEYTAG } from 'iotacat-sdk-core';
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
    apiUrl: "https://test.api.iotacat.com",
    explorerApiUrl: "https://explorer-api.shimmer.network/stardust",
    explorerApiNetwork: "testnet",
    networkId: "1856588631910923207",
    inxMqttEndpoint: "wss://test.shimmer.node.tanglepay.com/mqtt",
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
class GroupfiWalletEmbedded {
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
    _networkId?:string;
    _events:EventEmitter = new EventEmitter();
    //TODO simple cache
    _saltCache:Record<string,string> = {};

    async setup(provider?:Constructor<IPowProvider>,...rest:any[]){
        if (this._curNode) return
        // @ts-ignore
        const id = parseInt(process.env.NODE_ID,10)
        const node = nodes.find(node=>node.id === id)
        if (!node) throw new Error('Node not found')
        this._curNode = node
        // @ts-ignore
        this._client = provider ? new SingleNodeClient(node.apiUrl, {powProvider: new provider(...rest)}) : new SingleNodeClient(node.apiUrl)
        this._indexer = new IndexerPluginClient(this._client)
        this._nodeInfo = await this._client.info();
        this._protocolInfo = await this._client.protocolInfo();
        this._networkId = TransactionHelper.networkIdFromNetworkName(this._protocolInfo!.networkName)
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

    async decryptAesKeyFromRecipientsWithPayload(idx:number,recipientsWithPayload:EncryptedHexPayload[]):Promise<string>{
        const payload = recipientsWithPayload.map(o=>IotaCatSDKObj.encryptedHexPayloadToEncryptedPayload(o))
        const decrypted = await decryptOneOfList({receiverSecret:this._walletKeyPair!.privateKey,
            payloadList:payload,tag,idx})
        let salt
        if(decrypted) {
            salt = decrypted.payload
        }
        if (!salt) throw IotaCatSDKObj.makeErrorForSaltNotFound()
        return salt
    }
    // check address unlock condition is to self
    _isAddressUnlockConditionToSelf(addressUnlockCondition:IAddressUnlockCondition){
        if (!addressUnlockCondition) return false
        const address = addressUnlockCondition.address;
        if (!address || address.type !== ED25519_ADDRESS_TYPE) return false
        const ed25519Address = address as IEd25519Address;
        if (IotaCatSDKObj._addHexPrefixIfAbsent(ed25519Address.pubKeyHash) === this._accountHexAddress) return true
        return false
    }
    // check if transactionEssence is sending to self
    _isTransactionEssenceSendingToSelf(transactionEssence:ITransactionEssence):boolean{
        let isHasGroupfiTag = false
        // loop through all outputs
        for (const output of transactionEssence.outputs){
            // output should be basic output or nft
            if (output.type == BASIC_OUTPUT_TYPE) {
                const basicOutput = output as IBasicOutput
                // check if address is the same as self
                const addressUnlockcondition = basicOutput.unlockConditions.find(unlockCondition=>unlockCondition.type === 0) as IAddressUnlockCondition
                const isToSelf = this._isAddressUnlockConditionToSelf(addressUnlockcondition)
                if (!isToSelf) return false;
                const tagFeature = basicOutput.features?.find(feature=>feature.type === 3) as ITagFeature
                if (tagFeature) {
                    const tagUtf8 = Converter.hexToUtf8(tagFeature.tag)
                    // if starts with GROUPFI
                    if (tagUtf8.startsWith('GROUPFI')) {
                        isHasGroupfiTag = true
                    }
                }
            } else if (output.type == NFT_OUTPUT_TYPE) {
                const nftOutput = output as INftOutput
                // check if address is the same as self
                const addressUnlockcondition = nftOutput.unlockConditions.find(unlockCondition=>unlockCondition.type === 0) as IAddressUnlockCondition
                const isToSelf = this._isAddressUnlockConditionToSelf(addressUnlockcondition)
                if (!isToSelf) return false;
            } else {
                return false
            }
        }
        if (!isHasGroupfiTag) return false
        return true;
    }
    async signAndSendTransactionToSelf(transactionEssence: ITransactionEssence){
        this._ensureClientInited()
        const isSendingToSelf = this._isTransactionEssenceSendingToSelf(transactionEssence)
        if (!isSendingToSelf) throw new Error('Transaction not sending to self')
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

        for (let i = 0; i < transactionEssence.inputs.length; i++) {
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
        const {outputId,transactionId,remainderOutputId} = this.getMetadataFromTransactionPayload(transactionPayload)
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
            return {blockId,outputId,transactionId,remainderOutputId}
        } catch (e) {
            console.log("Error submitting block: ", e);
            throw e
        }
    }
    /*helperContext:{SingleNodeClient:SingleNodeClient,IndexerPluginClient:IndexerPluginClient, bech32Address:string }*/
    // _getHelperContext
    _getHelperContext(){
        this._ensureClientInited()
        this._ensureWalletInited()
        const helperContext = {SingleNodeClient:this._client!,IndexerPluginClient:this._indexer!, bech32Address:this._accountBech32Address! }
        return helperContext
    }
    
    getTransactionPayloadHash(transactionPayload:ITransactionPayload){

        return Converter.bytesToHex(TransactionHelper.getTransactionPayloadHash(transactionPayload), true)
    }
    getOutputIdFromTransactionPayloadHashAndIndex(transactionPayloadHash:string,index:number){
        return TransactionHelper.outputIdFromTransactionData( transactionPayloadHash, index)
    }

    getMetadataFromTransactionPayload(transactionPayload:ITransactionPayload){
        const transactionId = TransactionHelper.transactionIdFromTransactionPayload(transactionPayload)
        const transactionPayloadHash = this.getTransactionPayloadHash(transactionPayload)
        const messageOutputId = this.getOutputIdFromTransactionPayloadHashAndIndex(transactionPayloadHash,0)
        // if output size is > 1, then last output is remainder output, get outputId from last output
        let remainderOutputId:string|undefined
        if (transactionPayload.essence.outputs.length > 1) {
            remainderOutputId = this.getOutputIdFromTransactionPayloadHashAndIndex(transactionPayloadHash,transactionPayload.essence.outputs.length-1)
        }
        return {transactionId,outputId:messageOutputId,remainderOutputId}
    }



    tpGetKeyAndIvV2(password:string) {
        // @ts-ignore
        const md5 = CryptoJS.MD5(password, 16).toString()
        const kdf1 = CryptoJS.PBKDF2(md5, md5, { keySize: 16, iterations: 1000 })
        const kdf2 = CryptoJS.PBKDF2(kdf1.toString(), kdf1.toString(), { keySize: 16, iterations: 1000 })
        return [kdf1, kdf2]
    }
    tpGetKeyAndIv(password:string) {
        // @ts-ignore
        let key = CryptoJS.MD5(password, 16).toString().toLocaleUpperCase()
        let iv = CryptoJS.MD5(password.slice(0, parseInt('' + (password.length / 2))))
            .toString()
            .toLocaleUpperCase()
        const keyArray = CryptoJS.enc.Utf8.parse(key)
        const ivArray = CryptoJS.enc.Utf8.parse(iv)
        return [keyArray, ivArray]
    }
    tpDecrypt(seed:string, password:string, forceV2 = false){
        const V2_FLAG = 'TanglePayV2'
        const reg = new RegExp(`${V2_FLAG}$`)
        let isV2 = reg.test(seed) || forceV2 ? true : false
        seed = seed.replace(reg, '')
        const [key, iv] = isV2 ? this.tpGetKeyAndIvV2(password) : this.tpGetKeyAndIv(password)
        let encryptedHexStr = CryptoJS.enc.Hex.parse(seed)
        let srcs = CryptoJS.enc.Base64.stringify(encryptedHexStr)
        let decrypt = CryptoJS.AES.decrypt(srcs, key, { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 })
        let decryptedStr = decrypt.toString(CryptoJS.enc.Utf8)
        return decryptedStr.toString()
    }
}

const instance = new GroupfiWalletEmbedded()
export default instance