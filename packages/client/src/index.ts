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
    COIN_TYPE_SHIMMER
} from "@iota/iota.js";
import { Converter, WriteStream,  } from "@iota/util.js";
import { encrypt, decrypt, getEphemeralSecretAndPublicKey, util, setCryptoJS, setHkdf, setIotaCrypto, asciiToUint8Array } from 'ecies-ed25519-js';
import bigInt from "big-integer";
import { IMMessage, IotaCatSDKObj, IOTACATTAG, makeLRUCache,LRUCache, cacheGet, cachePut } from "iotacat-sdk-core";
setIotaCrypto({
    Bip39,
    Ed25519,
    Sha512
})
import CryptoJS from 'crypto-js';
import hkdf from 'js-crypto-hkdf';
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
type Network = {
    id: number;
    isFaucetAvailable: boolean;
    faucetUrl?: string;
    apiUrl: string;
    explorerApiUrl: string;
    explorerApiNetwork: string;
}
const shimmerTestNet = {
    id: 101,
    isFaucetAvailable: true,
    faucetUrl: "https://faucet.alphanet.iotaledger.net/api/enqueue",
    apiUrl: "https://test.shimmer.node.tanglepay.com",
    explorerApiUrl: "https://explorer-api.shimmer.network/stardust",
    explorerApiNetwork: "testnet",
}

const shimmerMainNet = {
    id: 102,
    isFaucetAvailable: false,
    apiUrl: "https://mainnet.shimmer.node.tanglepay.com",
    explorerApiUrl: "https://explorer-api.shimmer.network/stardust",
    explorerApiNetwork: "shimmer",
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
    _lruCache?:LRUCache<string>;
    _storage?:StorageFacade;
    async setup(id:number, provider?:Constructor<IPowProvider>,...rest:any[]){
        const node = nodes.find(node=>node.id === id)
        if (!node) throw new Error('Node not found')
        this._curNode = node
        // @ts-ignore
        this._client = provider ? new SingleNodeClient(node.apiUrl, {powProvider: new provider(...rest)}) : new SingleNodeClient(node.apiUrl)
        this._indexer = new IndexerPluginClient(this._client)
        this._nodeInfo = await this._client.info();
        this._protocolInfo = await this._client.protocolInfo();
        this._lruCache = makeLRUCache<string>(200)
        console.log('NodeInfo', this._nodeInfo);
        console.log('ProtocolInfo', this._protocolInfo);
    }
    setupStorage(storage:StorageFacade){
        this._storage = storage
    }
    async setHexSeed(hexSeed:string){
        this._ensureClientInited()
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
        const memoryValue = cacheGet(address, this._lruCache!)
        console.log('MemoryValue', memoryValue);
        if (memoryValue) return memoryValue

        const storageValue = await this._storage!.get(address)
        console.log('StorageValue', storageValue);
        if (storageValue) {
            cachePut(address, storageValue, this._lruCache!)
            return storageValue
        }
        const ledgerValue = type == 'bech32'? await this._getPublicKeyFromLedger(addressRaw) : await this._getPublicKeyFromLedgerEd25519(addressRaw)
        console.log('LedgerValue', ledgerValue);
        if (ledgerValue) {
            await this._storage!.set(address, ledgerValue)
            cachePut(address, ledgerValue, this._lruCache!)
            return ledgerValue
        }
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
        const outputsResponse = await this._client!.output(outputId)
        const output = outputsResponse.output as IBasicOutput
        const features = output.features
        if (!features) throw new Error('No features')
        const metadataFeature = features.find(feature=>feature.type === 2) as IMetadataFeature
        if (!metadataFeature) throw new Error('No metadata feature')
        const data = Converter.hexToBytes(metadataFeature.data)
        const message = await IotaCatSDKObj.deserializeMessage(data, address, async (data:string)=>{
            const decrypted = await decrypt(this._walletKeyPair!.privateKey, data, tag)
            return decrypted.payload
        })
        return message
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
    _getAmount(){
        return bigInt('100000')
    }
    async sendMessage(senderAddr:string, group:string,message: IMMessage){
        this._ensureClientInited()
        this._ensureWalletInited()
        try {
            const protocolInfo = await this._client!.protocolInfo();
            console.log('ProtocolInfo', protocolInfo);
            const bech32AddrArr = message.recipients.map(recipient=>recipient.addr)
            const tasks = bech32AddrArr.map(addr=>this.getPublicKey(addr))
            // TODO p-limit
            const publicKeys = await Promise.all(tasks)
            console.log('PublicKeys', publicKeys);
            message.recipients = message.recipients.map((recipient,idx)=>{
                return {
                    addr:recipient.addr,
                    key:publicKeys[idx]!
                }
            })
            console.log('MessageWithPublicKeys', message);
            const pl = await IotaCatSDKObj.serializeMessage(message,async (key,data)=>{
                const publicKey = Converter.hexToBytes(key)
                const encrypted = await encrypt(publicKey, data, tag)
                return encrypted.payload
            })
            console.log('MessagePayload', pl);
            const amountToSend = this._getAmount()
            console.log('AmountToSend', amountToSend);
            const outputs = await this._getUnSpentOutputs()
            console.log('Outputs', outputs);
            // get first output with amount > amountToSend
            const consumedOutputWrapper = outputs.find(output=>bigInt(output.output.amount).greater(amountToSend))
            if (!consumedOutputWrapper ) throw new Error('No output with enough amount')
            const {output:consumedOutput, outputId:consumedOutputId}  = consumedOutputWrapper
            console.log('ConsumedOutput', consumedOutput);
            // 2. Prepare Inputs for the transaction
            const input: IUTXOInput = TransactionHelper.inputFromOutputId(consumedOutputId); 
            console.log("Input: ", input, '\n');

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
                amount: amountToSend.toString(),
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


            // 5.Create transaction essence
            const transactionEssence: ITransactionEssence = {
                type: TRANSACTION_ESSENCE_TYPE,
                networkId: "14364762045254553490", //this._protocolInfo!.networkName,
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
            return blockId
        } catch (e) {
            console.log("Error submitting block: ", e);
        }
        
    }
}

const instance = new IotaCatClient()
export default instance