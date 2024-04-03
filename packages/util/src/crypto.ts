import { Converter } from '@iota/util.js';
import tweetnacl from 'tweetnacl';
import CryptoJS from 'crypto-js'
import naclUtil from 'tweetnacl-util';

function tpGetKeyAndIvV2(password:string) {
  // @ts-ignore
  const md5 = CryptoJS.MD5(password, 16).toString()
  const kdf1 = CryptoJS.PBKDF2(md5, md5, { keySize: 16, iterations: 1000 })
  const kdf2 = CryptoJS.PBKDF2(kdf1.toString(), kdf1.toString(), { keySize: 16, iterations: 1000 })
  return [kdf1, kdf2]
}

function tpGetKeyAndIv(password:string) {
  // @ts-ignore
  let key = CryptoJS.MD5(password, 16).toString().toLocaleUpperCase()
  let iv = CryptoJS.MD5(password.slice(0, parseInt('' + (password.length / 2))))
      .toString()
      .toLocaleUpperCase()
  const keyArray = CryptoJS.enc.Utf8.parse(key)
  const ivArray = CryptoJS.enc.Utf8.parse(iv)
  return [keyArray, ivArray]
}

export function tpDecrypt(seed:string, password:string, forceV2 = false){
  const V2_FLAG = 'TanglePayV2'
  const reg = new RegExp(`${V2_FLAG}$`)
  let isV2 = reg.test(seed) || forceV2 ? true : false
  seed = seed.replace(reg, '')
  const [key, iv] = isV2 ? tpGetKeyAndIvV2(password) : tpGetKeyAndIv(password)
  let encryptedHexStr = CryptoJS.enc.Hex.parse(seed)
  let srcs = CryptoJS.enc.Base64.stringify(encryptedHexStr)
  let decrypt = CryptoJS.AES.decrypt(srcs, key, { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 })
  let decryptedStr = decrypt.toString(CryptoJS.enc.Utf8)
  return decryptedStr.toString()
}

export function tpEncrypt(seed: string, password: string) {
  const V2_FLAG = 'TanglePayV2'
  const [key, iv] = tpGetKeyAndIvV2(password)
  let srcs = CryptoJS.enc.Utf8.parse(seed)
  let encrypted = CryptoJS.AES.encrypt(srcs, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
  })
  return encrypted.ciphertext.toString().toUpperCase() + V2_FLAG
}

export function EthDecrypt({
  privateKey,
  encryptedData,
}: {
  privateKey: Uint8Array;
  encryptedData: string;
}) {
  try {
    const strEncryptedData = Converter.hexToUtf8(encryptedData);
    const inputData = JSON.parse(strEncryptedData);

    const nonce = naclUtil.decodeBase64(inputData.nonce);
    const ephemeralPublicKey = naclUtil.decodeBase64(inputData.ephemPublicKey);
    const ciphertext = naclUtil.decodeBase64(inputData.ciphertext);

    const decryptedMessage = tweetnacl.box.open(
      ciphertext,
      nonce,
      ephemeralPublicKey,
      privateKey
    );

    if (!decryptedMessage) {
      throw new Error('Could not decrypt message');
    }
    console.log('===> decryptedMessage', decryptedMessage)
    const decryptedData = naclUtil.encodeUTF8(decryptedMessage);

    console.log('===> decryptedData', decryptedData)

    return decryptedData;

  }catch(error) {
    return undefined
  }
}

export function EthEncrypt({
  publicKey,
  dataTobeEncrypted,
}: {
  publicKey: string;
  dataTobeEncrypted: string;
}) {
  const ephemeralKeyPair = tweetnacl.box.keyPair();
  let pubKeyUInt8Array;
  try {
    pubKeyUInt8Array = naclUtil.decodeBase64(publicKey);
  } catch (err) {
    throw new Error('Bad public key');
  }
  const msgParamsUInt8Array = naclUtil.decodeUTF8(dataTobeEncrypted);
  const nonce = tweetnacl.randomBytes(tweetnacl.box.nonceLength);
  const encryptedMessage = tweetnacl.box(
    msgParamsUInt8Array,
    nonce,
    pubKeyUInt8Array,
    ephemeralKeyPair.secretKey
  );

  const output = {
    version: 'x25519-xsalsa20-poly1305',
    nonce: naclUtil.encodeBase64(nonce),
    ephemPublicKey: naclUtil.encodeBase64(ephemeralKeyPair.publicKey),
    ciphertext: naclUtil.encodeBase64(encryptedMessage),
  };

  const hexEncryptedData = Converter.utf8ToHex(JSON.stringify(output), true);

  return hexEncryptedData;
}
