import { beforeEach, describe, expect, test, beforeAll } from '@jest/globals';
import { LRUCache, cacheGet, cachePut, makeLRUCache } from '../src';

describe('misc test', () => {
    let lrucache:LRUCache<string>
    beforeEach(()=>{
        lrucache = makeLRUCache<string>(3);
    })
    test('test set one get one', () => {
        const key = 'a';
        const val = 'a';
        cachePut(key, val, lrucache);
        const valGet = cacheGet(key, lrucache);
        expect(valGet).toBe(val);
    });
    
    test('test set one get one with different key', () => {
        const key = 'a';
        const val = 'a';
        cachePut(key, val, lrucache);
        const differentKey = 'b';
        const valGet = cacheGet(differentKey, lrucache);
        expect(valGet).toBe(undefined);
    });

    // test set four, first is evicted
    test('test set four, first is evicted', () => {
        const kvMap = {
            a: 'a',
            b: 'b',
            c: 'c',
            d: 'd'
        }
        for (const key in kvMap) {
            // @ts-ignore
            cachePut(key, kvMap[key], lrucache);
        }
        const valGet = cacheGet('a', lrucache);
        expect(valGet).toBe(undefined);
    });

});