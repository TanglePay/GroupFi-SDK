import { beforeEach, describe, expect, test, beforeAll, jest } from '@jest/globals';
import { IotaCatSDKObj, IMMessage, ShimmerBech32Addr, MessageAuthSchemeRecipeintOnChain, MessageCurrentSchemaVersion, MessageTypePrivate, MessageAuthSchemeRecipeintInMessage } from '../src';
import { generateRandomString } from '../../../jest.base';

describe('core test', () => {
    let msgObject:IMMessage|undefined
    const basicMsg = 'hehe'
    const basicAddr = '0x00'
    const sharedSalt = 'salt'
    const prepareRecipientInMessageMsg = async (msg:string)=>{
        jest.spyOn(IotaCatSDKObj,'_groupNameToGroupMeta').mockImplementation((group:string)=>{
            return {
                groupName:group,
                schemaVersion: MessageCurrentSchemaVersion,
                messageType:MessageTypePrivate,
                authScheme:MessageAuthSchemeRecipeintInMessage,
            }
        })
        msgObject = await IotaCatSDKObj.prepareSendMessage({type:ShimmerBech32Addr,addr:basicAddr},'dummy',msg)
        msgObject!.recipients.push({addr:basicAddr,mkey:basicAddr})
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
        msgObject = await IotaCatSDKObj.prepareSendMessage({type:ShimmerBech32Addr,addr:basicAddr},'dummy',msg)
    }
    beforeEach(()=>{

        
    })
    test('test prepareSendMessage for RecipientInMessageMsg', async () => {
        await prepareRecipientInMessageMsg(basicMsg)
        expect(msgObject).toBeDefined()
    })
    test('test prepareSendMessage for RecipientOnChainMsg', async () => {
        await prepareRecipientOnChainMsg(basicMsg)
        expect(msgObject).toBeDefined()
    })
    test('test serializeMessage for RecipientInMessageMsg', async () => {
        await prepareRecipientInMessageMsg(basicMsg)
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!,{encryptUsingPublicKey:async (key,data)=>data})
        expect(msgBytes).toBeDefined()
    })
    test('test serializeMessage for RecipientOnChainMsg', async () => {
        await prepareRecipientOnChainMsg(basicMsg)
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!,{groupSaltResolver:async (groupId:string)=>sharedSalt})
        expect(msgBytes).toBeDefined()
    })
    test('test deserializeMessage for RecipientInMessageMsg', async () => {
        await prepareRecipientInMessageMsg(basicMsg)
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!,{encryptUsingPublicKey:async (key,data)=>data})
        const msgObject2 = await IotaCatSDKObj.deserializeMessage(msgBytes,basicAddr,{decryptUsingPrivateKey:async (data)=>data})
        expect(msgObject2).toBeDefined()
        expect(msgObject2!.data[0]).toBe(basicMsg)
    })
    test('test deserializeMessage for RecipientOnChainMsg', async () => {
        await prepareRecipientOnChainMsg(basicMsg)
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!,{groupSaltResolver:async (groupId:string)=>sharedSalt})
        const msgObject2 = await IotaCatSDKObj.deserializeMessage(msgBytes,basicAddr,{sharedOutputSaltResolver:async (outputId:string)=>sharedSalt})
        expect(msgObject2).toBeDefined()
        expect(msgObject2!.data[0]).toBe(basicMsg)
    })
    test('test random string for RecipientInMessageMsg', async() => {
        const randomStr = generateRandomString(32)
        await prepareRecipientInMessageMsg(randomStr)
        // manually set publickey
        IotaCatSDKObj.setPublicKeyForPreparedMessage(msgObject!,{[basicAddr]:basicAddr})
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!,{encryptUsingPublicKey:async (key,data)=>data})
        const msgObject2 = await IotaCatSDKObj.deserializeMessage(msgBytes,basicAddr,{decryptUsingPrivateKey:async (data)=>data})
        expect(msgObject2).toBeDefined()
        expect(msgObject2!.data[0]).toBe(randomStr)
    })
    test('test random string for RecipientOnChainMsg', async() => {
        const randomStr = generateRandomString(32)
        await prepareRecipientOnChainMsg(randomStr)
        // manually set publickey
        IotaCatSDKObj.setPublicKeyForPreparedMessage(msgObject!,{[basicAddr]:basicAddr})
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!,{groupSaltResolver:async (groupId:string)=>sharedSalt})
        const msgObject2 = await IotaCatSDKObj.deserializeMessage(msgBytes,basicAddr,{sharedOutputSaltResolver:async (outputId:string)=>sharedSalt})
        expect(msgObject2).toBeDefined()
        expect(msgObject2!.data[0]).toBe(randomStr)
    })
});