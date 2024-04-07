export class AuxiliaryService {
  _domain = 'api.groupfi.ai'

  async fetchEthPrice() {

  }

  // async fetchTPEVMConfig() {
  //   const res = 
  // }

  async mintNicknameNFT(address: string, name: string): Promise<{
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