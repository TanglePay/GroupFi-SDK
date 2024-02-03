import { beforeEach, describe, expect, test, beforeAll } from '@jest/globals';
import { Bech32Helper,ED25519_ADDRESS_TYPE } from '@iota/iota.js';
import { Converter } from '@iota/util.js';
import { Ed25519Address } from '@iota/iota.js';
describe('address length test', () => {
    beforeEach(()=>{
        
    })
    test('tmp', () => {
        const publicKeyHex = '0x7dc17c5b15d6dae133e78d6a315b308694c6aba719f7a73a1aeeb7ed86f88d0e';
        const publicKey = Converter.hexToBytes(publicKeyHex)
        const indexEd25519Address = new Ed25519Address(publicKey);
        const indexPublicKeyAddress = indexEd25519Address.toAddress();
        console.log("####################\tAddress Ed25519", Converter.bytesToHex(indexPublicKeyAddress, true));
        console.log(
            "##################\tAddress Bech32",
            Bech32Helper.toBech32(ED25519_ADDRESS_TYPE, indexPublicKeyAddress, 'smr')
        );
    });
    test('test length', () => {
        const bech32Address = 'smr1qzjh56yyjlwcm8pc9xccunkuage3xcae3trgrvmlzz8nts0rtym37stqddc'
        const res = Bech32Helper.fromBech32(bech32Address,'smr')
        const {
            addressType,
            addressBytes
        } = res!
        expect(addressType).toBe(0);
        expect(addressBytes.length).toBe(32);
    });
    test('test hex equal', () => {
        const bech32Address = 'smr1qqc9fkdqy2esmnnqkv3aylvalz05vjkfd0368hgjy3f2nfp4dvdk67a3xdt'
        const addressHex = '3054d9a022b30dce60b323d27d9df89f464ac96be3a3dd122452a9a4356b1b6d'
        const res = Bech32Helper.fromBech32(bech32Address,'smr')
        const {
            addressType,
            addressBytes
        } = res!
        const addressHexFromBech32 = Converter.bytesToHex(addressBytes)
        expect(addressHexFromBech32).toBe(addressHex);
    });
    test('test string equal', () => {
        const bech32addressExpected = 'smr1qqc9fkdqy2esmnnqkv3aylvalz05vjkfd0368hgjy3f2nfp4dvdk67a3xdt'
        const addressHex = '3054d9a022b30dce60b323d27d9df89f464ac96be3a3dd122452a9a4356b1b6d'
        const addressBytes = Converter.hexToBytes(addressHex)
        console.log('todoaddressBytes',addressBytes)
        const bech32address = Bech32Helper.toBech32(ED25519_ADDRESS_TYPE, addressBytes, 'smr');
        expect(bech32address).toBe(bech32addressExpected);
    });
});