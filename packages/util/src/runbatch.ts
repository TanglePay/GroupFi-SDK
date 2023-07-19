export type Task = {idx:number, asyncFunc:() => Promise<any>};
export type TaskResult = {idx:number, result:any};

export type RunBatchContext = {
    tasks: Task[],
    resolve: Function,
    totalWorkers:number,
    finishedWorkers:number,
    results: any[]
    };

export const makeContext = (tasks: Task[],resolve:Function, concurrency: number): RunBatchContext => {
    return {tasks, resolve, totalWorkers:concurrency, finishedWorkers:0, results: []};
}
const run = async (context:RunBatchContext, id:number) => {
    while (true) {
        const task = context.tasks.pop();
        
        if (!task) {
            context.finishedWorkers++;
            if (context.finishedWorkers===context.totalWorkers) {
                const resultArr = [];
                console.log('runbatch context.results:', context.results);
                const map = context.results.reduce((map,taskResult)=>{map[taskResult.idx]=taskResult.result;return map;},{});
                console.log('runbatch map:', map);
                for (let i=0;i<context.results.length;i++) {
                    resultArr.push(map[i]??undefined);
                }
                console.log('resolve',resultArr);
                context.resolve(resultArr);
            }
            break;
        } else {
            const idx = task.idx;
            try {
                const result = await task.asyncFunc();
                console.log(idx,result)
                context.results.push({idx,result});
                console.log(idx,result,context.results[context.results.length-1])
            } catch (e) {
                console.log(e);
            }
        }
    }
}

export const runBatch = (tasks: (() => Promise<any>)[], concurrency: number): Promise<any[]> => {
    return new Promise((resolve, reject) => {
        const context = makeContext(tasks.map((asyncFunc,idx)=>({idx,asyncFunc})), resolve, concurrency);
        while (concurrency-->0) {
            const id = concurrency
            const contextCopy = context
            setTimeout(()=>{run(contextCopy,id)}, 0);
        }
    });
}
