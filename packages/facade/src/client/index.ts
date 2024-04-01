import {
  DelegationMode,
  IRequestAdapter,
  ImpersonationMode,
  PairX,
  SendTransationRes,
  ShimmerMode,
  IRequestAdapterDecryptParams,
  IRequestAdapterSendTransationParams,
  GroupfiSdkClient,
} from 'groupfi-sdk-client';
import { IotaCatSDKObj, IOTACATTAG } from 'iotacat-sdk-core';
import {
  generateSMRPair,
  retrieveUint8ArrayFromBlobURL,
  strToBytes,
} from 'iotacat-sdk-utils';
import { decryptOneOfList } from 'ecies-ed25519-js';
import IotaSDK from 'tanglepaysdk-client';
import { ModeInfo, Mode } from '../types';

import {
  ShimmerModeRequestAdapter,
  ImpersonationModeRequestAdapter,
  DelegationModeRequestAdapter,
} from './clientMode';

export async function initialClient(params: {
  mode: Mode;
  modeInfo: ModeInfo;
  bech32Address?: string;
  evmAddress?: string;
  client: GroupfiSdkClient;
}) {
  const { mode, modeInfo, bech32Address, evmAddress, client } = params;
  switch (mode) {
    case ShimmerMode: {
      if (!bech32Address) {
        throw new Error('ShimmerMode bech32Address is undefined');
      }
      const adapter = new ShimmerModeRequestAdapter(bech32Address);
      client.switchAdapter({
        adapter,
        mode,
        pairX: undefined,
      });
      await client.switchAddress(bech32Address);
      break;
    }
    case ImpersonationMode: {
      if (!evmAddress) {
        throw new Error('ImpersonationMode evmAddress is undefined');
      }
      const adapter = new ImpersonationModeRequestAdapter(evmAddress);
      client.switchAdapter({ adapter, mode, pairX: modeInfo.pairX });
      if (!modeInfo.detail) {
        // Need to register
        const proxyAddress = await adapter.getProxyAccount();
        await client.switchAddress(proxyAddress);
        const pairX = modeInfo.pairX ?? generateSMRPair();
        await client.registerTanglePayPairX({
          evmAddress: evmAddress!,
          pairX,
        });
      } else {
        await client.switchAddress(modeInfo.detail.account);
      }
      break;
    }
    case DelegationMode: {
      if (!evmAddress) {
        throw new Error('DelegationMode evmAddress is undefined');
      }
      const adapter = new DelegationModeRequestAdapter(evmAddress);
      const pairX = modeInfo.pairX ?? generateSMRPair();
      let smrAddress = modeInfo.detail?.account;
      if (!smrAddress) {
        // neet to register
        smrAddress = await adapter.registerPairX({ pairX });
      }
      client.switchAdapter({ mode, adapter, pairX });
      client.switchAddress(smrAddress);
    }
  }
}
