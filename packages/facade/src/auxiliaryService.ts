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
  }
];

export class AuxiliaryService {
  _domain = 'testapi.groupfi.ai';

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

    return json.data[chainId]
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
}