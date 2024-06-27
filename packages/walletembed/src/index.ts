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
    NFT_OUTPUT_TYPE,
    ClientError,
    deserializeTransactionEssence
} from "@iota/iota.js";
import { Converter, ReadStream, WriteStream } from "@iota/util.js";
import { encrypt, decrypt, getEphemeralSecretAndPublicKey, util, setCryptoJS, setHkdf, setIotaCrypto, EncryptedPayload, decryptOneOfList, EncryptingPayload, encryptPayloadList } from 'ecies-ed25519-js';
import bigInt from "big-integer";
import { IMMessage, IotaCatSDKObj, IOTACATTAG, IOTACATSHAREDTAG, makeLRUCache,LRUCache, cacheGet, cachePut, MessageAuthSchemeRecipeintOnChain, MessageAuthSchemeRecipeintInMessage, INX_GROUPFI_DOMAIN, 
    EncryptedHexPayload

} from "iotacat-sdk-core";
import {addToMap, mapsEqual,retrieveUint8ArrayFromBlobURL, EthDecrypt, tpEncrypt, tpDecrypt} from 'iotacat-sdk-utils';

import { hdkey, Wallet } from '@ethereumjs/wallet'
import { hashPersonalMessage, ecsign, toRpcSig } from '@ethereumjs/util'
import tweetnacl from 'tweetnacl'
import naclUtil from 'tweetnacl-util'

//TODO tune concurrency
const httpCallLimit = 5;
const consolidateBatchSize = 29;
setIotaCrypto({
    Bip39,
    Ed25519,
    Sha512
})

import hkdf from 'js-crypto-hkdf';
import { EventEmitter } from 'events';
import { ImInboxEventTypeNewMessage } from 'iotacat-sdk-core';
import { EventGroupMemberChanged } from 'iotacat-sdk-core';
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
    apiUrl: "https://mainnet.shimmer.node.tanglepay.com",
    explorerApiUrl: "https://explorer-api.shimmer.network/stardust",
    explorerApiNetwork: "testnet",
    networkId: "1856588631910923207",
    inxMqttEndpoint: "wss://test.shimmer.node.tanglepay.com/mqtt",
}

const shimmerMainNet = {
    id: 102,
    isFaucetAvailable: false,
    apiUrl: "https://prerelease.api.iotacat.com",
    explorerApiUrl: "https://explorer-api.shimmer.network/stardust",
    explorerApiNetwork: "shimmer",
    networkId: "14364762045254553490",
    inxMqttEndpoint: "wss://test.api.iotacat.com/api/iotacatmqtt/v1",
}
const nodes = [
    shimmerTestNet,
    shimmerMainNet
]
class GroupfiWalletEmbedded {
    _client?: SingleNodeClient;
    _indexer?: IndexerPluginClient;
    _nodeInfo?: INodeInfo;
    _protocolInfo?: INodeInfoProtocol;
    // _baseSeed?: Ed25519Seed;
    // _walletKeyPair?: IKeyPair;
    // _accountHexAddress?:string;
    // _accountBech32Address?:string;
    _pubKeyCache?:LRUCache<string>;
    _storage?:StorageFacade;
    // _hexSeed?:string;
    _networkId?:string;
    _events:EventEmitter = new EventEmitter();
    //TODO simple cache
    _saltCache:Record<string,string> = {};
    _currentNodeUrl?:string;


    _SMRAccount: {
        _baseSeed?: Ed25519Seed;
        _walletKeyPair?: IKeyPair;
        _accountHexAddress?:string;
        _accountBech32Address?:string;
        _hexSeed?:string;
    } = {}

    _EVMAccount: {
        _wallet?: Wallet,
        _hexAddress?: string
    } = {}

    setEVMAccount(hexSeed: string, password: string, rawPath?: string) {
        try {
            let wallet: Wallet | undefined = undefined
            // When An EVM account imported through a private key
            // the hexSeed is composed of the private key and a password
            let hexPassword = Converter.utf8ToHex(password, false)
            if (hexPassword.length % 2) {
                hexPassword += '0'
            }
            const regexp = new RegExp(hexPassword + '$')
            if (regexp.test(hexSeed)) {
                const hexPrivateKey = '0x' + hexSeed.replace(regexp, '')
                const privateKeyBytes = Converter.hexToBytes(hexPrivateKey)
                wallet = Wallet.fromPrivateKey(privateKeyBytes)
            } else {
                const uint8arr = Converter.hexToBytes(hexSeed)
                const hdwallet = hdkey.EthereumHDKey.fromMasterSeed(uint8arr);
                const path = rawPath ?? "m/44'/60'/0'/0/0" 
                wallet = hdwallet.derivePath(path).getWallet();
            }
            console.log("setEVMAccount wallet", wallet)
            this._EVMAccount._wallet = wallet
            this._EVMAccount._hexAddress = wallet.getChecksumAddressString()
            console.log('===> setEVMAccount _hexAddress', this._EVMAccount)

            console.log('private Key uint8Array', this._EVMAccount._wallet!.getPrivateKey())
            console.log('private Key str', this._EVMAccount._wallet!.getPrivateKeyString())

            const smrBaseSeed = new Ed25519Seed(this._EVMAccount._wallet!.getPrivateKey())
            this._setSMRProxyAccount(smrBaseSeed)
        } catch(error) {
            console.log('===>setEVMAccount error ', error)
        }
    }

    getSMRProxyAccount() {
        if (!this._SMRAccount._accountBech32Address) {
            throw new Error('proxy account is undefined')
        }
        return  {
            bech32Address: this._SMRAccount._accountBech32Address,
            hexAddress: this._SMRAccount._accountHexAddress
        }
    }


    importSMRProxyAccount(password: string) {
        // if (this._EVMAccount._wallet === undefined) {
        //     throw new Error('Evm account wallet is undefined.')
        // }
        // // Generate SMR seed from EVM private key
        // const smrBaseSeed = new Ed25519Seed(this._EVMAccount._wallet!.getPrivateKey())
        
        // // Set SMR account baseSeed
        // this._setSMRProxyAccount(smrBaseSeed)
        if (!this._SMRAccount._baseSeed) {
            throw new Error('smr baseSeed is undefined.')
        }
        
        const hexSeed = Converter.bytesToHex(this._SMRAccount._baseSeed.toBytes())
        return {
            path: 0,
            password,
            address: this._SMRAccount._accountBech32Address,
            seed: tpEncrypt(hexSeed, password),
            publicKey: Converter.bytesToHex(this._SMRAccount._walletKeyPair!.publicKey, true)
        }
    }

    _setSMRProxyAccount(baseSeed: Ed25519Seed) {
        this._SMRAccount._baseSeed = baseSeed
        // Set SMR account additional info
        const path = 0
        this.switchAddressUsingPath(path)
    }

    async setSMRAccount(seed: string, rawPath?: number) {
        await this.setHexSeed(seed)
        this.switchAddressUsingPath(rawPath)
    }

    async setup(nodeUrlHint?:string){
        if (this._currentNodeUrl && (!nodeUrlHint || nodeUrlHint === this._currentNodeUrl)) return
        if (!nodeUrlHint) {
            const id = parseInt(process.env.NODE_ID??'0',10)
            const node = nodes.find(node=>node.id === id)
            if (!node) throw new Error('Node not found')
            nodeUrlHint = node.apiUrl
        }
        this._client = new SingleNodeClient(nodeUrlHint)
        this._currentNodeUrl = nodeUrlHint
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
        const accountObj = this._SMRAccount
        this._ensureClientInited()
        if (accountObj._hexSeed == hexSeed) return
        accountObj._hexSeed = hexSeed
        const baseSeed = this._hexSeedToEd25519Seed(hexSeed);
        accountObj._baseSeed = baseSeed;
    }
    switchAddressUsingPath(rawPath?:number){
        const path = rawPath??0
        const accountObj = this._SMRAccount
        const pair = this._getPair(accountObj._baseSeed!,path)
        this.setupPair(pair)
        // log path and hex address and bech32 address, in one line, start with 4 # symbols
        console.log(`#### Wallet Index ${path} Hex Address ${accountObj._accountHexAddress} Bech32 Address ${accountObj._accountBech32Address}`)
    }
    setupPair(pair:IKeyPair){
        const accountObj = this._SMRAccount
        accountObj._walletKeyPair = pair
        const genesisEd25519Address = new Ed25519Address(accountObj._walletKeyPair.publicKey);
        const genesisWalletAddress = genesisEd25519Address.toAddress();
        accountObj._accountHexAddress = Converter.bytesToHex(genesisWalletAddress, true);
        accountObj._accountBech32Address = Bech32Helper.toBech32(ED25519_ADDRESS_TYPE, genesisWalletAddress, this._nodeInfo!.protocol.bech32Hrp);
    }
    _getPair(baseSeed:Ed25519Seed, idx:number){
        const addressGeneratorAccountState = {
            accountIndex: idx,
            addressIndex: 0,
            isInternal: false
        };
        const path = generateBip44Address(addressGeneratorAccountState,COIN_TYPE_SHIMMER);

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
        if (!this._SMRAccount._walletKeyPair) throw new Error('Wallet not initialized')
    }
    _ensureStorageInited(){
        if (!this._storage) throw new Error('Storage not initialized')
    }

    async decryptAesKeyFromRecipientsWithPayload(recipientPayloadUrl:string):Promise<string>{
        
        const payload = await retrieveUint8ArrayFromBlobURL(recipientPayloadUrl);
        return await this.decryptAesKeyFromPayload(payload)
    }
    // decryptAesKeyFromPayload
    async decryptAesKeyFromPayload(payload:Uint8Array):Promise<string>{
        const list = [{payload}]
        const decrypted = await decryptOneOfList({receiverSecret:this._SMRAccount._walletKeyPair!.privateKey,
            payloadList:list,tag,idx:0})
        let salt
        if(decrypted) {
            salt = decrypted.payload
        }
        if (!salt) throw IotaCatSDKObj.makeErrorForSaltNotFound()
        return salt
    }
    getEd25519PublicKey(){
        return Converter.bytesToHex(this._SMRAccount._walletKeyPair!.publicKey, true)
    }
    ed25519SignMessage(message:string){
        const payload = Converter.utf8ToBytes(message)
        // const signature = Ed25519.sign(payload, this._SMRAccount._walletKeyPair!.privateKey)
        const signature = Ed25519.sign(this._SMRAccount._walletKeyPair!.privateKey, payload)
        return Converter.bytesToHex(signature)
    }
    // check address unlock condition is to self
    _isAddressUnlockConditionToSelf(addressUnlockCondition:IAddressUnlockCondition){
        if (!addressUnlockCondition) return false
        const address = addressUnlockCondition.address;
        if (!address || address.type !== ED25519_ADDRESS_TYPE) return false
        const ed25519Address = address as IEd25519Address;
        if (IotaCatSDKObj._addHexPrefixIfAbsent(ed25519Address.pubKeyHash) === this._SMRAccount._accountHexAddress) return true
        // log not self unlock condition
        console.log('Not self unlock condition',addressUnlockCondition,this._SMRAccount._accountHexAddress)
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
                // It is possible for NFT outputs to carry a "GROUPFI-" tag, such as the PairX nft output
                const tagFeature = nftOutput.features?.find(feature=>feature.type === 3) as ITagFeature
                if (tagFeature) {
                    const tagUtf8 = Converter.hexToUtf8(tagFeature.tag)
                    // if starts with GROUPFI
                    if (tagUtf8.startsWith('GROUPFI')) {
                        isHasGroupfiTag = true
                    }
                }
            } else {
                return false
            }
        }
        if (!isHasGroupfiTag) return false
        return true;
    }

    // check transaction essence, input, output asset match
    _isTransactionEssenceInputOutputAssetMatch(inputsOutputMap:Record<string,OutputTypes>,transactionEssence:ITransactionEssence){
        const cashKey = 'CASHKEY'
        const inputsAssetMap:{[key:string]:bigInt.BigInteger} = {}
        const outputsAssetMap:{[key:string]:bigInt.BigInteger} = {}
        // loop through all inputs
        for (const input of transactionEssence.inputs){
            // input should be utxo input
            if (input.type == 0) {
                const utxoInput = input as IUTXOInput
                // compute outputId from input
                const outputId = TransactionHelper.outputIdFromTransactionData(utxoInput.transactionId, utxoInput.transactionOutputIndex)
                const output = inputsOutputMap[outputId]
                if (!output) throw new Error(`inputs output not found for outputId ${outputId}`)
                // only handle basic output
                if (output.type == BASIC_OUTPUT_TYPE) {
                    const basicOutput = output as IBasicOutput
                    // handle cash
                    const cashAmount = basicOutput.amount
                    addToMap(inputsAssetMap,cashKey,cashAmount)
                    // handle token
                    const tokens = basicOutput.nativeTokens ??[]
                    for (const token of tokens) {
                        const tokenId = token.id
                        const amount = token.amount
                        addToMap(inputsAssetMap,tokenId,amount)
                    }
                } else {
                    throw new Error(`inputs output not basic output for outputId ${outputId}`)
                }
            } else {
                throw new Error('inputs not utxo input')
            }
        }
        // loop through all outputs
        for (const output of transactionEssence.outputs){
            // output should be basic output or nft
            if (output.type == BASIC_OUTPUT_TYPE) {
                const basicOutput = output as IBasicOutput
                // handle cash
                const cashAmount = basicOutput.amount
                addToMap(outputsAssetMap,cashKey,cashAmount)
                // handle token
                const tokens = basicOutput.nativeTokens ??[]
                for (const token of tokens) {
                    const tokenId = token.id
                    const amount = token.amount
                    addToMap(outputsAssetMap,tokenId,amount)
                }
            } else if(output.type === NFT_OUTPUT_TYPE) {
                const nftOutput = output as INftOutput
                const cashAmount = nftOutput.amount
                addToMap(outputsAssetMap, cashKey, cashAmount)
            }else {
                // throw new Error('outputs not basic output')
                throw new Error('outputs not basic output or nft output')
            }
        }
        // check inputs and outputs asset match
        if (!mapsEqual(inputsAssetMap,outputsAssetMap)) throw new Error('inputs and outputs not match, asset not match')
        return true
    }
    async signAndSendTransactionToSelf({transactionEssenceUrl}:{transactionEssenceUrl: string}):Promise<{blockId:string,outputId:string,transactionId:string,remainderOutputId?:string}>{
        console.log('===> Enter walletembed signAndSendTransactionToSelf')
        this._ensureClientInited()
        const payload = await retrieveUint8ArrayFromBlobURL(transactionEssenceUrl);
        const rs = new ReadStream(payload);
        const transactionEssence = deserializeTransactionEssence(rs)
        console.log('===> Enter walletembed transactionEssence', transactionEssence)
        const isSendingToSelf = this._isTransactionEssenceSendingToSelf(transactionEssence)
        if (!isSendingToSelf) {
            // log
            console.log('Transaction not sending to self')
            throw new Error('Transaction not sending to self')
        }
        // check inputs and outputs asset match
        const inputsOutputMap:Record<string,OutputTypes> = {}
        // loop through all inputs
        const tasks:Promise<void>[] = []
        let bypassInputOutputAssetMatch = false
        for (const input of transactionEssence.inputs){
            const inputOutputId = TransactionHelper.outputIdFromTransactionData(input.transactionId, input.transactionOutputIndex)
            tasks.push((async ()=>{
                try {
                    const output = await this._client!.output(inputOutputId)
                    inputsOutputMap[inputOutputId] = output.output
                } catch (e) {
                    if (e instanceof ClientError) {
                        if (e.httpStatus === 404) {
                            // log output not found, might be fast sending
                            console.log(`Output ${inputOutputId} not found, might be fast sending`)
                            bypassInputOutputAssetMatch = true
                        } 
                    }
                    if (!bypassInputOutputAssetMatch) throw e
                }
            })())
        }
        await Promise.all(tasks)
        // log inputsOutputMap
        console.log('inputsOutputMap',inputsOutputMap)
        if (!bypassInputOutputAssetMatch) {
            const isMatch = this._isTransactionEssenceInputOutputAssetMatch(inputsOutputMap,transactionEssence)
            if (!isMatch) {
                // log
                console.log('Transaction inputs and outputs not match')
                throw new Error('Transaction inputs and outputs not match')
            }
        }
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
                publicKey: Converter.bytesToHex(this._SMRAccount._walletKeyPair!.publicKey, true),
                signature: Converter.bytesToHex(Ed25519.sign(this._SMRAccount._walletKeyPair!.privateKey, essenceHash), true)
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

    // Before figuring out the relationship between getTransactionPayloadHash and transactionId, keep this function.
    getMetadataFromTransactionId(transactionId: string, essenceOutputsLength: number) {
        const messageOutputId = this.getOutputIdFromTransactionPayloadHashAndIndex(transactionId,0)
        let remainderOutputId:string|undefined
        if (essenceOutputsLength > 1) {
            remainderOutputId = this.getOutputIdFromTransactionPayloadHashAndIndex(transactionId,essenceOutputsLength-1)
        }
        return {outputId:messageOutputId,remainderOutputId}
    }

    ethDecrypt(encryptedData: string): string | undefined {
        if (this._EVMAccount._wallet === undefined) {
            return undefined
        }
        return EthDecrypt({encryptedData, privateKey: this._EVMAccount._wallet.getPrivateKey()})
    }

    getEthEncryptionPublicKey(): string | undefined {
        if (this._EVMAccount._wallet === undefined) {
            return undefined
        }
        const uint8arr = this._EVMAccount._wallet.getPrivateKey()
        const encryptionPublicKey = tweetnacl.box.keyPair.fromSecretKey(uint8arr).publicKey
        return naclUtil.encodeBase64(encryptionPublicKey);
    }

    EthPersonalSign(dataToBeSignedHex: string) {
        const messageBytes = Converter.hexToBytes(dataToBeSignedHex)
        const messageHash = hashPersonalMessage(messageBytes)
        const signature = ecsign(messageHash, this._EVMAccount._wallet!.getPrivateKey())
        const serializedSignature = toRpcSig(signature.v, signature.r, signature.s)
        console.log('===> serializedSignature', serializedSignature)
        return serializedSignature
    }

    tpDecrypt(seed:string, password:string, forceV2 = false){
        return tpDecrypt(seed, password, forceV2)
    }

    encryptDataUsingPassword(data: string, password: string): string {
        // Generate a random salt
        const salt = CryptoJS.lib.WordArray.random(128 / 8);
        // Derive a key using PBKDF2
        const key = CryptoJS.PBKDF2(password, salt, {
            keySize: 256 / 32
        });
        // Generate a random IV
        const iv = CryptoJS.lib.WordArray.random(128 / 8);
        // Encrypt the data using the derived key and random IV
        const encrypted = CryptoJS.AES.encrypt(data, key, {
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7,
            iv: iv
        });
    
        // Combine salt, IV, and ciphertext
        const encryptedData = salt.concat(iv).concat(encrypted.ciphertext);
    
        // Return the encrypted data as a hexadecimal string
        return encryptedData.toString(CryptoJS.enc.Hex);
    }
    
    decryptDataUsingPassword(encryptedData: string, password: string): string {
        // Convert the encrypted data from hexadecimal to WordArray
        const encryptedBytes = CryptoJS.enc.Hex.parse(encryptedData);
        // Extract the salt, IV, and ciphertext
        const salt = CryptoJS.lib.WordArray.create(encryptedBytes.words.slice(0, 4));
        const iv = CryptoJS.lib.WordArray.create(encryptedBytes.words.slice(4, 8));
        const ciphertext = CryptoJS.lib.WordArray.create(encryptedBytes.words.slice(8), encryptedBytes.sigBytes - 16);
    
        // Derive the key using PBKDF2 with the same salt
        const key = CryptoJS.PBKDF2(password, salt, {
            keySize: 256 / 32
        });
    
        // Decrypt the data using the derived key and extracted IV
        const decrypted = CryptoJS.AES.decrypt(
            CryptoJS.lib.CipherParams.create({ ciphertext: ciphertext }),
            key,
            {
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7,
                iv: iv
            }
        );
    
        // Return the decrypted data as a UTF-8 string
        return decrypted.toString(CryptoJS.enc.Utf8);
    }
}

const instance = new GroupfiWalletEmbedded()
export default instance