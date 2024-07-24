import bs58 from 'bs58';
import { ethers } from 'ethers';

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

export type AddressType = typeof AddressTypeEvm | typeof AddressTypeSolana;

export function getAddressType(address: string): AddressType {
    // throws if not a valid address
    if (isEvmAddress(address)) {
        return AddressTypeEvm;
    }
    if (isSolanaAddress(address)) {
        return AddressTypeSolana;
    }
    throw new Error("Invalid address");
}