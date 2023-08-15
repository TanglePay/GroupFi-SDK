import { beforeEach, describe, expect, test, jest } from '@jest/globals';
import { encrypt, decrypt, getEphemeralSecretAndPublicKey, util, setCryptoJS, setHkdf, setIotaCrypto } from 'ecies-ed25519-js';
import { Converter } from '@iota/util.js';
import { generateRandomString } from '../../../jest.base';
import { Bip39, Ed25519, Sha512, Bip32Path } from '@iota/crypto.js';
setIotaCrypto({
    Bip39,
    Ed25519,
    Sha512
})
import { IotaCatSDKObj, ShimmerBech32Addr, MessageAuthSchemeRecipeintInMessage } from 'iotacat-sdk-core';


import { MessageCurrentSchemaVersion, MessageTypePrivate, MessageAuthSchemeRecipeintOnChain } from 'iotacat-sdk-core/src';

import hkdf from 'js-crypto-hkdf';
setHkdf(async (secret:Uint8Array, length:number, salt:Uint8Array)=>{
    const res = await hkdf.compute(secret, 'SHA-256', length, '',salt)
    return res.key;
})
import CryptoJS from 'crypto-js';
setCryptoJS(CryptoJS)
describe('core test with key pair', () => {
    let secret_:Uint8Array
    let publicKey_:Uint8Array
    let publicAddr: string
    const tag = Converter.utf8ToBytes('TAG')
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
        jest.spyOn(IotaCatSDKObj,'_groupNameToGroupMeta').mockImplementation((group:string)=>{
            return {
                groupName:group,
                schemaVersion: MessageCurrentSchemaVersion,
                messageType:MessageTypePrivate,
                authScheme:MessageAuthSchemeRecipeintInMessage,
            }
        })
        const msgObject = await IotaCatSDKObj.prepareSendMessage({type:ShimmerBech32Addr,addr:publicAddr},'dummy',randomStr)
        msgObject!.recipients.push({addr:publicAddr,mkey:publicAddr})
        IotaCatSDKObj.setPublicKeyForPreparedMessage(msgObject!,{[publicAddr]:publicAddr})
        const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!, {encryptUsingPublicKey:async (key,data)=>{
            const publicKey = util.hexToBytes(key)
            const encrypted = await encrypt(publicKey, data, tag)
            return encrypted.payload
        }})
        const msgObject2 = await IotaCatSDKObj.deserializeMessage(msgBytes,publicAddr,{decryptUsingPrivateKey:async (data)=>{
            const decrypted = await decrypt(secret_, data, tag)
            return decrypted.payload
        }})
        expect(msgObject2).toBeDefined()
        expect(msgObject2!.data[0]).toBe(randomStr)
    })
})
