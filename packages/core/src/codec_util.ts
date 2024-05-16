import { ReadStream } from "@iota/util.js";
import { readUint16 } from 'iotacat-sdk-utils'

export function deserializeFieldWithLengthPrefixed(reader : ReadStream, fieldName: string = '') : Uint8Array {
    const length = readUint16(reader, fieldName + '_length');
    return reader.readBytes(fieldName, length);
}