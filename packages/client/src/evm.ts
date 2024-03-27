import { Converter } from '@iota/util.js';
import tweetnacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

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

  const hexEncryptedData = Converter.utf8ToHex(JSON.stringify(output), true)

  return hexEncryptedData
}
