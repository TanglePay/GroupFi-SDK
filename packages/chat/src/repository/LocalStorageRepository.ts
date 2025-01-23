import { Inject, Singleton } from "typescript-ioc";
import { StorageAdaptor } from "../types";
import { StorageManager } from "../domain/StorageManager";
import { GLOBAL_PREFIX } from "../constants";

// persist and retrieve data from local storage
// device abstraction should be injected by function call
@Singleton
export class LocalStorageRepository {
    @Inject
    private _storageManager: StorageManager;
    
    private _storageAdaptor: StorageAdaptor;
    private _storageKeyPrefix: string = '';

    setStorageAdaptor(storageAdaptor: StorageAdaptor) {
        this._storageAdaptor = storageAdaptor;
        this._storageManager.setStorageAdaptor(storageAdaptor);
    }
    setStorageKeyPrefix(storageKeyPrefix: string) {
        this._storageKeyPrefix = storageKeyPrefix;
        this._storageManager.addAddressHash(storageKeyPrefix);
    }
    private getStorageKey(key: string) {
        return `${this._storageKeyPrefix}${key}`;
    }
    private getGlobalStorageKey(key: string) {
        return `${GLOBAL_PREFIX}${key}`;
    }
    async get(key: string): Promise<string|null> {
        const storageKey = this.getStorageKey(key);
        return await this._storageAdaptor.get(storageKey);
    }
    // set
    async set(key: string, value: string) {
        const storageKey = this.getStorageKey(key);
        await this._storageAdaptor.set(storageKey, value);
    }
    // remove
    async remove(key: string) {
        const storageKey = this.getStorageKey(key);
        await this._storageAdaptor.remove(storageKey);
    }
    async getGlobal(key: string): Promise<string|null> {
        const storageKey = this.getGlobalStorageKey(key);
        return await this._storageAdaptor.get(storageKey);
    }
    async setGlobal(key: string, value: string) {
        const storageKey = this.getGlobalStorageKey(key);
        await this._storageAdaptor.set(storageKey, value);
    }
    async removeGlobal(key: string) {
        const storageKey = this.getGlobalStorageKey(key);
        await this._storageAdaptor.remove(storageKey);
    }
}