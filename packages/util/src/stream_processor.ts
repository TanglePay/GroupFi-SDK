import { Readable } from 'stream';

// Define the processor function type.
// It takes a chunk of data and returns a Promise.
type Processor<T> = (chunk: T) => Promise<void>;

export class StreamProcessor<T> {
  private stream: Readable;
  private processor: Processor<T>;

  constructor(stream: Readable, processor: Processor<T>) {
    this.stream = stream;
    this.processor = processor;
    this.init();
  }

  private init(): void {
    // Listen for 'data' events from the stream.
    this.stream.on('data', async (chunk: T) => {
      // Pause the stream to prevent more data events until processing is done.
      this.stream.pause();

      try {
        // Process the chunk using the async processor function.
        await this.processor(chunk);
      } catch (error) {
        console.error('Error processing chunk:', error);
        this.stream.emit('error', error);
      }

      // Resume the stream to continue receiving data events.
      this.stream.resume();
    });

    // Optional: listen for other events (e.g., 'error', 'end') as needed.
    this.stream.on('end', () => {
      console.log('Stream ended.');
    });

    this.stream.on('error', (err) => {
      console.error('Stream error:', err);
    });
  }
}

// Usage example (assuming you have a Readable stream and an async processing function):
// const myStream = getSomeReadableStream();
// const myProcessor: Processor<any> = async (chunk) => {
//   console.log('Processing chunk:', chunk);
//   // simulate async operation, e.g., saving data to a database
//   await new Promise(resolve => setTimeout(resolve, 100));
// };
// const streamProcessor = new StreamProcessor(myStream, myProcessor);
