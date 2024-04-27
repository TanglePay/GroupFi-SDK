import { Converter, WriteStream } from "@iota/util.js";
import { serializeCommonHeader } from "./codec_common";

// serialize evm qualify, including groupId, address list and signature
export function serializeEvmQualify(groupId: string, addressList: string[], signature: string ,
    ctx:{[key:string]:any}): Uint8Array {
    const signatureBytes = Converter.hexToBytes(signature);
    const signatureBytesLength = signatureBytes.length;
    // log the signatureBytesLength
    console.log("signatureBytesLength: ", signatureBytesLength);
    const groupIdBytes = Converter.hexToBytes(groupId);
    const addressListBytes = addressList.map((val)=>Converter.hexToBytes(val));
    const writer = new WriteStream();
    serializeCommonHeader(writer, ctx);
    writer.writeUInt16("signature_length", signatureBytesLength);
    writer.writeBytes("signature", signatureBytesLength, signatureBytes);
    writer.writeBytes("groupId", groupIdBytes.length, groupIdBytes);
    for (const address of addressListBytes) {
        writer.writeBytes("address", address.length, address);
    }
    return writer.finalBytes();
}