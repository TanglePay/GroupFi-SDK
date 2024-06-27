import { beforeEach, describe, expect, test, jest } from '@jest/globals';
import { SHA256HashBytesReturnString } from '../src/index';
describe('SHA256HashBytesReturnString test', () => {
    test('SHA256HashBytesReturnString test', async () => {
        const groupId = '0x777eee48f33ecb51dae7d2fdd59cca03ec8ba628713a5ad112a548407e96e15f'
        const res = SHA256HashBytesReturnString(groupId)
        expect(res).toBe('441480db9942f0f2929dcaa365fe6f6a9362de4c5eb27daf0c1d9aaf21d198d9')
    });
});