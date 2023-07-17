export type Task = {idx:number, asyncFunc:() => Promise<any>};
export type TaskResult = {idx:number, result:any};

export type RunBatchContext = {
    tasks: Task[],
    resolve: Function,
    runningWorkers:0,
    results: any[]
    };

export const makeContext = (tasks: Task[],resolve:Function, concurrency: number): RunBatchContext => {
    return {tasks, resolve, runningWorkers:0, results: []};
}
const run = async (context:RunBatchContext) => {
    context.runningWorkers++;
    while (true) {
        const task = context.tasks.pop();
        
        if (!task) {
            context.runningWorkers--;
            if (context.runningWorkers===0) {
                const resultArr = [];
                const map = context.results.reduce((map,taskResult)=>{map[taskResult.idx]=taskResult.result;return map;},{});
                console.log('runbatch map:', JSON.stringify(map));
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
                context.results.push({idx,result});
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
            setTimeout(()=>{run(context)}, 0);
        }
    });
}
