import { sleep } from ".";
import type { IndexerPluginClient,SingleNodeClient, INftOutput,IBasicOutput} from "@iota/iota.js";
export class Channel<T> {
    queue: T[] = [];
    numPushed = 0;
    numPolled = 0;
    async poll() {
      for (;;) {
        if (this.queue.length > 0) {
          const res = this.queue.shift();
          if (res) {
            this.numPolled++;
            return res;
          }
        } else {
          await sleep(100);
        }
      }
    }
    
    push(item:T) {
      this.queue.push(item);
      this.numPushed++;
    }
  
  }
  
  export const drainOutputIds = async <T>(args:{threadNum:number, isStop:boolean, inChannel:Channel<string>, outputIdResolver:(outputId:string)=>Promise< T |undefined>, outChannel:Channel<T>}) => {
    for (let i = 0; i < args.threadNum; i++) {
      setTimeout(async () => {
        while (!args.isStop) {
          const outputId = await args.inChannel.poll();
          if (outputId) {
            console.log('drainOutputIds',outputId)
            const output = await args.outputIdResolver(outputId);
            if (output) {
              args.outChannel.push(output);
            }
          } else {
            await sleep(1000);
          }
        }
      }, 0);
    }
  };
  const makeDrainOutputIdsContext = <T>(outputIdResolver:(outputId:string)=>Promise<T>, numOfParrallels = 5) => {
    const inChannel = new Channel<string>();
    const outChannel = new Channel<T>();
    const threadNum = numOfParrallels;
    const isStop = false;
    return {
        inChannel,
        outChannel,
        threadNum,
        isStop,
        outputIdResolver
    }
}
  const getAllOutputsTask = (inChannel:Channel<string>,helperContext:{IndexerPluginClient:IndexerPluginClient, bech32Address:string, isNft:boolean }) => {
    return [
        fetchOutputIdsIntoChannelForUnlock(inChannel, {
            hasTimelock: true,
            timelockedBefore: Math.floor(Date.now() / 1000)
        },helperContext),
        fetchOutputIdsIntoChannelForUnlock(inChannel, {
            hasTimelock: false
        },helperContext),
        
        fetchOutputIdsIntoChannelForExpiration(inChannel, {
        },helperContext)
    ]
}

export const getAllNftOutputs = async (helperContext:{SingleNodeClient:SingleNodeClient,IndexerPluginClient:IndexerPluginClient, bech32Address:string }) => {
    const drainOutputIdsContext = makeDrainOutputIdsContext(async (outputId:string) => {
        const {output} = await helperContext.SingleNodeClient.output(outputId);
        return {output:output as INftOutput,outputId};
    })
    await getAllOutputsTask(drainOutputIdsContext.inChannel,{...helperContext,isNft:true})
    return drainOutputIdsContext
}
export const getAllBasicOutputs = async (helperContext:{SingleNodeClient:SingleNodeClient,IndexerPluginClient:IndexerPluginClient, bech32Address:string }) => {
    const drainOutputIdsContext = makeDrainOutputIdsContext(async (outputId:string) => {
        const {output} = await helperContext.SingleNodeClient.output(outputId);
        return {output:output as IBasicOutput,outputId};
    })
    await getAllOutputsTask(drainOutputIdsContext.inChannel,{...helperContext,isNft:false})
    return drainOutputIdsContext
}
  const fetchOutputIdsIntoChannelForUnlock = async (channel:Channel<string>, extraQueryParam:Record<string,any>,helperContext:{IndexerPluginClient:IndexerPluginClient, bech32Address:string, isNft:boolean }) => {
    const {IndexerPluginClient, bech32Address,isNft} = helperContext
    const basicParam = {
        addressBech32: bech32Address,
        hasStorageDepositReturn: false,
        pageSize: 10000,
    }
    const param = {...basicParam, ...extraQueryParam}
    const outputIdsWrapper = await (isNft? IndexerPluginClient.nfts(param) :IndexerPluginClient.basicOutputs(param));
    const {items: outputIdsRaw} = outputIdsWrapper ?? {}
    const outputIds = outputIdsRaw ?? []
    console.log('fetchOutputIdsIntoChannelForUnlock push outputids',outputIds,extraQueryParam)
    for (const outputId of outputIds) { // TODO: reverse?
        channel.push(outputId);
    }
}
const fetchOutputIdsIntoChannelForExpiration = async <T>(channel:Channel<string>, extraQueryParam:Record<string,any>,helperContext:{IndexerPluginClient:IndexerPluginClient, bech32Address:string, isNft:boolean }) => {
    const {IndexerPluginClient, bech32Address,isNft} = helperContext
    const basicParam = {
        expirationReturnAddressBech32: bech32Address,
        expiresBefore: Math.floor(Date.now() / 1000),
        hasExpiration: true,
        pageSize: 10000,
    }
    const param = {...basicParam, ...extraQueryParam}
    const outputIdsWrapper = await (isNft? IndexerPluginClient.nfts(param) :IndexerPluginClient.basicOutputs(param));
    const {items: outputIdsRaw} = outputIdsWrapper ?? {}
    const outputIds = outputIdsRaw ?? []
    for (const outputId of outputIds) { // TODO: reverse?
        console.log('fetchOutputIdsIntoChannelForExpiration push outputid',outputId)
        channel.push(outputId);
    }
}