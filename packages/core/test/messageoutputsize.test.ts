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
    let salt:string
    const groupName = 'iceberg'
    beforeAll(async () => {
        salt = IotaCatSDKObj._generateRandomStr(32)
    })
    test('test message with 10 en character', async () => {
        const message = IotaCatSDKObj._generateRandomStr(10)
        const messageObj = await IotaCatSDKObj.prepareSendMessage(
            {type:ShimmerBech32Addr,addr:'smr1qzjh56yyjlwcm8pc9xccunkuage3xcae3trgrvmlzz8nts0rtym37stqddc'}, groupName, message)
        const groupId = IotaCatSDKObj._groupToGroupId(groupName)
        const groupSaltMap = {
            [groupId!]:salt
        }
        const pl = await IotaCatSDKObj.serializeMessage(messageObj!,{groupSaltResolver:async (groupId:string)=>groupSaltMap[groupId]})
        // pl should be less than 8192 bytes
        const plSize = pl.length
        expect(plSize).toBe(1)
    })
    test('test message with 100 en character', async () => {
        const message = IotaCatSDKObj._generateRandomStr(100)
        const messageObj = await IotaCatSDKObj.prepareSendMessage(
            {type:ShimmerBech32Addr,addr:'smr1qzjh56yyjlwcm8pc9xccunkuage3xcae3trgrvmlzz8nts0rtym37stqddc'}, groupName, message)
        const groupId = IotaCatSDKObj._groupToGroupId(groupName)
        const groupSaltMap = {
            [groupId!]:salt
        }
        const pl = await IotaCatSDKObj.serializeMessage(messageObj!,{groupSaltResolver:async (groupId:string)=>groupSaltMap[groupId]})
        // pl should be less than 8192 bytes
        const plSize = pl.length
        console.log('100MessageLength',plSize)
        expect(plSize).toBe(1)
    })
    test('test message with 10 cn character', async () => {
        // 10 cn character fixed
        const message = '测试一二三四五六七八';
        const messageObj = await IotaCatSDKObj.prepareSendMessage(
            {type:ShimmerBech32Addr,addr:'smr1qzjh56yyjlwcm8pc9xccunkuage3xcae3trgrvmlzz8nts0rtym37stqddc'}, groupName, message)
        const groupId = IotaCatSDKObj._groupToGroupId(groupName)
        const groupSaltMap = {
            [groupId!]:salt
        }
        const pl = await IotaCatSDKObj.serializeMessage(messageObj!,{groupSaltResolver:async (groupId:string)=>groupSaltMap[groupId]})
        // pl should be less than 8192 bytes
        const plSize = pl.length
        console.log('10CNMessageLength',plSize)
        expect(plSize).toBe(1)
    })
})

