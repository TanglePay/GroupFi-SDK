import { beforeEach, describe, expect, test, beforeAll, jest } from '@jest/globals';
import { NodePowProvider } from "@iota/pow-node.js";
import '../../../fetchPolyfill'
import IotaCatClient from '../src';
describe('fetchPollyFill test', () => {
    beforeAll(async ()=>{
        await IotaCatClient.setup(101,NodePowProvider)
    })
    test('test client initialized', async () => {
        expect(IotaCatClient._nodeInfo).toBeDefined()
    })

    /*
    test('test get public key via transaction id', async () => {
        const actualPublicKey = '0xa2c63800d0618e46d281a9174f43aac615190733bac522c6ca82d7dc3bcf73d8'
        const publicKey = await IotaCatClient._getPublicKeyFromLedger('0xefc3b709861e74fe5ffb12fdd7204fcae068580fb9d542f1e7e420b8beb71a7d')
        expect(publicKey).toBe(actualPublicKey)
    },15000)
*/
/*
    test('test get public key with data on disk', async () => {
        const fakeBech32address = 'rms1qpz7vlc6d4jm4248ge0zc2ytmjpvgwhyzjgqvxgsm2w6592jtm74jhrgeta'
        const fakePublicKey = 'test'
        const fakeDiskGet= jest.fn<(key:string)=>Promise<string>>().mockImplementation(async (key:string)=>{
            return fakePublicKey
        })
        const fakeDiskSet = jest.fn<any>()
        const prefix = 'test'
        IotaCatClient.setupStorage({
            prefix,
            get:fakeDiskGet,
            set:fakeDiskSet,
        })
        const publicKey = await IotaCatClient.getPublicKey(fakeBech32address)
        expect(publicKey).toBe(fakePublicKey)
        expect(fakeDiskGet).toHaveBeenCalledWith(prefix+fakeBech32address)
        expect(fakeDiskGet).toHaveBeenCalledTimes(1)
        expect(fakeDiskSet).not.toHaveBeenCalled()
    })
*/
    test('test get public key without data on disk', async () => {
        const fakeBech32address = 'rms1qqlrzyfnxzd0ck5gg0r9h7nhvx089jcefm656kzxddj55l2ecrxyc9c3wr5'
        const fakePublicKey = 'test'
        const disk = {} as any
        const fakeDiskGet= jest.fn<(key:string)=>Promise<string>>().mockImplementation(async (key:string)=>{
            return disk[key]
        })
        const fakeDiskSet = jest.fn<(key:string, value:string)=>Promise<void>>().mockImplementation(async (key:string, value:string)=>{
            disk[key] = value
        })
        const prefix = 'test'
        IotaCatClient.setupStorage({
            prefix,
            get:fakeDiskGet,
            set:fakeDiskSet,
        })
        jest.spyOn(IotaCatClient,'_getPublicKeyFromLedger').mockImplementation(async (address:string)=>{
            return fakePublicKey
        })
        const publicKey = await IotaCatClient.getPublicKey(fakeBech32address)
        expect(publicKey).toBe(fakePublicKey)
        //expect(fakeDiskGet).toHaveBeenCalledWith(prefix+fakeBech32address)
        //expect(fakeDiskGet).toHaveBeenCalledTimes(1)
        //expect(fakeDiskSet).toHaveBeenCalledWith(prefix+fakeBech32address,fakePublicKey)
        //expect(fakeDiskSet).toHaveBeenCalledTimes(1)
    })

})

