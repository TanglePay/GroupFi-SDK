declare global {
  interface Window {
    ethereum: any
  }
}
export const TanglePayWallet = 1
export const MetaMaskWallet = 2
export type WalletType = typeof TanglePayWallet | typeof MetaMaskWallet

export interface TransactionRes {
  blockId: string;
  outputId: string;
}

export interface RecommendGroup {
  groupId: string;
  groupName: string;
  qualifyType: string;
}

export const ShimmerMode = 1;
export const ImpersonationMode = 2;
export const DelegationMode = 3;
export type Mode =
  | typeof ShimmerMode
  | typeof ImpersonationMode
  | typeof DelegationMode;


export const TanglePayScenery = 1
export const MetaMaskScenery = 2
export type SceneryType = typeof TanglePayScenery | typeof MetaMaskScenery

export type PrefixedHexString = string

export interface PairX {
    privateKey: Uint8Array
    publicKey: Uint8Array
}

export interface ModeInfo {
  pairX?: PairX,
  detail?: ModeDetail
}

export interface ModeDetail {
  account: string
}

export interface RegisteredInfo {
  pairX?: PairX
  [ImpersonationMode]?: ModeDetail
  [DelegationMode]?: ModeDetail
}

export interface Profile {
  chainId: number
  name: string
  avatar?: string
  isActive?: boolean
}