import { Blake2b } from "@iota/crypto.js";
import { Converter, WriteStream } from "@iota/util.js";
export type SimpleData = string | number | boolean | Uint8Array | null | undefined;
export type SimpleDataExtended = SimpleData | SimpleData[];

const SimpleDataToBytes = (data: SimpleData): Uint8Array => {
    if (data === null || data === undefined) {
        return new Uint8Array(0);
    }
    if (typeof data === 'string') {
        return Converter.utf8ToBytes(data);
    }
    if (typeof data === 'number') {
        return Converter.utf8ToBytes(`${data}`);
    }
    if (typeof data === 'boolean') {
        return Converter.utf8ToBytes(`${data}`);
    }
    if (data instanceof Uint8Array) {
        return data;
    }
    throw new Error('Invalid data type');
}
const SimpleDataToHash = (data: SimpleData): Uint8Array => {
    const bytes = SimpleDataToBytes(data);
    return Blake2b.sum256(bytes);
}
const SimpleDataExtendedToHash = (data: SimpleDataExtended): Uint8Array => {
    if (Array.isArray(data)) {
        const stream = new WriteStream();
        for (const item of data) {
            const bytes = SimpleDataToHash(item);
            stream.writeBytes('payload', bytes.length, bytes);
        }
        const bytes =  stream.finalBytes();
        return Blake2b.sum256(bytes);
    }
    return SimpleDataToHash(data);
}
export const objectId = (obj:Record<string, SimpleDataExtended>) => {
    const keys = Object.keys(obj).sort();
    const sorted = keys.map(key => [key, SimpleDataExtendedToHash(obj[key])]);
    const flattened = sorted.reduce((acc, [key, value]) => {
        return [...acc, key, value];
    }, [] as SimpleData[]);
    return SimpleDataExtendedToHash(flattened);
}