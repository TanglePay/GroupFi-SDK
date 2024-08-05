import EventEmitter from "events";
import { IotaCatSDKObj } from "groupfi-sdk-core";

class AddressMappingStore {
    private _event: EventEmitter = new EventEmitter();
    private _mappingStore: Map<string, string> = new Map<string, string>();
    private _fetchingHandle: NodeJS.Timeout | null = null;
    private _pendingSet: Set<string> = new Set<string>();
    private _callbacks: Map<string, Array<(address: string) => void>> = new Map<string, Array<(address: string) => void>>();
    private _debounceTime: number = 100; // Adjust the debounce time as needed

    private _debounceFetchPendingSet = this._debounce(() => {
        this._fetchPendingSet();
    }, this._debounceTime);

    private _getKey(address: string): string {
        return `mapping-${address}`;
    }

    _addToPendingSet(address: string): void {
        this._pendingSet.add(address);
        this._debounceFetchPendingSet();
    }

    async _fetchPendingSet(): Promise<void> {
        try {
            // Fetch the addresses in the pending set
            const addresses = Array.from(this._pendingSet);
            // Clear the pending set
            this._pendingSet.clear();
            // Fetch the addresses
            console.log(`fetching addresses: ${addresses}`);
            const mapping = await IotaCatSDKObj.batchSmrAddressToEvmAddress(addresses);
            // Store the mapping and emit the event
            for (const [address, evmAddress] of Object.entries(mapping)) {
                const key = this._getKey(address);
                this._mappingStore.set(key, evmAddress);
                // Emit the event for all callbacks
                if (this._callbacks.has(key)) {
                    for (const callback of this._callbacks.get(key)!) {
                        callback(evmAddress);
                    }
                    this._callbacks.delete(key);
                }
            }
        } finally {
            // If there are still addresses in the pending set, schedule another fetch
            if (this._pendingSet.size > 0) {
                this._debounceFetchPendingSet();
            } else {
                this._fetchingHandle = null;
            }
        }
    }

    async getEvmAddress(address: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.getMapping(address, resolve, reject);
        });
    }

    public getMapping(address: string, callback: (address: string) => void, errorCallBack: (error: Error) => void): void {
        const key = this._getKey(address);
        if (this._mappingStore.has(key)) {
            callback(this._mappingStore.get(key)!);
        } else {
            if (!this._callbacks.has(key)) {
                this._callbacks.set(key, []);
            }
            this._callbacks.get(key)!.push(callback);
            this._addToPendingSet(address);
            setTimeout(() => {
                if (this._mappingStore.has(key)) {
                    return;
                }
                if (this._callbacks.has(key)) {
                    this._callbacks.get(key)!.forEach(cb => errorCallBack(new Error(`Timeout fetching mapping for address: ${address}`)));
                    this._callbacks.delete(key);
                }
            }, 15000);
        }
    }

    private _debounce(func: () => void, wait: number) {
        let timeout: NodeJS.Timeout | null = null;
        return () => {
            if (timeout) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(() => {
                func();
            }, wait);
        };
    }
}

const instance = new AddressMappingStore();
export default instance;
