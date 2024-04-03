import { INftOutput } from '@iota/iota.js';

export const ShimmerMode = 1;
export const ImpersonationMode = 2;
export const DelegationMode = 3;
export type Mode =
  | typeof ShimmerMode
  | typeof ImpersonationMode
  | typeof DelegationMode;

export interface PairX {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface SendTransationRes {
  blockId: string;
  outputId: string;
  transactionId: string;
  remainderOutputId?: string | undefined;
}

export interface IRequestAdapterDecryptParams {
  dataTobeDecrypted: Uint8Array;
  pairX?: PairX;
}

export interface IRequestAdapterSendTransationParams {
  essence: Uint8Array;
  pairX?: PairX;
}

export interface IRequestAdapter {
  decrypt: (params: IRequestAdapterDecryptParams) => Promise<string>;

  sendTransaction: (
    params: IRequestAdapterSendTransationParams
  ) => Promise<SendTransationRes>;
}

export interface IProxyModeRequest {
  getEncryptionPublicKey: () => Promise<string>;
  ethSign: (params: { dataToBeSignedHex: string}) => Promise<string>;
  decryptPairX: (params: {encryptedData: string}) => Promise<string> 
}

export type IProxyModeRequestAdapter = IProxyModeRequest & IRequestAdapter
