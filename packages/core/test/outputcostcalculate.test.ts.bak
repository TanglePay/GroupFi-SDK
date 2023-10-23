import { describe, expect, test, beforeAll } from '@jest/globals';
import { IotaCatSDKObj, ShimmerBech32Addr, IOTACATTAG } from '../src';
import { setCryptoJS, setHkdf, setIotaCrypto } from 'ecies-ed25519-js';
import { Bip39, Ed25519, Sha512 } from '@iota/crypto.js';
import { Converter } from '@iota/util.js';
import {
    ED25519_ADDRESS_TYPE, ITagFeature, IBasicOutput, BASIC_OUTPUT_TYPE, ADDRESS_UNLOCK_CONDITION_TYPE,
    IMetadataFeature,TransactionHelper
} from '@iota/iota.js';
import hkdf from 'js-crypto-hkdf';
import CryptoJS from 'crypto-js';

setIotaCrypto({
    Bip39,
    Ed25519,
    Sha512
})
setHkdf(async (secret:Uint8Array, length:number, salt:Uint8Array)=>{
    const res = await hkdf.compute(secret, 'SHA-256', length, '',salt)
    return res.key;
})
setCryptoJS(CryptoJS)
const rentStructure = {
    vByteCost: 100,
    vByteFactorData: 1,
    vByteFactorKey: 10
}
const calculateCost = (pl:Uint8Array)=>{
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
                    pubKeyHash: '0x7fbf4180dd52fbed1c0a1342c9b1d54d6b23ded06aa4ff321c910d5b896db976'
                }
            }
        ],
        features: [
            metadataFeature,
            tagFeature
        ]
    };
    const deposit = TransactionHelper.getStorageDeposit(basicOutput,rentStructure)
    return deposit
}
describe('output cost test', () => {
    let salt:string
    const groupName = 'iceberg'
    beforeAll(async () => {
        salt = IotaCatSDKObj._generateRandomStr(32)
    })
    test('test message with 10 en character', async () => {
        const message = IotaCatSDKObj._generateRandomStr(10)
        const messageObj = await IotaCatSDKObj.prepareSendMessage(
            {type:ShimmerBech32Addr,addr:'smr1qzjh56yyjlwcm8pc9xccunkuage3xcae3trgrvmlzz8nts0rtym37stqddc'}, groupName, message)
        messageObj!.recipientOutputid = '0xc6b3be90456dcde47e859806c973299cead6d5e9ca7a7d5130a2b71bb4425b5a0000'
        
        const groupId = IotaCatSDKObj._groupToGroupId(groupName)
        const groupSaltMap = {
            [groupId!]:salt
        }
        const pl = await IotaCatSDKObj.serializeMessage(messageObj!,{groupSaltResolver:async (groupId:string)=>groupSaltMap[groupId]})
        expect(pl.length).toBeLessThan(138)
        const cost = calculateCost(pl)
        expect(cost).toBeLessThan(57800) // was 57800
    })
    test('test message with 100 en character', async () => {
        const message = IotaCatSDKObj._generateRandomStr(100)
        const messageObj = await IotaCatSDKObj.prepareSendMessage(
            {type:ShimmerBech32Addr,addr:'smr1qzjh56yyjlwcm8pc9xccunkuage3xcae3trgrvmlzz8nts0rtym37stqddc'}, groupName, message)
        messageObj!.recipientOutputid = '0xc6b3be90456dcde47e859806c973299cead6d5e9ca7a7d5130a2b71bb4425b5a0000'
        
        const groupId = IotaCatSDKObj._groupToGroupId(groupName)
        const groupSaltMap = {
            [groupId!]:salt
        }
        const pl = await IotaCatSDKObj.serializeMessage(messageObj!,{groupSaltResolver:async (groupId:string)=>groupSaltMap[groupId]})
        // pl should be less than 8192 bytes
        expect(pl.length).toBeLessThan(456)
        const cost = calculateCost(pl)
        expect(cost).toBeLessThan(77100)// was 77100

    })
    test('test message with 10 cn character', async () => {
        // 10 cn character fixed
        const message = '测试一二三四五六七八';
        const messageObj = await IotaCatSDKObj.prepareSendMessage(
            {type:ShimmerBech32Addr,addr:'smr1qzjh56yyjlwcm8pc9xccunkuage3xcae3trgrvmlzz8nts0rtym37stqddc'}, groupName, message)
        messageObj!.recipientOutputid = '0xc6b3be90456dcde47e859806c973299cead6d5e9ca7a7d5130a2b71bb4425b5a0000'
        const groupId = IotaCatSDKObj._groupToGroupId(groupName)
        const groupSaltMap = {
            [groupId!]:salt
        }
        const pl = await IotaCatSDKObj.serializeMessage(messageObj!,{groupSaltResolver:async (groupId:string)=>groupSaltMap[groupId]})

        expect(pl.length).toBeLessThan(170)
        const cost = calculateCost(pl)
        expect(cost).toBeLessThan(61000) //was 61000
    })
    test('test shared with 20 recipients', async () => {
        // uint8array 6144 bytes, fill with 1
        const pl = new Uint8Array(1584).fill(1)
        expect(pl.length).toBe(1584)
        const cost = calculateCost(pl)
        expect(cost).toBe(202400)
    })
    test('test shared with 50 recipients', async () => {
        // uint8array 6144 bytes, fill with 1
        const pl = new Uint8Array(3864).fill(1)
        const cost = calculateCost(pl)
        expect(cost).toBe(430400)
        expect(pl.length).toBe(3864)
    })
    test('test shared with 80 recipients', async () => {
        // uint8array 6144 bytes, fill with 1
        const pl = new Uint8Array(6144).fill(1)
        const cost = calculateCost(pl)
        expect(cost).toBe(658400)
        expect(pl.length).toBe(6144)
    })
    test('test shared with 100 recipients', async () => {
        // uint8array 6144 bytes, fill with 1
        const pl = new Uint8Array(7664).fill(1)
        const cost = calculateCost(pl)
        expect(cost).toBe(810400)
        expect(pl.length).toBe(7664)
    })
    test('test 10 en character length', async () => {
        const str = IotaCatSDKObj._generateRandomStr(10)
        const pl = Converter.utf8ToBytes(str)
        expect(pl.length).toBe(10)
    })
    test('test 100 en character length', async () => {
        const str = IotaCatSDKObj._generateRandomStr(100)
        const pl = Converter.utf8ToBytes(str)
        expect(pl.length).toBe(100)
    })
    test('test 10 cn character length', async () => {
        const str = '测试一二三四五六七八'
        const pl = Converter.utf8ToBytes(str)
        expect(pl.length).toBe(30)
    })

})

