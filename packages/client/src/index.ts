import { Bip32Path, Blake2b, Ed25519 } from "@iota/crypto.js";
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
    INodeInfoProtocol
} from "@iota/iota.js";
import { Converter, WriteStream, HexHelper } from "@iota/util.js";
import { BrowserPowProvider  } from "@iota/pow-browser.js";
import bigInt from "big-integer";
import { IMMessage, IotaCatSDKObj, IOTACATTAG, makeLRUCache,LRUCache, cacheGet, cachePut } from "iotacat-sdk-core";

interface StorageFacade {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
}

class IotaCatClient {

    _client?: SingleNodeClient;
    _indexer?: IndexerPluginClient;
    _nodeInfo?: INodeInfo;
    _protocolInfo?: INodeInfoProtocol;
    _walletKeyPair?: IKeyPair;
    _accountHexAddress?:string;
    _accountBech32Address?:string;
    _lruCache?:LRUCache<string>;
    _storage?:StorageFacade;
    async setup(endpoint:string){
        this._client = new SingleNodeClient(endpoint, {powProvider: new BrowserPowProvider()})
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
        const baseSeed = this._hexSeedToEd25519Seed(hexSeed);
        const nodeInfo = await this._client!.info();
        this._walletKeyPair = this._getPair(baseSeed)
        const genesisEd25519Address = new Ed25519Address(this._walletKeyPair.publicKey);
        const genesisWalletAddress = genesisEd25519Address.toAddress();
        this._accountHexAddress = Converter.bytesToHex(genesisWalletAddress, true);
        this._accountBech32Address = Bech32Helper.toBech32(ED25519_ADDRESS_TYPE, genesisWalletAddress, this._nodeInfo!.protocol.bech32Hrp);
    }

    async getPublicKey(ed25519Address:string):Promise<string>{
        this._ensureClientInited()

        const memoryValue = cacheGet(ed25519Address, this._lruCache!)
        if (memoryValue) return memoryValue

        const storageValue = await this._storage!.get(ed25519Address)
        if (storageValue) {
            cachePut(ed25519Address, storageValue, this._lruCache!)
            return storageValue
        }
        // @ts-ignore
        const bech32Address = Bech32Helper.toBech32(ED25519_ADDRESS_TYPE, ed25519Address, this._nodeInfo!.protocol.bech32Hrp);
        const outputResponse = await this._indexer!.basicOutputs({
            senderBech32:bech32Address
        })
        if (outputResponse.items.length == 0) throw new Error('No output found')
        const outputId = outputResponse.items[0]
        const output = await this._client!.output(outputId)
        const transactionId = output.metadata.transactionId
        const response = await fetch(`https://explorer-api.shimmer.network/stardust/transaction/testnet/${transactionId}`)
        const json = await response.json()
        for (const unlock of json.block.payload.unlocks) {
            if (unlock.type === 0) {
                const publicKey = unlock.signature.publicKey
                await this._storage!.set(ed25519Address, publicKey)
                cachePut(ed25519Address, publicKey, this._lruCache!)
                return publicKey
            }
        }
        throw new Error('No public key found')
    }
    _getPair(baseSeed:Ed25519Seed){
        const addressGeneratorAccountState = {
            accountIndex: 0,
            addressIndex: 0,
            isInternal: false
        };
        const path = generateBip44Address(addressGeneratorAccountState);

        console.log(`Wallet Index ${path}`);

        const addressSeed = baseSeed.generateSeedFromPath(new Bip32Path(path));
        const addressKeyPair = addressSeed.keyPair();
        return addressKeyPair
    }
    _hexSeedToEd25519Seed(hexSeed:string):Ed25519Seed{
        const seedBytes = Converter.hexToBytes(hexSeed);
        const uint8arr = Uint8Array.from(seedBytes);
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
        const outputIds = outputsResponse.items
        const tasks = outputIds.map(outputId=>this._client!.output(outputId))
        let outputsRaw = await Promise.all(tasks)
        let outputs = outputsRaw.map((output,idx)=>{return {outputId:outputIds[idx],output}})
        outputs = outputs.filter(output=>output.output.metadata.isSpent === false)
        console.log('Unspent Outputs', outputs);
        return outputs.map(output=>{return {outputId:output.outputId,output:output.output.output}})
    }
    _getAmount(){
        return bigInt('1000000')
    }
    async sendMessage(senderAddr:string, group:string,message: IMMessage){
        this._ensureClientInited()
        this._ensureWalletInited()
        const pl = IotaCatSDKObj.serializeMessage(message,(key,data)=>{
            return ''
        })
        const amountToSend = this._getAmount()
        const outputs = await this._getUnSpentOutputs()
        // get first output with amount > amountToSend
        const consumedOutputWrapper = outputs.find(output=>bigInt(output.output.amount).greater(amountToSend))
        if (!consumedOutputWrapper ) throw new Error('No output with enough amount')
        const {output:consumedOutput, outputId:consumedOutputId}  = consumedOutputWrapper

         // 2. Prepare Inputs for the transaction
        const input: IUTXOInput = TransactionHelper.inputFromOutputId(consumedOutputId); 
        console.log("Input: ", input, '\n');

        const tagFeature: ITagFeature = {
            type: 3,
            tag: IOTACATTAG
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
                tagFeature,
                metadataFeature
            ]
        };

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

        // 4. Get inputs commitment
        const inputsCommitment = TransactionHelper.getInputsCommitment([consumedOutput]);
        console.log("Inputs Commitment: ", inputsCommitment);

        // 5.Create transaction essence
        const transactionEssence: ITransactionEssence = {
            type: TRANSACTION_ESSENCE_TYPE,
            // @ts-ignore
            networkId: this._protocolInfo!.networkId,
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
    }
}