import bs58 from 'bs58';
import { ethers, JsonRpcProvider } from 'ethers';
import ERC725 from '@erc725/erc725.js'
import schema from '@erc725/erc725.js/schemas/LSP3ProfileMetadata.json'

/**
 * Checks if a given string is a valid Solana address.
 * @param address - The string to check.
 * @returns True if the string is a valid Solana address, otherwise false.
 */
export function isSolanaAddress(address: string): boolean {
  try {
    const decoded = bs58.decode(address);
    return decoded.length === 32;
  } catch (error) {
    return false;
  }
}

/**
 * Checks if a given string is a valid Ethereum address.
 * @param address - The string to check.
 * @returns True if the string is a valid Ethereum address, otherwise false.
 */
export function isEvmAddress(address: string): boolean {
  return ethers.isAddress(address);
}

export const AddressTypeEvm = 1;
export const AddressTypeSolana = 2;
export const AddressTypeUniversalProfile = 3

export type AddressType = typeof AddressTypeEvm | typeof AddressTypeSolana | typeof AddressTypeUniversalProfile 

// Since Universal address is also EVM address
export function getEvmOrSolanaAddressType(address: string) {
  if (isEvmAddress(address)) {
    return AddressTypeEvm;
  }
  if (isSolanaAddress(address)) {
      return AddressTypeSolana;
  }
  throw new Error("Invalid address"); 
}

export async function getSpecificAddressType(address: string): Promise<AddressType> {
    // throws if not a valid address
    // Universal address is also EVM address, so write it first
    const isUpAddr = await isUniversalProfileAddress(address) 
    if (isUpAddr) {
      return AddressTypeUniversalProfile
    }
    if (isEvmAddress(address)) {
        return AddressTypeEvm;
    }
    if (isSolanaAddress(address)) {
        return AddressTypeSolana;
    }
    throw new Error("Invalid address");
}

export function isSolanaChain(chainId: number) {
  return chainId === 518
}

let luksoChainRpc: string | undefined = undefined
export async function isUniversalProfileAddress(address: string): Promise<boolean> {
  if (!luksoChainRpc) {
    luksoChainRpc = await getLuksoChainRpc()
  }
  const erc725 = new ERC725(schema, address, luksoChainRpc);
  try {
    const profileData = await erc725.getData('LSP3Profile');
    console.log('Profile data:', profileData);
    return !!profileData;  // 如果有 profile 数据，则为 true
  } catch (error) {
    console.log('Error fetching profile data:', error);
    return false;  // 如果出错，说明不是 Universal Profile 地址
  }
}

async function getLuksoChainRpc() {
  const url = `https://${process.env.AUXILIARY_SERVICE_DOMAIN}/rpc?chainid=42`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    },
  })
  const json = await res.json() as {result: boolean, rpc: string}
  return json.rpc
}