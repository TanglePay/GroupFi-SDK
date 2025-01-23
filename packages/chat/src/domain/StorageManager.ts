import { Singleton } from 'typescript-ioc';
import { StorageAdaptor } from '../types';
import { GroupfiStorageKeyPrefix } from '../constants'
import { GLOBAL_PREFIX } from "../constants";
@Singleton
export class StorageManager {
    private storageAdaptor?: StorageAdaptor
    private static readonly INIT_MARKER_KEY = 'groupfi_storage_init_marker';
    private static readonly ADDRESS_HASHES_KEY = 'address_hashes';
    private static readonly MAX_ADDRESS_HASHES = 10;
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

    private async markAsInitialized(): Promise<void> {
        // log entry
        console.log('storagemanager markAsInitialized');
        await this.storageAdaptor?.set(this.getGlobalKey(StorageManager.INIT_MARKER_KEY), GroupfiStorageKeyPrefix);
    }

    getKey(key: string): string {
        return `${GroupfiStorageKeyPrefix}${key}`;
    }
    getGlobalKey(key: string): string {
        return `${GLOBAL_PREFIX}${key}`;
    }
    async loadAddressHashes(): Promise<void> {
        const stored = await this.storageAdaptor?.get(this.getGlobalKey(StorageManager.ADDRESS_HASHES_KEY));
        // Update log format
        console.log('storagemanager loadAddressHashes', stored);
        if (stored) {
            this.addressHashes = JSON.parse(stored);
        }
    }
    
    private isValidHash(hash: string): boolean {
        return StorageManager.HASH_REGEX.test(hash);
    }

    async addAddressHash(prefix: string): Promise<void> {
        const hash = this.extractAddressHash(prefix);
        // Validate hash format - must be 0x + 64 hex chars
        if (!this.isValidHash(hash)) {
            throw new Error(`Invalid hash format: hash must be 0x followed by a 64-character hex string, ${hash}`);
        }

        const hashExists = this.addressHashes[hash];
        this.addressHashes[hash] = Date.now();
        // case exceed max limit
        if (Object.keys(this.addressHashes).length >= StorageManager.MAX_ADDRESS_HASHES) {
            const oldestHash = Object.keys(this.addressHashes).reduce((oldest, current) => {
                return this.addressHashes[oldest] < this.addressHashes[current] ? oldest : current;
            });
            await this.deleteEntriesWithHash(oldestHash);
            // delete from memory
            delete this.addressHashes[oldestHash];
            await this.persistAddressHashes();
            return;
        }
        if (!hashExists) {
            await this.persistAddressHashes();
        }
        
    }


    async processAllEntries(callback: (key: string) => Promise<void>): Promise<void> {
        const adaptor = this.storageAdaptor;
        if (!adaptor) {
            throw new Error('Storage adaptor not initialized');
        }

        let index = 0;
        let key: string | null;
        let processedCount = 0;
        
        while ((key = adaptor.key(index)) !== null) {
            try {
                await callback(key);
                processedCount++;
            } catch (error) {
                // Update log format
                console.error(`storagemanager processAllEntries Error processing key ${key}:`, error);
            }
            index++;
        }

        // Update log format
        console.log('storagemanager processAllEntries processed keys:', processedCount);
    }

    private isValidPrefix(key: string): boolean {
        const isValid = key.startsWith(GroupfiStorageKeyPrefix) || key.startsWith(GLOBAL_PREFIX);
        if (!isValid) {
            // Update log format
            console.log('storagemanager invalid prefix', key);
        }
        return isValid;
    }

    private extractAddressHash(key: string): string {
        // Skip prefixes to get to the potential hash part
        let startIndex = -1;
        if (key.startsWith(GroupfiStorageKeyPrefix)) {
            startIndex = GroupfiStorageKeyPrefix.length;
        } else if (key.startsWith(GLOBAL_PREFIX)) {
            startIndex = GLOBAL_PREFIX.length;
        }
        
        if (startIndex === -1) {
            this.storageAdaptor?.remove(key);
            throw new Error(`failed to extract address hash from key: ${key}`);
        }

        // SHA256 hash is 66 characters long in hex (including 0x prefix)
        const possibleHash = key.slice(startIndex, startIndex + 66);
        // Validate that it's a 0x-prefixed 64-character hex string
        if (this.isValidHash(possibleHash)) {
            return possibleHash;
        }
        this.storageAdaptor?.remove(key);
        throw new Error(`failed to extract address hash from key: ${key}`);
    }

    private async persistAddressHashes(): Promise<void> {
        // Update log format
        console.log('storagemanager persistingAddressHashes', this.addressHashes);
        await this.storageAdaptor?.set(
            this.getGlobalKey(StorageManager.ADDRESS_HASHES_KEY),
            JSON.stringify(this.addressHashes)
        );
    }

    private async cleanStorageEntryOnInit(key: string): Promise<void> {
        if (!this.isValidPrefix(key)) {
            await this.storageAdaptor?.remove(key);
            return;
        }
        // skip global prefix
        if (key.startsWith(GLOBAL_PREFIX)) {
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
        // log entry
        console.log('storagemanager initCleaning');
        await this.processAllEntries((key) => 
            this.cleanStorageEntryOnInit(key)
        );
    }

    async init(): Promise<void> {
        // log entry
        console.log('storagemanager init');
        await this.loadAddressHashes();
        
        if (!(await this.isInitialized())) {
            await this.initCleaning();
            await this.persistAddressHashes();
            await this.markAsInitialized();
        }
        
        
    }

    async deleteEntriesWithHash(hash: string): Promise<void> {
        const adaptor = this.storageAdaptor;
        if (!adaptor) {
            throw new Error('Storage adaptor not initialized');
        }
        // log entry
        console.log('storagemanager deleteEntriesWithHash', hash);
        await this.processAllEntries(async (key) => {
            // skip invalid prefix nor global prefix
            if (!this.isValidPrefix(key) || key.startsWith(GLOBAL_PREFIX)) {
                return;
            }
            const extractedHash = this.extractAddressHash(key);
            if (extractedHash === hash) {
                await adaptor.remove(key);
            }
        });
    }
} 