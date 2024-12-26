import { Converter } from '@iota/util.js';
import CryptoJS from 'crypto-js';

export const prefixedGroupIdToGroupId = (prefixedGroupId: string) => {
    // prefixedGroupId is like prefixString + sha256Hash
    // get sha256Hash from prefixedGroupId, then add 0x prefix to the hash
    const length = prefixedGroupId.length;
    const sha256Hash = prefixedGroupId.slice(length - 64, length);
    return `0x${sha256Hash}`;
}

export const isGroupIdEqual = (groupIdCouldBeLegacy: string, groupIdFromApi: string) => {
    const groupIdCouldBeLegacyWithoutPrefixString = prefixedGroupIdToGroupId(groupIdCouldBeLegacy);
    const groupIdFromApiWithoutPrefixString = prefixedGroupIdToGroupId(groupIdFromApi);
    if (groupIdCouldBeLegacyWithoutPrefixString === groupIdFromApiWithoutPrefixString) {
        return true;
    }
    // groupIdFromApiWithoutPrefixString to bytes
    const sha256HashOfGroupIdCurrent = hashHexStringToSha256(groupIdFromApiWithoutPrefixString)
    return sha256HashOfGroupIdCurrent === groupIdCouldBeLegacyWithoutPrefixString;
}
function hashHexStringToSha256(hexString:string) {
    // remove 0x prefix if it exists
    if (hexString.startsWith('0x')) {
        hexString = hexString.slice(2);
    }   
    // Parse the hex string to bytes
    const bytes = CryptoJS.enc.Hex.parse(hexString);

    // Hash the bytes using SHA-256
    const hash = CryptoJS.SHA256(bytes);

    // Convert the hash to a hex string
    const hashHex = hash.toString(CryptoJS.enc.Hex);

    return '0x' + hashHex;
}
