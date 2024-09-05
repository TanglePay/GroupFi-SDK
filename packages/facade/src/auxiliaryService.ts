import { PairX } from './types';

export const config = [
  {
    chainId: 148,
    tpNodeId: 5,
    name: 'Shimmer EVM',
    url: 'https://json-rpc.evm.shimmer.network/',
    token: 'SMR',
  },
  {
    chainId: 56,
    tpNodeId: 4,
    name: 'BSC',
    url: 'https://bsc-dataseed.binance.org/',
    token: 'BNB',
  },
  {
    chainId: 137,
    tpNodeId: 7,
    name: 'Polygon',
    url: 'https://polygon-rpc.com/',
    token: 'MATIC',
  },
];

export class AuxiliaryService {
  _domain = process.env.AUXILIARY_SERVICE_DOMAIN;

  async fetchSMRPrice(chainId: number) {
    const res = await fetch(`https://${this._domain}/smr_price`);
    const json = (await res.json()) as {
      data: {
        [key: string]: {
          contract: string;
          token: string;
          price: string;
          deci: number;
        };
      };
    };

    return json.data[chainId];
  }

  async fetchProxyAccount(publicKey: string): Promise<string | undefined> {
    const res = await fetch(
      `https://${this._domain}/proxy/account?publickey=${publicKey}`
    );
    const jsonRes = (await res.json()) as {
      result: boolean;
      proxy_account?: string;
    };
    if (jsonRes.result) {
      return jsonRes.proxy_account!;
    } else {
      return undefined;
    }
  }

  async sendTransaction(body: string): Promise<{
    blockId: string;
    result: boolean;
    transactionId: string;
  }> {
    console.log('send proxy tx body:', body);
    const res = await fetch(`https://${this._domain}/proxy/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body,
    });
    const json = (await res.json()) as {
      result: boolean;
      blockid: string;
      transactionid: string;
    };
    console.log('send proxy tx res:', json);
    return {
      result: json.result,
      blockId: json.blockid,
      transactionId: json.transactionid,
    };
  }

  async register(body: string) {
    const res = await fetch(`https://${this._domain}/proxy/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body,
    });

    const resJson = (await res.json()) as {
      result: boolean;
      proxy_account: string;
    };

    return resJson;
  }

  async mintProxyNicknameNft(body: string): Promise<{
    result: boolean;
    blockId?: string;
    errCode?: number;
    reason?: string;
  }> {
    const res = await fetch(`https://${this._domain}/proxy/mint_nicknft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body,
    });
    const json = (await res.json()) as {
      result: boolean;
      block_id: string;
      'err-msg'?: string;
      'err-code'?: number;
    };
    if (!json.result) {
      return {
        result: false,
        errCode: json['err-code'],
        reason: json['err-msg'],
      } as { result: boolean; reason: string };
    }
    return {
      result: true,
      blockId: json.block_id,
    };
  }

  async mintNicknameNFT(
    address: string,
    name: string
  ): Promise<{
    result: boolean;
    blockId?: string;
    errCode?: number;
    reason?: string;
  }> {
    const res = await fetch(
      `https://${this._domain}/mint_nicknft?address=${address}&name=${name}`
    );
    const json = (await res.json()) as {
      result: boolean;
      block_id: string;
      'err-msg'?: string;
      'err-code'?: number;
    };
    if (!json.result) {
      return {
        result: false,
        errCode: json['err-code'],
        reason: json['err-msg'],
      } as { result: boolean; reason: string };
    }
    // const blockMetadata = await IotaCatSDKObj.waitBlock(json.block_id!)
    return {
      result: true,
      blockId: json.block_id,
    };
  }

  async getChainList(): Promise<ChainList> {
    const rawRes = await fetch(`https://${this._domain}/chains`);
    const json = (await rawRes.json()) as {
      [chainId: string]: {
        chainid: number;
        name: string;
        Symbol: string;
        decimal: number;
        contract: string;
        pic_uri: string;
      };
    };
    const res: ChainList = {};
    for (let key in json) {
      const value = json[key];
      res[key] = {
        chainId: value.chainid,
        name: value.name,
        symbol: value.Symbol,
        decimal: value.decimal,
        contract: value.contract,
        picUri: value.pic_uri,
      };
    }

    return res;
  }

  async getChainRpc(chainId: number): Promise<string | undefined> {
    const rawRes = await fetch(
      `https://${this._domain}/rpc?chainid=${chainId}`
    );
    const rawJson = (await rawRes.json()) as {
      result: boolean;
      rpc: string;
    };
    if (rawJson.result) {
      return rawJson.rpc;
    }
    return undefined;
  }
}

export type ChainList = {
  [chainId: string]: ChainInfo;
};

export interface ChainInfo {
  chainId: number;
  name: string;
  symbol: string;
  decimal: number;
  contract: string;
  picUri: string;
}

const instance = new AuxiliaryService();
export default instance;
