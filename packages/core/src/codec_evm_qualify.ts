// serializeEvmQualify.ts

import { Converter, WriteStream } from "@iota/util.js";
import { EvmQualifySchemaVersion } from "./types";
import { AddressType, AddressTypeEvm, AddressTypeSolana } from "./address_check";
import bs58 from 'bs58';

// Define constants for modes with QUALIFY_ prefix
export const QUALIFY_MODE_RAW = 0x00;
export const QUALIFY_MODE_URI = 0x01;

// Define constant for maximum address list size
export const MAX_ADDRESS_LIST_SIZE = 300;

/**
 * Concatenates multiple Uint8Array instances into a single Uint8Array.
 * @param arrays Array of Uint8Array instances to concatenate.
 * @returns A single Uint8Array containing all the bytes from the input arrays.
 */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce((acc, curr) => acc + curr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
        result.set(arr, offset);
        offset += arr.length;
    }
    return result;
}

/**
 * Type definition for the upload function.
 * The function takes a groupId and addressList, uploads the address list, and returns the URI as a string.
 */
export type UploadAddressListFunction = (groupId: string, addressList: string[]) => Promise<string>;

/**
 * Serialize EVM qualify data, including groupId, address list, signature, etc.
 * Handles cases where the address list exceeds the maximum allowed size by uploading to an external storage.
 * 
 * @param groupId - The ID of the group.
 * @param addressList - Array of addresses qualifying the group.
 * @param signature - Signature string.
 * @param addressType - Type of the addresses (EVM or Solana).
 * @param timestamp - Timestamp of the qualification.
 * @param uploadAddressList - Function to upload the address list externally and return the URI.
 * @returns A Promise that resolves to a Uint8Array containing the serialized data.
 */
export async function serializeEvmQualify(
    groupId: string,
    addressList: string[],
    signature: string,
    addressType: AddressType,
    timestamp: number,
    uploadAddressList: UploadAddressListFunction
): Promise<Uint8Array> {
    const signatureBytes = Converter.hexToBytes(signature);
    const signatureBytesLength = signatureBytes.length;
    // Log the signatureBytesLength
    console.log("signatureBytesLength: ", signatureBytesLength);
    const groupIdBytes = Converter.hexToBytes(groupId);

    let mode: number;
    let addressData: Uint8Array;

    if (addressList.length > MAX_ADDRESS_LIST_SIZE) {
        // If address list exceeds the maximum size, store in external storage and use URI
        mode = QUALIFY_MODE_URI;
        const uri = await uploadAddressList(groupId, addressList);
        if (!uri) {
            throw new Error("Failed to upload address list to external storage");
        }
        addressData = Converter.utf8ToBytes(uri);
    } else {
        // Otherwise, store the address list directly
        mode = QUALIFY_MODE_RAW;
        const addressListBytes = addressList.map((val) => {
            if (addressType === AddressTypeEvm) {
                return Converter.hexToBytes(val);
            }
            if (addressType === AddressTypeSolana) {
                return bs58.decode(val);
            }
            throw new Error("Invalid address type");
        });

        // Concatenate all Uint8Array instances into one
        addressData = concatUint8Arrays(addressListBytes);
    }

    const writer = new WriteStream();
    writer.writeUInt8("schema_version", EvmQualifySchemaVersion);
    writer.writeUInt16("signature_length", signatureBytesLength);
    writer.writeBytes("signature", signatureBytesLength, signatureBytes);
    writer.writeBytes("groupId", groupIdBytes.length, groupIdBytes);
    writer.writeUInt8("mode", mode); // Add mode byte with QUALIFY_ prefix
    writer.writeUInt8("addressType", addressType); // Existing addressType byte
    writer.writeUInt32("timestamp", timestamp);
    writer.writeBytes("addressData", addressData.length, addressData); // Write either address list or URI

    return writer.finalBytes();
}
