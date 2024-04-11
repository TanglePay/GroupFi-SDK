import {
  IRequestAdapter,
  PairX,
  SendTransationRes,
  IRequestAdapterDecryptParams,
  IRequestAdapterSendTransationParams,
  IProxyModeRequest,
} from 'groupfi-sdk-client';
import { Ed25519 } from '@iota/crypto.js';
import { IotaCatSDKObj, IOTACATTAG } from 'iotacat-sdk-core';
import {
  strToBytes,
  createBlobURLFromUint8Array,
  releaseBlobUrl,
  SerialAsyncQueue,
  bytesToHex,
  EthEncrypt,
  getCurrentEpochInSeconds,
  utf8ToHex,
  concatBytes,
} from 'iotacat-sdk-utils';
import { decryptOneOfList } from 'ecies-ed25519-js';
import IotaSDK from 'tanglepaysdk-client';
import auxiliaryService from '../auxiliaryService';

export class ShimmerModeRequestAdapter implements IRequestAdapter {
  private _bech32Address: string;
  _nodeUrlHint: string;

  _serialPromiseQueue = new SerialAsyncQueue();

  constructor(bech32Address: string, nodeUrlHint: string) {
    this._bech32Address = bech32Address;
    this._nodeUrlHint = nodeUrlHint;
  }

  async decrypt({ dataTobeDecrypted }: IRequestAdapterDecryptParams) {
    const recipientPayloadUrl = createBlobURLFromUint8Array(dataTobeDecrypted);

    const res = (await this._serialPromiseQueue.call(() =>
      IotaSDK.request({
        method: 'iota_im_decrypt_key',
        params: {
          content: {
            addr: this._bech32Address,
            recipientPayloadUrl,
            nodeUrlHint: this._nodeUrlHint,
          },
        },
      })
    )) as string;

    releaseBlobUrl(recipientPayloadUrl);
    return res;
  }

  async sendTransaction({ essence }: IRequestAdapterSendTransationParams) {
    if (!essence) {
      throw new Error('transactionEssenceUrl is undefined.');
    }
    return await sendTransactionByTanglePay({
      essence,
      nodeUrlHint: this._nodeUrlHint,
      addr: this._bech32Address,
    });
  }
}

export class ImpersonationModeRequestAdapter
  implements IRequestAdapter, IProxyModeRequest
{
  private _evmAddress: string;
  _nodeUrlHint: string;

  constructor(evmAddress: string, nodeUrlHint: string) {
    this._evmAddress = evmAddress;
    this._nodeUrlHint = nodeUrlHint;
  }

  async importProxyAccount() {
    const res = (await IotaSDK.request({
      method: 'iota_im_import_smr_proxy_account',
      params: {
        content: {
          addr: this._evmAddress,
          nodeUrlHint: this._nodeUrlHint,
        },
      },
    })) as string;
    return res;
  }

  async getProxyAccount() {
    return (await IotaSDK.request({
      method: 'iota_im_get_eth_proxy_account',
      params: {
        content: {
          addr: this._evmAddress,
          nodeUrlHint: this._nodeUrlHint,
        },
      },
    })) as { bech32Address: string; hexAddress: string };
  }

  async decryptPairX(params: { encryptedData: string }) {
    console.log('Enter client mode decryptPairX');
    return (await IotaSDK.request({
      method: 'iota_im_eth_decrypt',
      params: {
        content: {
          addr: this._evmAddress,
          nodeUrlHint: this._nodeUrlHint,
          encryptedData: params.encryptedData,
        },
      },
    })) as string;
  }

  async ethSign(params: { dataToBeSignedHex: string }) {
    const { dataToBeSignedHex } = params;
    return (await IotaSDK.request({
      method: 'iota_im_eth_personal_sign',
      params: {
        content: {
          addr: this._evmAddress,
          dataToBeSignedHex,
          nodeUrlHint: this._nodeUrlHint,
        },
      },
    })) as string;
  }

  async getEncryptionPublicKey(): Promise<string> {
    return (await IotaSDK.request({
      method: 'iota_im_eth_get_encryption_public_key',
      params: {
        content: {
          addr: this._evmAddress,
          nodeUrlHint: this._nodeUrlHint,
        },
      },
    })) as string;
  }

  async decrypt({ dataTobeDecrypted, pairX }: IRequestAdapterDecryptParams) {
    if (!pairX) {
      throw new Error('ImpersonationMode decrypt pairX is undefined');
    }
    return await decryptByPairX({ dataTobeDecrypted, pairX });
  }

  async sendTransaction({ essence }: IRequestAdapterSendTransationParams) {
    if (!essence) {
      throw new Error('essence is undefined.');
    }
    return await sendTransactionByTanglePay({
      essence,
      nodeUrlHint: this._nodeUrlHint,
      addr: this._evmAddress,
    });
  }
}

export class DelegationModeRequestAdapter
  implements IRequestAdapter, IProxyModeRequest
{
  private _evmAddress: string;

  constructor(evmAddress: string) {
    this._evmAddress = evmAddress;
  }

  async decryptPairX(params: { encryptedData: string }) {
    return (await window.ethereum.request({
      method: 'eth_decrypt',
      params: [params.encryptedData, this._evmAddress!],
    })) as string;
  }

  async registerPairX(params: { pairX: PairX }): Promise<string> {
    try {
      const { pairX } = params;

      const encryptionPublicKey = await this.getEncryptionPublicKey();

      const first32BytesOfPrivateKeyHex = bytesToHex(
        pairX.privateKey.slice(0, 32)
      );

      const encryptedPrivateKeyHex = EthEncrypt({
        publicKey: encryptionPublicKey,
        dataTobeEncrypted: first32BytesOfPrivateKeyHex,
      });

      const metadataObj = {
        encryptedPrivateKey: encryptedPrivateKeyHex,
        pairXPublicKey: bytesToHex(pairX.publicKey, true),
        evmAddress: this._evmAddress!,
        timestamp: getCurrentEpochInSeconds(),
        // 1: tp  2: mm
        scenery: 2,
      };

      const dataTobeSignedStr = [
        metadataObj.encryptedPrivateKey,
        metadataObj.evmAddress,
        metadataObj.pairXPublicKey,
        metadataObj.scenery,
        metadataObj.timestamp,
      ].join('');

      const dataToBeSignedHex = utf8ToHex(dataTobeSignedStr, true);

      const signature = await this.ethSign({ dataToBeSignedHex });

      const body = JSON.stringify({
        ...metadataObj,
        signature,
      });

      console.log('===> mm register PairX body', body);

      const res = await auxiliaryService.register(body);

      console.log('mm register PairX resJson', res);

      if (res.result) {
        return res.proxy_account;
      } else {
        throw new Error('Failed to register');
      }
    } catch (error) {
      throw error;
    }
  }

  async ethSign(params: { dataToBeSignedHex: string }): Promise<string> {
    const res = await window.ethereum.request({
      method: 'personal_sign',
      params: [params.dataToBeSignedHex, this._evmAddress!],
    });
    return res;
  }

  async getEncryptionPublicKey(): Promise<string> {
    const res = (await window.ethereum.request({
      method: 'eth_getEncryptionPublicKey',
      params: [this._evmAddress],
    })) as string;
    console.log('===> metamask getEncryptionPublicKey', res);
    return res;
  }

  async decrypt({ dataTobeDecrypted, pairX }: IRequestAdapterDecryptParams) {
    if (!pairX) {
      throw new Error('ImpersonationMode decrypt pairX is undefined');
    }
    return await decryptByPairX({ dataTobeDecrypted, pairX });
  }

  async mintProxyNicknameNft(params: { name: string; pairX: PairX }) {
    const { pairX, name } = params;

    const ts = getCurrentEpochInSeconds();
    const tsBytes = strToBytes(ts.toString());

    const nameBytes = strToBytes(name);
    const signedDataBytes = concatBytes(nameBytes, tsBytes);

    const signatureBytes = Ed25519.sign(pairX.privateKey, signedDataBytes);

    const body = JSON.stringify({
      publickey: bytesToHex(pairX.publicKey, true),
      data: name,
      ts,
      sign: bytesToHex(signatureBytes, true),
    });

    const res = auxiliaryService.mintProxyNicknameNft(body);

    console.log('===> mint proxy name nft body:', body)
    console.log('===> mint proxy name nft res:', res)

    return res
  }

  //TODO，还未调试
  async sendTransaction({
    pairX,
    essence,
  }: IRequestAdapterSendTransationParams) {
    if (!pairX) {
      throw new Error('DelegationMode sendTransation pairX is undefined');
    }

    const ts = getCurrentEpochInSeconds();
    const tsBytes = strToBytes(ts.toString());

    const signedDataBytes = concatBytes(essence, tsBytes);

    const signatureBytes = Ed25519.sign(pairX.privateKey, signedDataBytes);

    const body = JSON.stringify({
      publickey: bytesToHex(pairX.publicKey, true),
      data: bytesToHex(essence, true),
      ts,
      sign: bytesToHex(signatureBytes, true),
    });

    const res = await auxiliaryService.sendTransaction(body);
    console.log('==>proxy send transaction res', res);

    return res;
  }
}

async function decryptByPairX({
  dataTobeDecrypted,
  pairX,
}: {
  dataTobeDecrypted: Uint8Array;
  pairX: PairX;
}) {
  const tag = strToBytes(IOTACATTAG);
  const list = [{ dataTobeDecrypted }];
  const decrypted = await decryptOneOfList({
    receiverSecret: pairX.privateKey,
    payloadList: list,
    tag,
    idx: 0,
  });
  let salt;
  if (decrypted) {
    salt = decrypted.payload;
  }
  if (!salt) throw IotaCatSDKObj.makeErrorForSaltNotFound();
  return salt;
}

async function sendTransactionByTanglePay({
  nodeUrlHint,
  essence,
  addr,
}: {
  addr: string;
  essence: Uint8Array;
  nodeUrlHint: string;
}) {
  if (!essence) {
    throw new Error('transactionEssenceUrl is undefined.');
  }
  const transactionEssenceUrl = createBlobURLFromUint8Array(essence);
  const res = (await IotaSDK.request({
    method: 'iota_im_sign_and_send_transaction_to_self',
    params: {
      content: {
        addr,
        transactionEssenceUrl,
        nodeUrlHint,
      },
    },
  })) as SendTransationRes;

  releaseBlobUrl(transactionEssenceUrl);
  return res;
}
