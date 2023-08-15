import { beforeEach, describe, expect, test, beforeAll } from '@jest/globals';
import { IotaCatSDKObj, IMRecipient } from '../src';

describe('misc test', () => {
    const recipientList:IMRecipient[] = [{addr:'0x01',mkey:'03'},{addr:'0x02',mkey:'04'}]
    const groupId = IotaCatSDKObj._groupToGroupId('iceberg')
    test('test recipient serialization and deserialization', () => {
        const payload = IotaCatSDKObj.serializeRecipientList(recipientList, groupId!)
        const recipientList2 = IotaCatSDKObj.deserializeRecipientList(payload)
        const recipientList3 = recipientList.map(r => ({addr:IotaCatSDKObj.getAddressHashStr(r.addr),mkey:r.mkey}))
        expect(recipientList2).toEqual(recipientList3)
    });
});