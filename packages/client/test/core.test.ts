import { beforeEach, describe, expect, test, jest } from '@jest/globals';
import { encrypt, decrypt, getEphemeralSecretAndPublicKey, util, setCryptoJS, setHkdf, setIotaCrypto, asciiToUint8Array } from 'ecies-ed25519-js';
import { generateRandomString } from '../../../jest.base';
import { Bip39, Ed25519, Sha512, Bip32Path } from '@iota/crypto.js';
setIotaCrypto({
    Bip39,
    Ed25519,
    Sha512
})
import { IotaCatSDKObj } from 'iotacat-sdk-core';
import CryptoJS from 'crypto-js';
import hkdf from 'js-crypto-hkdf';
setHkdf(async (secret:Uint8Array, length:number, salt:Uint8Array)=>{
    const res = await hkdf.compute(secret, 'SHA-256', length, '',salt)
    return res.key;
})
setCryptoJS(CryptoJS)
describe('core test with key pair', () => {
    let secret_:Uint8Array
    let publicKey_:Uint8Array
    let publicAddr: string
    const tag = asciiToUint8Array('TAG')
    beforeEach(()=>{
        const {secret,publicKey} = getEphemeralSecretAndPublicKey()
        secret_ = secret
        publicKey_ = publicKey
        publicAddr = util.bytesToHex(publicKey_)
    })
    test('encryption then decryption, using key pair', async () => {

        const randomStr = generateRandomString(32)
        jest.spyOn(IotaCatSDKObj,'_groupIdToGroupMembers').mockImplementation((groupId:string)=>{
            return [publicAddr]
        })
        const msgObject = IotaCatSDKObj.prepareSendMessage(publicAddr,'dummy',randomStr)
        IotaCatSDKObj.setPublicKeyForPreparedMessage(msgObject!,{[publicAddr]:publicAddr})
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!, async (key,data)=>{
            const publicKey = util.hexToBytes(key)
            const encrypted = await encrypt(publicKey, data, tag)
            return encrypted.payload
        })
        const msgObject2 = await IotaCatSDKObj.deserializeMessage(msgBytes,publicAddr,async (data)=>{
            const decrypted = await decrypt(secret_, data, tag)
            return decrypted.payload
        })
        expect(msgObject2).toBeDefined()
        expect(msgObject2!.data[0]).toBe(randomStr)
    })
})
