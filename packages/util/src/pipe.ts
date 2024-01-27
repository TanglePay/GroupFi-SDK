import { Duplex } from 'stream';

// Define the processor function type for clarity
type Processor<T = any> = (data: T) => T;

export class Pipe<T = any> extends Duplex {
    private processor: Processor<T>;

    constructor(processor: Processor<T>, highWaterMark: number = 16384, objectMode: boolean = false) {
        super({ highWaterMark, objectMode });
        this.processor = processor;
    }

    _read(size: number): void {
        // No-op
    }

    _write(chunk: T, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        try {
            // Process the chunk. If objectMode is true, chunk is treated as an object.
            const processedChunk = this.processor(chunk);
            const canContinue = this.push(processedChunk);
            if (!canContinue) {
                this.once('drain', callback);
            } else {
                callback();
            }
        } catch (err) {
            callback(err as Error);
        }
    }

    _final(callback: (error?: Error | null) => void): void {
        this.push(null); // Indicate the end of the stream
        callback();
    }

    getReadableStream(): this {
        return this;
    }

    getWritableStream(): this {
        return this;
    }

    // Implement a safeWrite method to respect backpressure
    async safeWrite(data: T, encoding: BufferEncoding = 'utf8'): Promise<void> {
        return new Promise((resolve, reject) => {
            const writeResult = this.write(data, encoding);
            if (!writeResult) {
                this.once('drain', resolve);
            } else {
                resolve();
            }
        });
    }
}
