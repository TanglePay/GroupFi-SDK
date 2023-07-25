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
    IEd25519Address
} from "@iota/iota.js";
import { Converter, WriteStream,  } from "@iota/util.js";
import { encrypt, decrypt, getEphemeralSecretAndPublicKey, util, setCryptoJS, setHkdf, setIotaCrypto, asciiToUint8Array } from 'ecies-ed25519-js';
import bigInt from "big-integer";
import { IMMessage, IotaCatSDKObj, IOTACATTAG, IOTACATSHAREDTAG, makeLRUCache,LRUCache, cacheGet, cachePut, MessageAuthSchemeRecipeintOnChain, MessageAuthSchemeRecipeintInMessage } from "iotacat-sdk-core";
import {runBatch, formatUrlParams} from 'iotacat-sdk-utils';
//TODO tune concurrency
const httpCallLimit = 5;
setIotaCrypto({
    Bip39,
    Ed25519,
    Sha512
})
import CryptoJS from 'crypto-js';
import hkdf from 'js-crypto-hkdf';
import { IMRecipient } from "iotacat-sdk-core";
setHkdf(async (secret:Uint8Array, length:number, salt:Uint8Array)=>{
    const res = await hkdf.compute(secret, 'SHA-256', length, '',salt)
    return res.key;
})
setCryptoJS(CryptoJS)
const tag = asciiToUint8Array('IOTACAT')

interface StorageFacade {
    prefix: string;
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
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
}
const shimmerTestNet = {
    id: 101,
    isFaucetAvailable: true,
    faucetUrl: "https://faucet.alphanet.iotaledger.net/api/enqueue",
    apiUrl: "https://test.shimmer.node.tanglepay.com",
    explorerApiUrl: "https://explorer-api.shimmer.network/stardust",
    explorerApiNetwork: "testnet",
    networkId: "1856588631910923207",
}

const shimmerMainNet = {
    id: 102,
    isFaucetAvailable: false,
    apiUrl: "https://mainnet.shimmer.node.tanglepay.com",
    explorerApiUrl: "https://explorer-api.shimmer.network/stardust",
    explorerApiNetwork: "shimmer",
    networkId: "14364762045254553490",
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
        const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiIxMkQzS29vV0tKQ3lqMktaZ05FVEo1NGJYUUZyUlFQZFFrWDRHaDlkdmJvOWtZU1JWQjZLIiwianRpIjoiMTY4OTgyMTAyOCIsImlhdCI6MTY4OTgyMTAyOCwiaXNzIjoiMTJEM0tvb1dLSkN5ajJLWmdORVRKNTRiWFFGclJRUGRRa1g0R2g5ZHZibzlrWVNSVkI2SyIsIm5iZiI6MTY4OTgyMTAyOCwic3ViIjoiSE9STkVUIn0.KJT__y5_3CWuDaBXHJQFs3J38W5fgLpgQB0bmOqVXkw'
        try {
            const url = `https://test2.api.iotacat.com/api/iotacatim/v1/nfts?groupId=0x${groupId}`
            console.log('_getAddressListForGroupFromInxApi url', url);
            const res = await fetch(url,
            {
                method:'GET',
                headers:{
                'Content-Type':'application/json',
                'Authorization':`Bearer ${jwtToken}`
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
        const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiIxMkQzS29vV0tKQ3lqMktaZ05FVEo1NGJYUUZyUlFQZFFrWDRHaDlkdmJvOWtZU1JWQjZLIiwianRpIjoiMTY4OTgyMTAyOCIsImlhdCI6MTY4OTgyMTAyOCwiaXNzIjoiMTJEM0tvb1dLSkN5ajJLWmdORVRKNTRiWFFGclJRUGRRa1g0R2g5ZHZibzlrWVNSVkI2SyIsIm5iZiI6MTY4OTgyMTAyOCwic3ViIjoiSE9STkVUIn0.KJT__y5_3CWuDaBXHJQFs3J38W5fgLpgQB0bmOqVXkw'
        try {
            const url = `https://test2.api.iotacat.com/api/iotacatim/v1/shared?groupId=0x${groupId}`
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
        console.log('recipients', recipients, address);
        let salt = ''
        for (const recipient of recipients) {
            if (!recipient.mkey) continue
            if (recipient.addr !== address) continue
            const decrypted = await decrypt(this._walletKeyPair!.privateKey, recipient.mkey, tag)
            salt = decrypted.payload
            break
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
        const preparedRecipients = await Promise.all(recipients.map(async (pair)=>{
            const publicKey = Converter.hexToBytes(pair.mkey)
            const encrypted = await encrypt(publicKey, salt, tag)
            pair.mkey = encrypted.payload
            return pair
        }))
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
            const sender = Bech32Helper.toBech32(ED25519_ADDRESS_TYPE, senderAddressBytes, this._nodeInfo!.protocol.bech32Hrp);
            const features = output.features
            if (!features) throw new Error('No features')
            const metadataFeature = features.find(feature=>feature.type === 2) as IMetadataFeature
            if (!metadataFeature) throw new Error('No metadata feature')
            const data = Converter.hexToBytes(metadataFeature.data)
            const message = await IotaCatSDKObj.deserializeMessage(data, address, {decryptUsingPrivateKey:async (data:string)=>{
                const decrypted = await decrypt(this._walletKeyPair!.privateKey, data, tag)
                return decrypted.payload
            },sharedOutputSaltResolver:async (sharedOutputId:string)=>{
                const {salt} = await this._getSaltFromSharedOutputId(sharedOutputId,address)
                return salt
            }})
            return { sender , message }
        } catch(e) {
            console.log(`getMessageFromOutputId:${outputId}`);
        }
    }
    async _getUnSpentOutputs() {
        this._ensureClientInited()
        this._ensureWalletInited()
        const outputsResponse = await this._indexer!.basicOutputs({
            addressBech32: this._accountBech32Address,
            hasStorageDepositReturn: false,
            hasExpiration: false,
            hasTimelock: false,
            hasNativeTokens: false,
        });
        console.log('OutputsResponse', outputsResponse);
        //TODO
        ///const outputIds = ['0xebcbe2446bb42ef341ee28eb753b70bcce8e6357e74b62cac368d45844976e140100']//
        const outputIds = outputsResponse.items
        const tasks = outputIds.map(outputId=>this._client!.output(outputId))
        let outputsRaw = await Promise.all(tasks)
        let outputs = outputsRaw.map((output,idx)=>{return {outputId:outputIds[idx],output}})
        outputs = outputs.filter(output=>output.output.metadata.isSpent === false)
        console.log('Unspent Outputs', outputs);
        return outputs.map(output=>{return {outputId:output.outputId,output:output.output.output}})
    }
    _getAmount(output:IBasicOutput){
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
    async _sendBasicOutput(basicOutput:IBasicOutput){
        const amountToSend = this._getAmount(basicOutput)
            console.log('AmountToSend', amountToSend);
            basicOutput.amount = amountToSend.toString()
            const outputs = await this._getUnSpentOutputs()
            console.log('unspent Outputs', outputs);
            // get first output with amount > amountToSend
            //TODO consider remainder
            const threshold = amountToSend.multiply(2)
            const consumedOutputWrapper = outputs.find(output=>bigInt(output.output.amount).greater(threshold))
            if (!consumedOutputWrapper ) throw new Error('No output with enough amount')
            const {output:consumedOutput, outputId:consumedOutputId}  = consumedOutputWrapper
            console.log('ConsumedOutput', consumedOutput);
            // 2. Prepare Inputs for the transaction
            const input: IUTXOInput = TransactionHelper.inputFromOutputId(consumedOutputId); 
            console.log("Input: ", input, '\n');


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
            // 4. Get inputs commitment
            const inputsCommitment = TransactionHelper.getInputsCommitment([consumedOutput]);
            console.log("Inputs Commitment: ", inputsCommitment);

            // 14364762045254553490 is the networkId of the mainnet
            // 1856588631910923207 is the networkId of the testnet
            const transactionEssence: ITransactionEssence = {
                type: TRANSACTION_ESSENCE_TYPE,
                networkId: this._curNode!.networkId, //this._protocolInfo!.networkName,
                inputs: [input], 
                inputsCommitment,
                outputs: [basicOutput, remainderBasicOutput],
                payload: undefined
            };

            const wsTsxEssence = new WriteStream();
            serializeTransactionEssence(wsTsxEssence, transactionEssence);
            const essenceFinal = wsTsxEssence.finalBytes();
            const essenceHash = Blake2b.sum256(essenceFinal);
            console.log("Transaction Essence: ", transactionEssence);

            // 6. Create the unlocks
            const unlockCondition: UnlockTypes = {
                type: SIGNATURE_UNLOCK_TYPE,
                signature: {
                    type: ED25519_SIGNATURE_TYPE,
                    publicKey: Converter.bytesToHex(this._walletKeyPair!.publicKey, true),
                    signature: Converter.bytesToHex(Ed25519.sign(this._walletKeyPair!.privateKey, essenceHash), true)
                }
            };
            console.log("Unlock condition: ", unlockCondition);

            // 7. Create transaction payload
            const transactionPayload: ITransactionPayload = {
                type: TRANSACTION_PAYLOAD_TYPE,
                essence: transactionEssence,
                unlocks:[unlockCondition]
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
        
            const blockId = await this._client!.blockSubmit(block);
            console.log("Submitted blockId is: ", blockId);
            return {blockId,outputId};
        }
    async fetchMessageListFrom(group:string, address:string, coninuationToken?:string, limit:number=10) {
        const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiIxMkQzS29vV0tKQ3lqMktaZ05FVEo1NGJYUUZyUlFQZFFrWDRHaDlkdmJvOWtZU1JWQjZLIiwianRpIjoiMTY4OTgyMTAyOCIsImlhdCI6MTY4OTgyMTAyOCwiaXNzIjoiMTJEM0tvb1dLSkN5ajJLWmdORVRKNTRiWFFGclJRUGRRa1g0R2g5ZHZibzlrWVNSVkI2SyIsIm5iZiI6MTY4OTgyMTAyOCwic3ViIjoiSE9STkVUIn0.KJT__y5_3CWuDaBXHJQFs3J38W5fgLpgQB0bmOqVXkw'
        const groupId = IotaCatSDKObj._groupToGroupId(group)
        try {
            const params = {groupId:`0x${groupId}`,size:limit, token:coninuationToken}
            const paramStr = formatUrlParams(params)
            const url = `https://test2.api.iotacat.com/api/iotacatim/v1/messages${paramStr}`
            // @ts-ignore
            const res = await fetch(url,{
                method:'GET',
                headers:{
                'Content-Type':'application/json',
                "Authorization":`Bearer ${jwtToken}`
                }})
            const data = await res.json() as MessageResponse
            const {messageList,headToken,tailToken} = await this._messageResponseToMesssageListAndTokens(data,address)
            return {messageList,headToken,tailToken}
        } catch (error) {
            console.log('error',error)
        }
    }
    // fetchMessageListUntil
    async fetchMessageListUntil(group:string, address:string, coninuationToken:string, limit:number=10) {
        const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiIxMkQzS29vV0tKQ3lqMktaZ05FVEo1NGJYUUZyUlFQZFFrWDRHaDlkdmJvOWtZU1JWQjZLIiwianRpIjoiMTY4OTgyMTAyOCIsImlhdCI6MTY4OTgyMTAyOCwiaXNzIjoiMTJEM0tvb1dLSkN5ajJLWmdORVRKNTRiWFFGclJRUGRRa1g0R2g5ZHZibzlrWVNSVkI2SyIsIm5iZiI6MTY4OTgyMTAyOCwic3ViIjoiSE9STkVUIn0.KJT__y5_3CWuDaBXHJQFs3J38W5fgLpgQB0bmOqVXkw'
        const groupId = IotaCatSDKObj._groupToGroupId(group)
        try {
            const params = {groupId:`0x${groupId}`,size:limit, token:coninuationToken}
            const paramStr = formatUrlParams(params)
            const url = `https://test2.api.iotacat.com/api/iotacatim/v1/messages/until${paramStr}`
            // @ts-ignore
            const res = await fetch(url,{
                method:'GET',
                headers:{
                'Content-Type':'application/json',
                "Authorization":`Bearer ${jwtToken}`
                }})
            const data = await res.json() as MessageResponse
            const {messageList,headToken,tailToken} = await this._messageResponseToMesssageListAndTokens(data,address)
            return {messageList,headToken,tailToken}
        } catch (error) {
            console.log('error',error)
        }
    }
    async _messageResponseToMesssageListAndTokens(response:MessageResponse, address:string,):Promise<{messageList:MessageBody[],headToken?:string,  tailToken?:string}>{
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