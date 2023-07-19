import { beforeEach, describe, expect, test, beforeAll } from '@jest/globals';
import { IotaCatSDKObj, IMRecipient } from '../src';

describe('misc test', () => {
    const recipientList:IMRecipient[] = [{addr:'0x01',mkey:'test1'},{addr:'0x02',mkey:'test2'}]
    const groupId = IotaCatSDKObj._groupToGroupId('iceberg')
    test('test recipient serialization and deserialization', () => {
        const payload = IotaCatSDKObj.serializeRecipientList(recipientList, groupId!)
        const recipientList2 = IotaCatSDKObj.deserializeRecipientList(payload)
        expect(recipientList2).toEqual(recipientList)
    });
});