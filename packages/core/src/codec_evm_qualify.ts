import { Converter, WriteStream } from "@iota/util.js";
import { EvmQualifySchemaVersion } from "./types";

// serialize evm qualify, including groupId, address list and signature
export function serializeEvmQualify(groupId: string, addressList: string[], signature: string): Uint8Array {
    const signatureBytes = Converter.hexToBytes(signature);
    const signatureBytesLength = signatureBytes.length;
    // log the signatureBytesLength
    console.log("signatureBytesLength: ", signatureBytesLength);
    const groupIdBytes = Converter.hexToBytes(groupId);
    const addressListBytes = addressList.map((val)=>Converter.hexToBytes(val));
    const writer = new WriteStream();
    writer.writeUInt8("schema_version", EvmQualifySchemaVersion);
    writer.writeUInt16("signature_length", signatureBytesLength);
    writer.writeBytes("signature", signatureBytesLength, signatureBytes);
    writer.writeBytes("groupId", groupIdBytes.length, groupIdBytes);
    for (const address of addressListBytes) {
        writer.writeBytes("address", address.length, address);
    }
    return writer.finalBytes();
}