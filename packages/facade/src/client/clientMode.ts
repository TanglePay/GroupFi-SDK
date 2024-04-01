import {
  DelegationMode,
  IRequestAdapter,
  ImpersonationMode,
  PairX,
  SendTransationRes,
  ShimmerMode,
  IRequestAdapterDecryptParams,
  IRequestAdapterSendTransationParams,
  IProxyModeRequest,
} from 'groupfi-sdk-client';
import { IotaCatSDKObj, IOTACATTAG } from 'iotacat-sdk-core';
import {
  retrieveUint8ArrayFromBlobURL,
  strToBytes,
} from 'iotacat-sdk-utils';
import { decryptOneOfList } from 'ecies-ed25519-js';
import IotaSDK from 'tanglepaysdk-client';

export class ImpersonationModeRequestAdapter
  implements IRequestAdapter, IProxyModeRequest
{
  private _evmAddress: string;

  constructor(evmAddress: string) {
    this._evmAddress = evmAddress;
  }

  async getProxyAccount() {
    return (await IotaSDK.request({
      method: 'iota_im_get_eth_proxy_account',
      params: {
        content: {
          addr: this._evmAddress,
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
        },
      },
    })) as string;
  }

  async getEncryptionPublicKey(): Promise<string> {
    console.log('===> getEncryptionPublicKey this', this)
    return (await IotaSDK.request({
      method: 'iota_im_eth_get_encryption_public_key',
      params: {
        content: {
          addr: this._evmAddress,
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

  async sendTransation({
    nodeUrlHint,
    transactionEssenceUrl,
  }: IRequestAdapterSendTransationParams) {
    if (!transactionEssenceUrl) {
      throw new Error('transactionEssenceUrl is undefined.');
    }
    return await sendTransationByTanglePay({
      transactionEssenceUrl,
      nodeUrlHint,
      addr: this._evmAddress,
    });
  }
}

export class ShimmerModeRequestAdapter implements IRequestAdapter {
  private _bech32Address: string;
  constructor(bech32Address: string) {
    this._bech32Address = bech32Address;
  }

  async decrypt({
    dataTobeDecrypted,
    nodeUrlHint,
  }: IRequestAdapterDecryptParams) {
    return (await IotaSDK.request({
      method: 'iota_im_decrypt_key',
      params: {
        content: {
          addr: this._bech32Address,
          recipientPayloadUrl: dataTobeDecrypted,
          nodeUrlHint,
        },
      },
    })) as string;
  }

  async sendTransation({
    nodeUrlHint,
    transactionEssenceUrl,
  }: IRequestAdapterSendTransationParams) {
    if (!transactionEssenceUrl) {
      throw new Error('transactionEssenceUrl is undefined.');
    }
    return await sendTransationByTanglePay({
      transactionEssenceUrl,
      nodeUrlHint,
      addr: this._bech32Address,
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

  async registerPairX(params: {pairX: PairX}): Promise<string> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve('signature from metamask');
      }, 1000);
    });
  }

  async ethSign(params: { dataToBeSignedHex: string }): Promise<string> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve('signature from metamask');
      }, 1000);
    });
  }

  async getEncryptionPublicKey(): Promise<string> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve('EncryptionPublicKey from metamask');
      }, 1000);
    });
  }

  async decrypt({ dataTobeDecrypted, pairX }: IRequestAdapterDecryptParams) {
    if (!pairX) {
      throw new Error('ImpersonationMode decrypt pairX is undefined');
    }
    return await decryptByPairX({ dataTobeDecrypted, pairX });
  }

  //TODO
  async sendTransation({ pairX }: IRequestAdapterSendTransationParams) {
    if (!pairX) {
      throw new Error('DelegationMode sendTransation pairX is undefined');
    }
    return '' as any;
  }
}

async function decryptByPairX({
  dataTobeDecrypted,
  pairX,
}: {
  dataTobeDecrypted: string;
  pairX: PairX;
}) {
  const tag = strToBytes(IOTACATTAG);
  const payload = await retrieveUint8ArrayFromBlobURL(dataTobeDecrypted);
  const list = [{ payload }];
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

async function sendTransationByTanglePay({
  nodeUrlHint,
  transactionEssenceUrl,
  addr,
}: {
  addr: string;
  transactionEssenceUrl?: string;
  nodeUrlHint: string;
}) {
  if (!transactionEssenceUrl) {
    throw new Error('transactionEssenceUrl is undefined.');
  }
  return (await IotaSDK.request({
    method: 'iota_im_sign_and_send_transaction_to_self',
    params: {
      content: {
        addr,
        transactionEssenceUrl,
        nodeUrlHint,
      },
    },
  })) as SendTransationRes;
}
