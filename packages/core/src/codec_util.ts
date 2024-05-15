import { ReadStream } from "@iota/util.js";


export function deserializeFieldWithLengthPrefixed(reader : ReadStream, fieldName: string = '') : Uint8Array {
    const length = reader.readUInt16(fieldName + "_length");
    return reader.readBytes(fieldName, length);
}