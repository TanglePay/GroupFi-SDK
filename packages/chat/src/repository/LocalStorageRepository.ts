import { Singleton } from "typescript-ioc";
import { StorageAdaptor } from "../types";
// persist and retrieve data from local storage
// device abstraction should be injected by function call
@Singleton
export class LocalStorageRepository {
    private _storageAdaptor: StorageAdaptor;
    private _storageKeyPrefix: string = '';
    private readonly GLOBAL_PREFIX = 'global:';
    setStorageAdaptor(storageAdaptor: StorageAdaptor) {
        this._storageAdaptor = storageAdaptor;
    }
    setStorageKeyPrefix(storageKeyPrefix: string) {
        this._storageKeyPrefix = storageKeyPrefix;
    }
    private getStorageKey(key: string) {
        return `${this._storageKeyPrefix}${key}`;
    }
    private getGlobalStorageKey(key: string) {
        return `${this.GLOBAL_PREFIX}${key}`;
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