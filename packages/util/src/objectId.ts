import { Blake2b } from "@iota/crypto.js";
import { Converter, WriteStream } from "@iota/util.js";

// Define types for data that can be converted into a hash.
// `SimpleData` includes basic types: string, number, boolean, Uint8Array, or null/undefined.
export type SimpleData = string | number | boolean | Uint8Array | null | undefined;

// Extend `SimpleData` to include arrays of `SimpleData`.
export type SimpleDataExtended = SimpleData | SimpleData[];

/**
 * Converts a `SimpleData` value into a `Uint8Array` for further processing.
 * - Strings are converted to UTF-8 bytes.
 * - Numbers and booleans are first converted to their string representations, then to UTF-8 bytes.
 * - Uint8Array values are used as-is.
 * - null or undefined values are converted to an empty byte array.
 * 
 * @param data - The input value of type `SimpleData`.
 * @returns A `Uint8Array` representation of the input.
 * @throws If the input type is invalid.
 */
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

/**
 * Converts a `SimpleData` value into a 256-bit Blake2b hash.
 * 
 * @param data - The input value of type `SimpleData`.
 * @returns A `Uint8Array` containing the 256-bit hash of the input.
 */
const SimpleDataToHash = (data: SimpleData): Uint8Array => {
    const bytes = SimpleDataToBytes(data);
    return Blake2b.sum256(bytes);
}

/**
 * Converts a `SimpleDataExtended` value (including arrays) into a 256-bit Blake2b hash.
 * - For arrays, it hashes each item individually, concatenates their hashes, 
 *   and then hashes the result.
 * - For non-array values, it directly computes the hash.
 * 
 * @param data - The input value of type `SimpleDataExtended`.
 * @returns A `Uint8Array` containing the 256-bit hash of the input.
 */
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

/**
 * Generates a unique object identifier (hash) for an object with string keys and `SimpleDataExtended` values.
 * - Sorts the object keys to ensure consistent ordering.
 * - Computes the hash for each key-value pair and flattens them into an array.
 * - Computes a final hash for the flattened array.
 * 
 * @param obj - An object with string keys and values of type `SimpleDataExtended`.
 * @returns A `Uint8Array` containing the 256-bit hash representing the object.
 */
export const objectId = (obj:Record<string, SimpleDataExtended>) => {
    const keys = Object.keys(obj).sort();
    const sorted = keys.map(key => [key, SimpleDataExtendedToHash(obj[key])]);
    const flattened = sorted.reduce((acc, [key, value]) => {
        return [...acc, key, value];
    }, [] as SimpleData[]);
    return SimpleDataExtendedToHash(flattened);
}