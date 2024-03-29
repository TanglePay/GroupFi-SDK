import { WriteStream, ReadStream, Converter } from "@iota/util.js";
import { Blake2b } from "@iota/crypto.js"
export * from './runbatch'
export * from './objectId'
export * from './consolidate'
export const concatBytes = (...args: Uint8Array[]) => {
    let totalLength = 0;
    args.forEach((bytes) => {
        totalLength += bytes.length;
    });
    const result = new Uint8Array(totalLength);
    let offset = 0;
    args.forEach((bytes) => {
        result.set(bytes, offset);
        offset += bytes.length;
    });
    return result;
}

export const addressHash = (address:string, key:string):Uint8Array => {
    const addressBytes = Converter.utf8ToBytes(address);
    const keyBytes = Converter.utf8ToBytes(key);
    return Blake2b.sum160(addressBytes, keyBytes);
}
export const hexToBytes = (hex: string) => {
    return Converter.hexToBytes(hex)
}
export const bytesToHex = (bytes: Uint8Array, isPrefix = false) => {
    return Converter.bytesToHex(bytes, isPrefix)
}
export const strToBytes = (str: string) => {
    return Converter.utf8ToBytes(str)
}
export const bytesToStr = (bytes: Uint8Array) => {
    return Converter.bytesToUtf8(bytes)
}
export const serializeListOfBytes = (list: Uint8Array[]):Uint8Array => {
    const stream = new WriteStream();
    for (const bytes of list) {
        const len = bytes.length;
        stream.writeUInt32('length', len);
        stream.writeBytes('payload', len, bytes);
    }
    return stream.finalBytes();
}
export const blake256Hash = (bytes: Uint8Array):Uint8Array => {
    return Blake2b.sum256(bytes)
}
export const deserializeListOfBytes = (bytes: Uint8Array):Uint8Array[] => {
    const stream = new ReadStream(bytes);
    const list: Uint8Array[] = [];
    while (stream.hasRemaining(1)) {
        const len = stream.readUInt32('length');
        const payload = stream.readBytes('payload', len);
        list.push(payload);
    }
    return list;
}

export const formatUrlParams = (params: { [key: string]: string | number | boolean | undefined }) => {
    const keys = Object.keys(params);
    if (keys.length === 0) {
        return '';
    }
    const result = [];
    for (const key of keys) {
        const value = params[key];
        if (value !== undefined) {
            result.push(`${key}=${encodeURIComponent(value)}`);
        }
    }
    encodeURIComponent
    return `?${result.join('&')}`;
}

export const parseUrlParams = (url: string) => {
    const result: { [key: string]: string } = {};
    const idx = url.indexOf('?');
    if (idx >= 0) {
        const params = url.slice(idx + 1).split('&');
        for (const param of params) {
            const [key, value] = param.split('=');
            result[key] = decodeURIComponent(value);
        }
    }
    return result;
}
// number to 1 byte array
export const numberToBytes = (num: number): Uint8Array => {
    const bytes = new Uint8Array(1);
    bytes[0] = num & 0xff;
    return bytes;
}

// unix epoch in seconds to 4 byte array
export const unixSecondsToBytes = (seconds: number): Uint8Array => {
    const bytes = new Uint8Array(4);
    bytes[0] = (seconds >> 24) & 0xff;
    bytes[1] = (seconds >> 16) & 0xff;
    bytes[2] = (seconds >> 8) & 0xff;
    bytes[3] = seconds & 0xff;
    return bytes;
}
// 4 byte array to unix epoch in seconds
export const bytesToUnixSeconds = (bytes: Uint8Array): number => {
    if (bytes.length !== 4) {
        throw new Error(`bytes length is not 4`);
    }
    return (bytes[0] << 24) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
}

export function getCurrentEpochInSeconds() {
    return Math.floor(Date.now() / 1000);
}

export function sleep(ms: number) {
    if (ms <= 0) {
        return Promise.resolve();
    }
    return new Promise(resolve => setTimeout(resolve, ms));
}