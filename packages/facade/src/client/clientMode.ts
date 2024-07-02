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
import GroupfiWalletEmbedded from 'groupfi-walletembed';
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
  hexToBytes,
} from 'iotacat-sdk-utils';

import IotaSDK from 'tanglepaysdk-client';
import auxiliaryService from '../auxiliaryService';

const signText = "I acknowledge that I'm signing into GroupFi.If you did not initiate this sign-in, please disconnect your wallet immediately."

export class ShimmerModeRequestAdapter implements IRequestAdapter {
  private _bech32Address: string;
  _nodeUrlHint: string;

  _serialPromiseQueue = new SerialAsyncQueue();

  constructor(bech32Address: string, nodeUrlHint: string) {
    this._bech32Address = bech32Address;
    this._nodeUrlHint = nodeUrlHint;
  }
  async ed25519SignAndGetPublicKey(params: { message: string; pairX: PairX; }):Promise<{ signature: string; publicKey: string; }>{
    throw new Error('Method not implemented.');
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
    const res = await Promise.all([
      IotaSDK.request({
        method: 'iota_im_get_eth_proxy_account',
        params: {
          content: {
            addr: this._evmAddress,
            nodeUrlHint: this._nodeUrlHint,
          },
        },
      }),
      GroupfiWalletEmbedded.setup(this._nodeUrlHint),
    ]);
    return res[0] as { bech32Address: string; hexAddress: string };
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

    GroupfiWalletEmbedded.setupPair(pairX);
    return await decryptByPairX({ dataTobeDecrypted, pairX });
  }
  async ed25519SignAndGetPublicKey({message,pairX}:{message:string,pairX:PairX}):Promise<{signature:string, publicKey:string}> {
    
    if (!pairX) {
      throw new Error('ImpersonationMode decrypt pairX is undefined');
    }

    GroupfiWalletEmbedded.setupPair(pairX);
    return await signMessageAndGetPublicKey({message,pairX});
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

  private _nodeUrlHint: string;

  private _dappClient: any;

  constructor(evmAddress: string, nodeUrlHint: string, dappClient: any) {
    this._evmAddress = evmAddress;
    this._nodeUrlHint = nodeUrlHint;
    this._dappClient = dappClient;
    GroupfiWalletEmbedded.setup(this._nodeUrlHint);
  }

  async decryptPairX(params: { encryptedData: string }) {
    const signTextHex = utf8ToHex(signText, true)
    const res = await this._dappClient.request({
      method: 'personal_sign',
      params: [signTextHex, this._evmAddress!],
    });
    console.log('===>test decryptPairX publickey:', res)
    const test = GroupfiWalletEmbedded.decryptDataUsingPassword(params.encryptedData, res)
    console.log('===>test decryptPairX res', test)
    return GroupfiWalletEmbedded.decryptDataUsingPassword(params.encryptedData, res)
    // const res = await this._dappClient.request({
    //   method: 'eth_decrypt',
    //   params: [params.encryptedData, this._evmAddress!],
    // });
    // console.log('===> Groupfi facade res', res);
    // return res;
    // return (await window.ethereum.request({
    //   method: 'eth_decrypt',
    //   params: [params.encryptedData, this._evmAddress!],
    // })) as string;
  }

  async registerPairX(metadataObjWithSignature: Object): Promise<string> {
    try {
      const body = JSON.stringify(metadataObjWithSignature);
      
      const res = await auxiliaryService.register(body);

      if (res.result) {
        return res.proxy_account;
      } else {
        throw new Error('Failed to register pairX');
      }
    } catch (error) {
      throw error
    }
  }


  async ethSign(params: { dataToBeSignedHex: string }): Promise<string> {
    const res = await this._dappClient.request({
      method: 'personal_sign',
      params: [params.dataToBeSignedHex, this._evmAddress!],
    });
    return res;
    // const res = await window.ethereum.request({
    //   method: 'personal_sign',
    //   params: [params.dataToBeSignedHex, this._evmAddress!],
    // });
    // return res;
  }

  async getEncryptionPublicKey(): Promise<string> {
    const signTextHex = utf8ToHex(signText, true)
    const res = await this._dappClient.request({
      method: 'personal_sign',
      params: [signTextHex, this._evmAddress!],
    });
    console.log('===>test: getEncryptionPublicKey', res)
    return res
    // const res = (await this._)
    // const res = (await this._dappClient.request({
    //   method: 'eth_getEncryptionPublicKey',
    //   params: [this._evmAddress],
    // })) as string;
    // // const res = (await window.ethereum.request({
    // //   method: 'eth_getEncryptionPublicKey',
    // //   params: [this._evmAddress],
    // // })) as string;
    // console.log('===> metamask getEncryptionPublicKey', res);
    // return res;
  }

  async decrypt({ dataTobeDecrypted, pairX }: IRequestAdapterDecryptParams) {
    if (!pairX) {
      throw new Error('DelegationMode decrypt pairX is undefined');
    }
    GroupfiWalletEmbedded.setupPair(pairX);
    return await decryptByPairX({ dataTobeDecrypted, pairX });
  }
  async ed25519SignAndGetPublicKey({message,pairX}:{message:string,pairX:PairX}):Promise<{signature:string, publicKey:string}> {
    
    if (!pairX) {
      throw new Error('DelegationMode decrypt pairX is undefined');
    }

    GroupfiWalletEmbedded.setupPair(pairX);
    return await signMessageAndGetPublicKey({message,pairX});
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

    console.log('===> mint proxy name nft body:', body);
    const start = Date.now();
    const res = await auxiliaryService.mintProxyNicknameNft(body);
    console.log('mintproxyname cost:', Date.now() - start);
    console.log('mintproxyname end', Date.now());

    console.log('===> mint proxy name nft res:', res);

    return res;
  }

  async sendTransaction({
    pairX,
    essence,
    essenceOutputsLength,
  }: IRequestAdapterSendTransationParams) {
    if (!pairX) {
      throw new Error('DelegationMode sendTransation pairX is undefined');
    }

    const ts = getCurrentEpochInSeconds();
    const tsBytes = strToBytes(ts.toString());

    const signedDataBytes = strToBytes(bytesToHex(essence, true) + ts);

    const signatureBytes = Ed25519.sign(pairX.privateKey, signedDataBytes);

    const body = JSON.stringify({
      publickey: bytesToHex(pairX.publicKey, true),
      data: bytesToHex(essence, true),
      ts,
      sign: bytesToHex(signatureBytes, true),
    });

    const { blockId, transactionId } = await auxiliaryService.sendTransaction(
      body
    );

    const { outputId, remainderOutputId } =
      GroupfiWalletEmbedded.getMetadataFromTransactionId(
        transactionId,
        essenceOutputsLength
      );

    return {
      blockId,
      transactionId,
      outputId,
      remainderOutputId,
    };
  }
}

async function decryptByPairX({
  dataTobeDecrypted,
  pairX,
}: {
  dataTobeDecrypted: Uint8Array;
  pairX: PairX;
}) {
  return await GroupfiWalletEmbedded.decryptAesKeyFromPayload(
    dataTobeDecrypted
  );
}

async function signMessageAndGetPublicKey({
  message,
  pairX,
}: {
  message: string;
  pairX: PairX;
}) {
  const signature = GroupfiWalletEmbedded.ed25519SignMessage(message);
  const publicKey = GroupfiWalletEmbedded.getEd25519PublicKey();
  return { signature, publicKey };
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
