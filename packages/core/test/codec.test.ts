import { beforeEach, describe, expect, test, beforeAll } from '@jest/globals';
import { AddressHashLength, IMRecipient } from '../src';
import { serializeRecipient, deserializeRecipient, serializeIMMessage, deserializeIMMessage } from '../src/codec';
import { IotaCatSDKObj, IMMessage, ShimmerBech32Addr, MessageAuthSchemeRecipeintOnChain, MessageCurrentSchemaVersion, MessageTypePrivate, MessageAuthSchemeRecipeintInMessage } from '../src';

import { WriteStream, ReadStream } from '@iota/util.js'

describe('codec test', () => {
    test('test address hash length', () => {
        const addr = '0x01'
        const addrHash = IotaCatSDKObj.getAddressHashStr(addr)
        expect(addrHash.length).toBe(2*AddressHashLength)
    });

    test('test one recipient intermediate serialization and deserialization', () => {
        const recipient:IMRecipient = {addr:'0x01',mkey:'03'} //[{addr:'0x01',mkey:'03'},{addr:'0x02',mkey:'04'}]
        const recipientIntermediate = IotaCatSDKObj._compileRecipient(recipient)
        const ws = new WriteStream()
        serializeRecipient(ws, recipientIntermediate)
        const bytes = ws.finalBytes()
        const rs = new ReadStream(bytes)
        const recipientIntermediate2 = deserializeRecipient(rs)
        expect(recipientIntermediate2).toEqual(recipientIntermediate)
    });

    test('test one recipient serialization and deserialization', () => {
        const recipient:IMRecipient = {addr:'0x01',mkey:'03'} //[{addr:'0x01',mkey:'03'},{addr:'0x02',mkey:'04'}]
        const recipientIntermediate = IotaCatSDKObj._compileRecipient(recipient)
        const ws = new WriteStream()
        serializeRecipient(ws, recipientIntermediate)
        const bytes = ws.finalBytes()
        const rs = new ReadStream(bytes)
        const recipientIntermediate2 = deserializeRecipient(rs)
        const recipient2 = IotaCatSDKObj._decompileRecipient(recipientIntermediate2)
        recipient.addr = IotaCatSDKObj.getAddressHashStr(recipient.addr)
        expect(recipient2).toEqual(recipient)
    });

    test('test recipient list serialization and deserialization', () => {
        const recipientList:IMRecipient[] = [{addr:'0x01',mkey:'03'},{addr:'0x02',mkey:'04'}]
        const groupId = IotaCatSDKObj._groupToGroupId('iceberg')
        const payload = IotaCatSDKObj.serializeRecipientList(recipientList, groupId!)
        const recipientList2 = IotaCatSDKObj.deserializeRecipientList(payload)
        const recipientList3 = recipientList.map(r => ({addr:IotaCatSDKObj.getAddressHashStr(r.addr),mkey:r.mkey}))
        expect(recipientList2).toEqual(recipientList3)
    });

    test('test one message serialization and deserialization, with recipients on chain', () => {
        const group = 'iceberg'
        const groupId = IotaCatSDKObj._groupToGroupId(group)
        const message:IMMessage = {
            schemaVersion: MessageCurrentSchemaVersion,
            messageType:MessageTypePrivate,
            authScheme:MessageAuthSchemeRecipeintOnChain,
            groupId:groupId!,
            recipientOutputid:'0xc6b3be90456dcde47e859806c973299cead6d5e9ca7a7d5130a2b71bb4425b5a0000',
            data:'hehe'
        }
        const messageIntermediate = IotaCatSDKObj._compileMessage(message)
        const ws = new WriteStream()
        serializeIMMessage(ws, messageIntermediate)
        const bytes = ws.finalBytes()
        const rs = new ReadStream(bytes)
        const messageIntermediate2 = deserializeIMMessage(rs)
        const message2 = IotaCatSDKObj._decompileMessage(messageIntermediate2)
        expect(message2).toEqual(message)
    });

})