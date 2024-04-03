import {
  DelegationMode,
  ImpersonationMode,
  PairX,
  ShimmerMode,
  GroupfiSdkClient,
} from 'groupfi-sdk-client';
import { generateSMRPair } from 'iotacat-sdk-utils';
import { ModeInfo, Mode, ModeDetail } from '../types';

import {
  ImpersonationModeRequestAdapter,
  DelegationModeRequestAdapter,
} from './clientMode';


export async function initialClient(params: {
  mode: Mode;
  modeInfo: ModeInfo;
  bech32Address?: string;
  evmAddress?: string;
  client: GroupfiSdkClient;
}): Promise<{ pairX: PairX; detail: ModeDetail } | undefined> {
  console.log('===> Facade initialClient', params);
  const { mode, modeInfo, bech32Address, evmAddress, client } = params;
  switch (mode) {
    case ShimmerMode: {
      if (!bech32Address) {
        throw new Error('ShimmerMode bech32Address is undefined');
      }
      await client.switchAddress(bech32Address, undefined);
      return undefined;
    }
    case ImpersonationMode: {
      if (!evmAddress) {
        throw new Error('ImpersonationMode evmAddress is undefined');
      }
      const adapter = client.getRequestAdapter() as ImpersonationModeRequestAdapter
      if (!modeInfo.detail) {
        // Need to register
        const {bech32Address} = await adapter.getProxyAccount();
        await client.switchAddress(bech32Address, modeInfo.pairX);
        const pairX = modeInfo.pairX ?? generateSMRPair();
        await client.registerTanglePayPairX({
          evmAddress: evmAddress!,
          pairX,
        });
        return {
          pairX: pairX,
          detail: {
            account: bech32Address,
          },
        };
      } else {
        await client.switchAddress(modeInfo.detail.account, modeInfo.pairX);
        return {
          pairX: modeInfo.pairX!,
          detail: modeInfo.detail,
        };
      }
    }
    case DelegationMode: {
      if (!evmAddress) {
        throw new Error('DelegationMode evmAddress is undefined');
      }
      const adapter = client.getRequestAdapter() as DelegationModeRequestAdapter
      const pairX = modeInfo.pairX ?? generateSMRPair();
      let smrAddress = modeInfo.detail?.account;
      if (!smrAddress) {
        // Need to register
        smrAddress = await adapter.registerPairX({ pairX });
      }
      client.switchAddress(smrAddress, pairX);
      return {
        pairX: pairX,
        detail: {
          account: smrAddress,
        },
      };
    }
  }
}
