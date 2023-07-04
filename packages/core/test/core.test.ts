import { beforeEach, describe, expect, test, beforeAll, jest } from '@jest/globals';
import { IotaCatSDKObj, IMMessage, ShimmerBech32Addr } from '../src';
import { generateRandomString } from '../../../jest.base';
describe('core test', () => {
    let msgObject:IMMessage|undefined
    const basicMsg = 'hehe'
    const basicAddr = '0x00'
    
    beforeEach(()=>{
        jest.spyOn(IotaCatSDKObj,'_groupIdToGroupMembers').mockImplementation((groupId:string)=>{
            return [basicAddr]
        })
        msgObject = IotaCatSDKObj.prepareSendMessage({type:ShimmerBech32Addr,addr:basicAddr},'dummy',basicMsg)
    })
    test('test prepareSendMessage', () => {
        expect(msgObject).toBeDefined()
    })
    test('test serializeMessage', async () => {
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!,async (key,data)=>data)
        expect(msgBytes).toBeDefined()
    })
    test('test deserializeMessage', async () => {
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!,async (key,data)=>data)
        const msgObject2 = await  IotaCatSDKObj.deserializeMessage(msgBytes,basicAddr,async (data)=>data)
        expect(msgObject2).toBeDefined()
        expect(msgObject2!.data[0]).toBe(basicMsg)
    })
    test('test random string', async() => {
        const randomStr = generateRandomString(32)
        jest.spyOn(IotaCatSDKObj,'_groupIdToGroupMembers').mockImplementation((groupId:string)=>{
            return [basicAddr]
        })
        msgObject = IotaCatSDKObj.prepareSendMessage({type:ShimmerBech32Addr,addr:basicAddr},'dummy',randomStr)
        // manually set publickey
        IotaCatSDKObj.setPublicKeyForPreparedMessage(msgObject!,{[basicAddr]:basicAddr})
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!,async (key,data)=>data)
        const msgObject2 = await IotaCatSDKObj.deserializeMessage(msgBytes,basicAddr,async (data)=>data)
        expect(msgObject2).toBeDefined()
        expect(msgObject2!.data[0]).toBe(randomStr)
    })
});