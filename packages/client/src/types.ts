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
  dataTobeDecrypted: string;
  nodeUrlHint: string;
  pairX?: PairX;
}

export interface IRequestAdapterSendTransationParams {
  essenceFinal: Uint8Array;
  transactionEssenceUrl?: string;
  pairX?: PairX;
  nodeUrlHint: string;
}

export interface IRequestAdapter {
  decrypt: (params: IRequestAdapterDecryptParams) => Promise<string>;

  sendTransation: (
    params: IRequestAdapterSendTransationParams
  ) => Promise<SendTransationRes>;
}

export interface IProxyModeRequest {
  getEncryptionPublicKey: () => Promise<string>;
  ethSign: (params: { dataToBeSignedHex: string, nodeUrlHint: string }) => Promise<string>;
}

export type IProxyModeRequestAdapter = IProxyModeRequest & IRequestAdapter
