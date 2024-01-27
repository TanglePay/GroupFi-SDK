import { Duplex } from 'stream';

// Update the Processor type to accept T and return O
type Processor<T, O> = (data: T) => Promise<O>;

export class ConcurrentPipe<T, O> extends Duplex {
    private processor: Processor<T, O>;
    private taskQueue: Array<{ chunk: T; callback: (error?: Error | null) => void }>;
    private parallelism: number;
    private activeWorkers: number;

    constructor(processor: Processor<T, O>, parallelism: number = 4, highWaterMark: number = 16 * 1024, objectMode: boolean = true) {
        super({ objectMode, highWaterMark });
        this.processor = processor;
        this.parallelism = parallelism;
        this.taskQueue = [];
        this.activeWorkers = 0;
        for (let i = 0; i < this.parallelism; i++) {
            this.processNextTask();
        }
    }
    _read(size: number): void {
        // No-op
    }
    _write(chunk: T, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        this.taskQueue.push({ chunk, callback });
        if (this.activeWorkers < this.parallelism) {
            this.processNextTask();
        }
    }

    _final(callback: (error?: Error | null) => void): void {
        const checkQueueEmpty = () => {
            if (this.taskQueue.length === 0 && this.activeWorkers === 0) {
                this.push(null); // End the readable stream
                callback();
            } else {
                setTimeout(checkQueueEmpty, 100); // Check again in 100ms
            }
        };
        checkQueueEmpty();
    }

    private async processNextTask(): Promise<void> {
        if (this.taskQueue.length === 0) {
            return;
        }

        const task = this.taskQueue.shift();
        if (!task) {
            return;
        }

        this.activeWorkers++;
        try {
            const processedData = await this.processor(task.chunk);
            this.push(processedData);
            task.callback();
        } catch (error) {
            task.callback(error as Error);
        } finally {
            this.activeWorkers--;
            if (this.taskQueue.length > 0) {
                this.processNextTask(); // Continue processing next task
            }
        }
    }

    // Modified safeWrite method to use type T
    public async safeWrite(chunk: T): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const writeOrWait = () => {
                if (!this.write(chunk)) {
                    this.once('drain', writeOrWait); // Wait for drain event to try again
                } else {
                    resolve();
                }
            };
            writeOrWait();
        });
    }
}
