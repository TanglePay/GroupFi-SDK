import { WriteStream, ReadStream } from "@iota/util.js";
export * from './runbatch'
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

export const hexToBytes = (hex: string) => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
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