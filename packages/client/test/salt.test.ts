import { beforeEach, describe, expect, test, beforeAll, jest } from '@jest/globals';
import { IotaCatSDKObj, IMMessage, IMRecipient, ShimmerBech32Addr, MessageAuthSchemeRecipeintOnChain, MessageCurrentSchemaVersion, MessageTypePrivate, MessageAuthSchemeRecipeintInMessage } from 'iotacat-sdk-core/src';
import { encrypt, decrypt, getEphemeralSecretAndPublicKey, util, setCryptoJS, setHkdf, setIotaCrypto, asciiToUint8Array } from 'ecies-ed25519-js';
import { Bip39, Ed25519, Sha512, Bip32Path } from '@iota/crypto.js';
import { NodePowProvider } from "@iota/pow-node.js";
import IotaCatClient from '../src';
setIotaCrypto({
    Bip39,
    Ed25519,
    Sha512
})
const tag = asciiToUint8Array('IOTACAT')
describe('salt from shared test', () => {
    beforeAll(async ()=>{
        await IotaCatClient.setup(102,NodePowProvider)
    })
    test('test publickey correct', async () => {
        const hexSeed = 'd584e90a0d2acf7a5277fe80add594dbd07a4dc6512649305ec34acbcd9b065f432518dbbfbf02b85ff764ca72dbd053f2cdd82082565ed9788a1eb70d1adc46'
        const publicKeyFromLog = '2781397944b61dd48cde5224da0a20354663d5638810f076a6e0310a7d60dcd6'
        // {key: '76586b97846e8ce1ce351ee38d780829ab682a0ef0531d5bb0…Tn1ZGvJGWe0Kl6tjf8ae5pp6TupHhDDJ3gbGgK2YAeNnh3IpM', addr: 'smr1qzjh56yyjlwcm8pc9xccunkuage3xcae3trgrvmlzz8nts0rtym37stqddc'}
        await IotaCatClient.setHexSeed(hexSeed)
        const publicKeyBytes = IotaCatClient._walletKeyPair!.publicKey
        const publicKey = util.bytesToHex(publicKeyBytes)
        expect(publicKey).toBe(publicKeyFromLog)
    })

    test('test salt from recipient', async () => {
        const address = 'smr1qzjh56yyjlwcm8pc9xccunkuage3xcae3trgrvmlzz8nts0rtym37stqddc';
        const hexSeed = 'd584e90a0d2acf7a5277fe80add594dbd07a4dc6512649305ec34acbcd9b065f432518dbbfbf02b85ff764ca72dbd053f2cdd82082565ed9788a1eb70d1adc46'
        await IotaCatClient.setHexSeed(hexSeed)
        const recipients:IMRecipient[] = [{addr: 'smr1qzjh56yyjlwcm8pc9xccunkuage3xcae3trgrvmlzz8nts0rtym37stqddc', mkey: '8407ff4072825996154c8bfc6f41fa04164dbe9e48fa13c923…YMLU4n8ps8VFPH3hLEiCJL+k6uL+wtp6M42z89YXrH0Q8/66L'}];
        let salt:string|undefined = undefined
        for (const recipient of recipients) {
            if (!recipient.mkey) continue
            if (recipient.addr !== address) continue
            const decrypted = await decrypt(IotaCatClient._walletKeyPair!.privateKey, recipient.mkey, tag)
            salt = decrypted.payload
        }

        expect(salt).toBeDefined()
    })
})
