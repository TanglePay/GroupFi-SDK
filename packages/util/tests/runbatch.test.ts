import { beforeEach, describe, expect, test, jest } from '@jest/globals';
import { runBatch } from '../src/runbatch';
describe('runbatch test', () => {
    test('runbatch test', async () => {
        const n = 100;   
        const res = await runBatch(Array(n).fill(0).map((_,idx)=>async ()=>idx), 10)
        expect(res).toEqual(Array(n).fill(0).map((_,idx)=>idx));
    });
});