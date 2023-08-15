import { beforeEach, describe, expect, test, beforeAll, jest } from '@jest/globals';
import { IotaCatSDKObj, IMMessage, ShimmerBech32Addr, MessageAuthSchemeRecipeintOnChain, MessageCurrentSchemaVersion, MessageTypePrivate, MessageAuthSchemeRecipeintInMessage, IMRecipient } from '../src';
import { generateRandomString } from '../../../jest.base';
import { encrypt, decrypt, getEphemeralSecretAndPublicKey, util, setCryptoJS, setHkdf, setIotaCrypto, encryptPayloadList, decryptOneOfList,EncryptingPayload,EncryptedPayload } from 'ecies-ed25519-js';
import { Bip39, Ed25519, Sha512, Bip32Path } from '@iota/crypto.js';
import { Converter } from '@iota/util.js';
import { Ed25519Seed, generateBip44Address, COIN_TYPE_SHIMMER,Ed25519Address,Bech32Helper,ED25519_ADDRESS_TYPE } from '@iota/iota.js';
setIotaCrypto({
    Bip39,
    Ed25519,
    Sha512
})
import hkdf from 'js-crypto-hkdf';
setHkdf(async (secret:Uint8Array, length:number, salt:Uint8Array)=>{
    const res = await hkdf.compute(secret, 'SHA-256', length, '',salt)
    return res.key;
})
import CryptoJS from 'crypto-js';
setCryptoJS(CryptoJS)
describe('metafeature size test', () => {
    const generatePublicKeyAndAddressPair = () => {
        const mnemonic = Bip39.randomMnemonic(128)
        const seed = Ed25519Seed.fromMnemonic(mnemonic)
        const accountState = {
            accountIndex: 0,
            addressIndex: 0,
            isInternal: false
        }
        let path = generateBip44Address(accountState,COIN_TYPE_SHIMMER)
        const addressSeed = seed.generateSeedFromPath(new Bip32Path(path))
        const addressKeyPair = addressSeed.keyPair()
        const publicKey = addressKeyPair.publicKey
        const publicKeyHex = Converter.bytesToHex(publicKey,true)
        const genesisEd25519Address = new Ed25519Address(publicKey);
        const genesisWalletAddress = genesisEd25519Address.toAddress();
        const accountBech32Address = Bech32Helper.toBech32(ED25519_ADDRESS_TYPE, genesisWalletAddress, 'smr');
        return {
            mkey:publicKeyHex,
            addr:accountBech32Address
        }
    }
    const recipients: IMRecipient[] = []
    beforeAll(async () => {
        // generate 100 recipient then push to recipients
        for (let i = 0; i < 80; i++) {
            const recipient = generatePublicKeyAndAddressPair()
            recipients.push(recipient)
        }
    })
    test('test 100 recipients metafeature size', async () => {
        const tag = Converter.utf8ToBytes('IOTACAT')
        const salt = IotaCatSDKObj._generateRandomStr(32)
        const groupId = IotaCatSDKObj._groupToGroupId('iceberg-collection-1')
        const payloadList:EncryptingPayload[] = recipients.map((pair)=>({addr:pair.addr,publicKey:Converter.hexToBytes(pair.mkey), content:salt}))

        const encryptedPayloadList:EncryptedPayload[] = await encryptPayloadList({payloadList,tag})
        const preparedRecipients:IMRecipient[] = encryptedPayloadList.map((payload)=>({addr:payload.addr,mkey:Converter.bytesToHex(payload.payload)}))
        const pl = IotaCatSDKObj.serializeRecipientList(preparedRecipients,groupId!)
        // pl should be less than 8192 bytes
        const plSize = pl.length
        console.log('plSize',plSize)
        expect(plSize).toBeLessThan(8192)
    })
})

