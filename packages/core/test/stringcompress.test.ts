import { beforeEach, describe, expect, test, beforeAll } from '@jest/globals';
import LZString from 'lz-string';

describe('string compress test', () => {
    test('test string equal after compress then decompress', () => {
        const str = 'hehe'
        const compressed = LZString.compress(str)
        const decompressed = LZString.decompress(compressed)
        expect(decompressed).toBe(str)
    });
});