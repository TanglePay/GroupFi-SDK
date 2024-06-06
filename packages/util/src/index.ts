import { WriteStream, ReadStream, Converter } from '@iota/util.js';
import { Blake2b, Bip39, Bip32Path } from '@iota/crypto.js';
import { Ed25519Seed, generateBip44Address, COIN_TYPE_SHIMMER } from '@iota/iota.js';
import bigInt from 'big-integer';
export * from './runbatch';
export * from './objectId';
export * from './consolidate';
export * from './pipe';
export * from './concurrent_pipe';
export * from './stream_processor';
export * from './crypto';
export * from './SerialAsyncQueue'
export * from './tracer';
export * from './browser_upload_helper';

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
};

export const addressHash = (address: string, key: string): Uint8Array => {
  const addressBytes = Converter.utf8ToBytes(address);
  const keyBytes = Converter.utf8ToBytes(key);
  return Blake2b.sum160(addressBytes, keyBytes);
};
export const hexToBytes = (hex: string) => {
  return Converter.hexToBytes(hex);
};
export const utf8ToHex = (str: string, includePrefix?: boolean) => Converter.utf8ToHex(str, includePrefix)

export const bytesToHex = (bytes: Uint8Array, isPrefix = false) => {
  return Converter.bytesToHex(bytes, isPrefix);
};
export const strToBytes = (str: string) => {
  return Converter.utf8ToBytes(str);
};
export const bytesToStr = (bytes: Uint8Array) => {
  return Converter.bytesToUtf8(bytes);
};
export const serializeListOfBytes = (list: Uint8Array[]): Uint8Array => {
  const stream = new WriteStream();
  for (const bytes of list) {
    const len = bytes.length;
    stream.writeUInt32('length', len);
    stream.writeBytes('payload', len, bytes);
  }
  return stream.finalBytes();
};
// add amount to map with key
export const addToMap = (
  map: { [key: string]: bigInt.BigInteger },
  key: string,
  amount: string
) => {
  const amountBigInt = bigInt(amount);
  if (map[key]) {
    map[key] = map[key].add(amountBigInt);
  } else {
    map[key] = amountBigInt;
  }
};
// check two maps are equal
export const mapsEqual = (
  map1: { [key: string]: bigInt.BigInteger },
  map2: { [key: string]: bigInt.BigInteger }
) => {
  const keys = Object.keys(map1);
  if (keys.length !== Object.keys(map2).length) {
    return false;
  }
  for (const key of keys) {
    if (!map2[key] || map1[key].notEquals(map2[key])) {
      return false;
    }
  }
  return true;
};
export const blake256Hash = (bytes: Uint8Array): Uint8Array => {
  return Blake2b.sum256(bytes);
};
export const deserializeListOfBytes = (bytes: Uint8Array): Uint8Array[] => {
  const stream = new ReadStream(bytes);
  const list: Uint8Array[] = [];
  while (stream.hasRemaining(1)) {
    const len = stream.readUInt32('length');
    const payload = stream.readBytes('payload', len);
    list.push(payload);
  }
  return list;
};

export const formatUrlParams = (params: {
  [key: string]: string | number | boolean | undefined;
}) => {
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
  encodeURIComponent;
  return `?${result.join('&')}`;
};

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
};
// number to 1 byte array
export const numberToBytes = (num: number): Uint8Array => {
  const bytes = new Uint8Array(1);
  bytes[0] = num & 0xff;
  return bytes;
};

// unix epoch in seconds to 4 byte array
export const unixSecondsToBytes = (seconds: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  bytes[0] = (seconds >> 24) & 0xff;
  bytes[1] = (seconds >> 16) & 0xff;
  bytes[2] = (seconds >> 8) & 0xff;
  bytes[3] = seconds & 0xff;
  return bytes;
};
// 4 byte array to unix epoch in seconds
export const bytesToUnixSeconds = (bytes: Uint8Array): number => {
  if (bytes.length !== 4) {
    throw new Error(`bytes length is not 4`);
  }
  return (bytes[0] << 24) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
};
// bytesToUint32, big endian
export const bytesToUint32 = (bytes: Uint8Array): number => {
  if (bytes.length !== 4) {
    throw new Error(`bytes length is not 4`);
  }
  return (bytes[0] << 24) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
};
// bytesToUint16, big endian
export const bytesToUint16 = (bytes: Uint8Array): number => {
  if (bytes.length !== 2) {
    throw new Error(`bytes length is not 2`);
  }
  return (bytes[0] << 8) + bytes[1];
};
// uint16ToBytes, big endian
export const uint16ToBytes = (num: number): Uint8Array => {
  const bytes = new Uint8Array(2);
  bytes[0] = (num >> 8) & 0xff;
  bytes[1] = num & 0xff;
  return bytes;
};
// read uint16 from reader, big endian
export const readUint16 = (reader: ReadStream, fieldName: string): number => {
  return bytesToUint16(reader.readBytes(fieldName, 2));
};
// read uint32 from reader, big endian
export const readUint32 = (reader: ReadStream, fieldName: string): number => {
  return bytesToUint32(reader.readBytes(fieldName, 4));
};
//
// uint32ToBytes, big endian
export const uint32ToBytes = (num: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  bytes[0] = (num >> 24) & 0xff;
  bytes[1] = (num >> 16) & 0xff;
  bytes[2] = (num >> 8) & 0xff;
  bytes[3] = num & 0xff;
  return bytes;
};
export function getCurrentEpochInSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function sleep(ms: number) {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}
export function createBlobURLFromUint8Array(data: Uint8Array): string {
  // Convert Uint8Array to Blob
  const blob = new Blob([data], { type: 'application/octet-stream' });

  // Create and return a URL for the Blob
  return URL.createObjectURL(blob);
}

export async function retrieveUint8ArrayFromBlobURL(
  url: string
): Promise<Uint8Array> {
  // Fetch the Blob from the URL
  const response = await fetch(url);
  const blob = await response.blob();

  // Convert Blob to Uint8Array
  return new Uint8Array(await blob.arrayBuffer());
}
export function releaseBlobUrl(url: string) {
  URL.revokeObjectURL(url);
}
// compare two hex strings bytewise
export function compareHex(a: string, b: string): number {
  // use byte comparison
  return compareBytes(hexToBytes(a), hexToBytes(b));
}
export function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const minLength = Math.min(a.length, b.length);
  for (let i = 0; i < minLength; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  if (a.length < b.length) return -1;
  if (a.length > b.length) return 1;
  return 0;
}

export function generateSMRPair() {
  const mnemonic = Bip39.randomMnemonic(128);
  const seed = Ed25519Seed.fromMnemonic(mnemonic);
  const keyPair = getSMRPairBySeed(seed);
  return keyPair;
}

export function getSMRPairBySeed(baseSeed: Ed25519Seed) {
  const addressGeneratorAccountState = {
    accountIndex: 0,
    addressIndex: 0,
    isInternal: false,
  };
  const path = generateBip44Address(
    addressGeneratorAccountState,
    COIN_TYPE_SHIMMER
  );

  const addressSeed = baseSeed.generateSeedFromPath(new Bip32Path(path));
  const addressKeyPair = addressSeed.keyPair();
  return addressKeyPair;
}