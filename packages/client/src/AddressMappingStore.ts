import EventEmitter from "events";
import { IotaCatSDKObj } from "groupfi-sdk-core";

class AddressMappingStore {
    private _event: EventEmitter = new EventEmitter();
    private _mappingStore: Map<string, string> = new Map<string, string>();
    private _fetchingHandle: NodeJS.Timeout | null = null;
    private _pendingSet:Set<string> = new Set<string>();
    // function getKey(address: string): string {
    private _getKey(address: string): string {
        return `mapping-${address}`;
    }
    _addToPendingSet(address: string): void {
        this._pendingSet.add(address);
        if (this._fetchingHandle === null) {
            this._fetchingHandle = setTimeout(() => {
                this._fetchPendingSet();
            }, 0);
        }
    }
    async _fetchPendingSet(): Promise<void> {
            try {
            // fetch the addresses in the pending set
            const addresses = Array.from(this._pendingSet);
            // clear the pending set
            this._pendingSet.clear();
            // fetch the addresses
            console.log(`fetching addresses: ${addresses}`);
            const mapping = await IotaCatSDKObj.batchSmrAddressToEvmAddress(addresses);
            // for the sake of the example, we will just use the address as the mapping
            for (const [address, evmAddress] of Object.entries(mapping)) {
                const key = this._getKey(address);
                // store the mapping
                this._mappingStore.set(key, evmAddress);
                // emit the event
                this._event.emit(key, evmAddress);
            }
        } finally {
            // if there are still addresses in the pending set, schedule another fetch
            if (this._pendingSet.size > 0) {
                this._fetchingHandle = setTimeout(() => {
                    this._fetchPendingSet();
                }, 0);
            } else {
                this._fetchingHandle = null;
            }
        }
    }
    async getEvmAddress(address: string): Promise<string> {
        return new Promise((resolve, reject) => {
            this.getMapping(address, resolve, reject)
        })
    }
    public getMapping(address: string, callback: (address: string) => void, errorCallBack: (error: Error) => void): void {
        // if the address is already in the store, call the callback immediately
        const key = this._getKey(address);
        if (this._mappingStore.has(key)) {
            callback(this._mappingStore.get(key)!);
            return;
        } else {
            // otherwise, add the callback to the event emitter
            this._event.once(key, callback);
            // add the address to the pending set
            this._addToPendingSet(address);
            setTimeout(() => {
                if (this._mappingStore.has(key)) {
                    return;
                }
                errorCallBack(new Error(`Timeout fetching mapping for address: ${address}`));
            }, 15000);
        }
    }


}

const instance = new AddressMappingStore();
export default instance;