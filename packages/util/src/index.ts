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