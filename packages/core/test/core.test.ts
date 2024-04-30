import { beforeEach, describe, expect, test, beforeAll, jest } from '@jest/globals';
import { IotaCatSDKObj, IMMessage, ShimmerBech32Addr, MessageAuthSchemeRecipeintOnChain, MessageCurrentSchemaVersion, MessageTypePrivate, MessageAuthSchemeRecipeintInMessage } from '../src';
import { generateRandomString } from '../../../jest.base';
import { encrypt, decrypt, getEphemeralSecretAndPublicKey, util, setCryptoJS, setHkdf, setIotaCrypto } from 'ecies-ed25519-js';
import { Converter } from '@iota/util.js';
import { Bip39, Ed25519, Sha512, Bip32Path } from '@iota/crypto.js';
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
describe('core test', () => {
    let msgObject:IMMessage|undefined
    const basicMsg = 'hehe'
    
    const sharedSalt = 'salt'
    let secret_:Uint8Array
    let publicKey_:Uint8Array
    let publicKeyString_:string
    let publicAddr: string
    const tag = Converter.utf8ToBytes('TAG')
    const encryptUsingPublicKey = async (key:string,data:string)=>{
        const publicKey = util.hexToBytes(key)
        const encrypted = await encrypt(publicKey, data, tag)
        return encrypted.payload
    }
    const decryptUsingPrivateKey = async (data:Uint8Array)=>{
        const decrypted = await decrypt(secret_, data, tag)
        return decrypted.payload
    }
    const prepareRecipientInMessageMsg = async (msg:string)=>{
        jest.spyOn(IotaCatSDKObj,'_groupNameToGroupMeta').mockImplementation((group:string)=>{
            return {
                groupName:group,
                schemaVersion: MessageCurrentSchemaVersion,
                messageType:MessageTypePrivate,
                authScheme:MessageAuthSchemeRecipeintInMessage,
            }
        })
        msgObject = await IotaCatSDKObj.prepareSendMessage({type:ShimmerBech32Addr,addr:publicAddr},'dummy',msg)
        msgObject!.recipients = []
        msgObject!.recipients.push({addr:publicAddr,mkey:publicKeyString_})
    }
    const prepareRecipientOnChainMsg = async (msg:string)=>{
        jest.spyOn(IotaCatSDKObj,'_groupNameToGroupMeta').mockImplementation((group:string)=>{
            return {
                groupName:group,
                schemaVersion: MessageCurrentSchemaVersion,
                messageType:MessageTypePrivate,
                authScheme:MessageAuthSchemeRecipeintOnChain,
            }
        })
        msgObject = await IotaCatSDKObj.prepareSendMessage({type:ShimmerBech32Addr,addr:publicAddr},'dummy',msg)
        msgObject!.recipientOutputid = '0xc6b3be90456dcde47e859806c973299cead6d5e9ca7a7d5130a2b71bb4425b5a0000'
    }
    beforeEach(()=>{
        const {secret,publicKey} = getEphemeralSecretAndPublicKey()
        secret_ = secret
        publicKey_ = publicKey
        publicKeyString_ = util.bytesToHex(publicKey_)
        publicAddr = util.bytesToHex(publicKey_)
    })
    test('test _encrypt then _decrypt', async () => {
        const data = 'hehe'
        const salt = IotaCatSDKObj._generateRandomStr(32)
        const encrypted = await IotaCatSDKObj._encrypt(data,salt)
        const decrypted = await IotaCatSDKObj._decrypt(encrypted,salt)
        expect(decrypted).toBe(data)
    })

    test('test prepareSendMessage for RecipientInMessageMsg', async () => {
        await prepareRecipientInMessageMsg(basicMsg)
        expect(msgObject).toBeDefined()
    })
    test('test prepareSendMessage for RecipientOnChainMsg', async () => {
        await prepareRecipientOnChainMsg(basicMsg)
        expect(msgObject).toBeDefined()
    })
    test('test compile then decompile recipient', async () => {
        const recipient = {addr:publicAddr,mkey:publicKeyString_}
        const recipientBytes = await IotaCatSDKObj._compileRecipient(recipient)
        const recipient2 = await IotaCatSDKObj._decompileRecipient(recipientBytes)
        expect(recipient2).toBeDefined()
        expect(recipient2.addr).toBe(IotaCatSDKObj.getAddressHashStr(recipient.addr))
        expect(recipient2.mkey).toBe(recipient.mkey)
    })
    test('test serializeMessage for RecipientInMessageMsg', async () => {
        await prepareRecipientInMessageMsg(basicMsg)
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!,{isActAsSelf:false,
            encryptUsingPublicKey})
        expect(msgBytes).toBeDefined()
    })
    test('test serializeMessage for RecipientOnChainMsg', async () => {
        await prepareRecipientOnChainMsg(basicMsg)
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!,{isActAsSelf:false,groupSaltResolver:async (groupId:string)=>sharedSalt})
        expect(msgBytes).toBeDefined()
    })
    /*
    test('test deserializeMessage for RecipientInMessageMsg', async () => {
        await prepareRecipientInMessageMsg(basicMsg)
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!,{encryptUsingPublicKey})
        const msgObject2 = await IotaCatSDKObj.deserializeMessage(msgBytes,publicAddr,{decryptUsingPrivateKey})
        expect(msgObject2).toBeDefined()
        expect(msgObject2!.data).toBe(basicMsg)
    })
    */
    test('test deserializeMessage for RecipientOnChainMsg', async () => {
        await prepareRecipientOnChainMsg(basicMsg)
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!,{isActAsSelf:false,groupSaltResolver:async (groupId:string)=>sharedSalt})
        const msgObject2 = await IotaCatSDKObj.deserializeMessage(msgBytes,publicAddr,{sharedOutputSaltResolver:async (outputId:string)=>sharedSalt})
        expect(msgObject2).toBeDefined()
        expect(msgObject2!.data).toBe(basicMsg)
    })
    /*
    test('test random string for RecipientInMessageMsg', async() => {
        const randomStr = generateRandomString(32)
        await prepareRecipientInMessageMsg(randomStr)
        // manually set publickey
        IotaCatSDKObj.setPublicKeyForPreparedMessage(msgObject!,{[publicAddr]:publicAddr})
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!,{encryptUsingPublicKey})
        const msgObject2 = await IotaCatSDKObj.deserializeMessage(msgBytes,publicAddr,{decryptUsingPrivateKey})
        expect(msgObject2).toBeDefined()
        expect(msgObject2!.data).toBe(randomStr)
    })
    */
    test('test random string for RecipientOnChainMsg', async() => {
        const randomStr = generateRandomString(32)
        await prepareRecipientOnChainMsg(randomStr)
        // TODO remove
        // manually set publickey
        //IotaCatSDKObj.setPublicKeyForPreparedMessage(msgObject!,{[publicAddr]:publicAddr})
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!,{isActAsSelf:false,groupSaltResolver:async (groupId:string)=>sharedSalt})
        const msgObject2 = await IotaCatSDKObj.deserializeMessage(msgBytes,publicAddr,{sharedOutputSaltResolver:async (outputId:string)=>sharedSalt})
        expect(msgObject2).toBeDefined()
        expect(msgObject2!.data).toBe(randomStr)
    })
});