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
    const sha256HashOfGroupIdCurrent = CryptoJS.SHA256(groupIdCouldBeLegacy).toString(CryptoJS.enc.Hex)
    const sha256HashOfGroupIdCurrentWithPrefix = sha256HashOfGroupIdCurrent.startsWith('0x') ? sha256HashOfGroupIdCurrent : `0x${sha256HashOfGroupIdCurrent}`
    return sha256HashOfGroupIdCurrentWithPrefix === groupIdFromApiWithoutPrefixString;
}

