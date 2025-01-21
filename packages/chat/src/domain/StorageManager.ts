import { Singleton } from 'typescript-ioc';
import { StorageAdaptor } from '../types';
import { GroupfiStorageKeyPrefix } from '../constants'
import { GLOBAL_PREFIX } from "../constants";
@Singleton
export class StorageManager {
    private storageAdaptor?: StorageAdaptor
    private static readonly INIT_MARKER_KEY = 'groupfi_storage_init_marker';
    private static readonly ADDRESS_HASHES_KEY = 'address_hashes';
    private static readonly MAX_ADDRESS_HASHES = 100;
    private static readonly HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
    private addressHashes: Record<string, number> = {};

    setStorageAdaptor(storageAdaptor: StorageAdaptor) {
        if (this.storageAdaptor) return;
        this.storageAdaptor = storageAdaptor;
        this.init();
    }

    async isInitialized(): Promise<boolean> {
        const marker = await this.storageAdaptor?.get(this.getGlobalKey(StorageManager.INIT_MARKER_KEY));
        return marker === GroupfiStorageKeyPrefix;
    }

    async markAsInitialized(): Promise<void> {
        await this.storageAdaptor?.set(this.getGlobalKey(StorageManager.INIT_MARKER_KEY), GroupfiStorageKeyPrefix);
    }

    getKey(key: string): string {
        return `${GroupfiStorageKeyPrefix}${key}`;
    }
    getGlobalKey(key: string): string {
        return `${GLOBAL_PREFIX}${key}`;
    }
    async loadAddressHashes(): Promise<void> {
        const stored = await this.storageAdaptor?.get(this.getKey(StorageManager.ADDRESS_HASHES_KEY));
        if (stored) {
            this.addressHashes = JSON.parse(stored);
        }
    }
    
    private isValidHash(hash: string): boolean {
        return StorageManager.HASH_REGEX.test(hash);
    }

    async addAddressHash(hash: string): Promise<void> {
        // Validate hash format - must be 0x + 64 hex chars
        if (!this.isValidHash(hash)) {
            throw new Error('Invalid hash format: hash must be 0x followed by a 64-character hex string');
        }

        const hashExists = this.addressHashes[hash];
        this.addressHashes[hash] = Date.now();
        // case exceed max limit
        if (Object.keys(this.addressHashes).length >= StorageManager.MAX_ADDRESS_HASHES) {
            const oldestHash = Object.keys(this.addressHashes).reduce((oldest, current) => {
                return this.addressHashes[oldest] < this.addressHashes[current] ? oldest : current;
            });
            await this.deleteEntriesWithHash(oldestHash);
            await this.persistAddressHashes();
            return;
        }
        if (!hashExists) {
            await this.persistAddressHashes();
        }
        
    }


    async processAllEntries(callback: (key: string, value: string) => Promise<void>): Promise<void> {
        const adaptor = this.storageAdaptor;
        if (!adaptor || !('getAllKeys' in adaptor)) {
            throw new Error('Storage adaptor does not support getAllKeys operation');
        }

        const keys = await adaptor.getAllKeys();
        for (const key of keys) {
            const value = await adaptor.get(key);
            if (value !== null) {
                await callback(key, value);
            }
        }
    }

    private isValidPrefix(key: string): boolean {
        return key.startsWith(GroupfiStorageKeyPrefix) || key.startsWith(GLOBAL_PREFIX);
    }

    private extractAddressHash(key: string): string | null {
        // Skip prefixes to get to the potential hash part
        let startIndex = -1;
        if (key.startsWith(GroupfiStorageKeyPrefix)) {
            startIndex = GroupfiStorageKeyPrefix.length;
        } else if (key.startsWith(GLOBAL_PREFIX)) {
            startIndex = GLOBAL_PREFIX.length;
        }
        
        if (startIndex === -1) return null;

        // SHA256 hash is 66 characters long in hex (including 0x prefix)
        const possibleHash = key.slice(startIndex, startIndex + 66);
        // Validate that it's a 0x-prefixed 64-character hex string
        if (this.isValidHash(possibleHash)) {
            return possibleHash;
        }
        return null;
    }

    private async persistAddressHashes(): Promise<void> {
        await this.storageAdaptor?.set(
            this.getKey(StorageManager.ADDRESS_HASHES_KEY),
            JSON.stringify(this.addressHashes)
        );
    }

    async cleanStorageEntryOnInit(key: string, value: string): Promise<void> {
        if (!this.isValidPrefix(key)) {
            await this.storageAdaptor?.remove(key);
            return;
        }

        const hash = this.extractAddressHash(key);
        if (!hash) return;

        if (hash in this.addressHashes) {
            // Hash already tracked, nothing to do
            return;
        }

        if (Object.keys(this.addressHashes).length >= StorageManager.MAX_ADDRESS_HASHES) {
            // At limit, delete the entry
            await this.storageAdaptor?.remove(key);
            return;
        }

        // Add hash to tracking
        this.addressHashes[hash] = Date.now();
        await this.persistAddressHashes();
    }

    async initCleaning(): Promise<void> {
        await this.processAllEntries((key, value) => 
            this.cleanStorageEntryOnInit(key, value)
        );
    }

    async init(): Promise<void> {
        await this.loadAddressHashes();
        
        if (!(await this.isInitialized())) {
            await this.initCleaning();
            await this.persistAddressHashes();
            await this.markAsInitialized();
        }
        
        
    }

    async deleteEntriesWithHash(hash: string): Promise<void> {
        const adaptor = this.storageAdaptor;
        if (!adaptor || !('getAllKeys' in adaptor)) {
            throw new Error('Storage adaptor does not support getAllKeys operation');
        }

        const keys = await adaptor.getAllKeys();
        for (const key of keys) {
            const extractedHash = this.extractAddressHash(key);
            if (extractedHash === hash) {
                await adaptor.remove(key);
            }
        }

        // Remove from tracked hashes if present
        if (hash in this.addressHashes) {
            delete this.addressHashes[hash];
            await this.persistAddressHashes();
        }
    }
} 