import { IotaCatSDKObj } from "groupfi-sdk-core";

class AddressMappingCache {
    private _mappingCache: Map<string, string> = new Map<string, string>();

    private _getKey(address: string): string {
        return `mapping-${address}`;
    }

    private async _fetchAddressesFromApi(addresses: string[]): Promise<Map<string, string>> {
        console.log(`fetching addresses: ${addresses}`);
        const mapping = await IotaCatSDKObj.batchSmrAddressToEvmAddress(addresses);
        const result = new Map<string, string>();
        for (const [address, evmAddress] of Object.entries(mapping)) {
            result.set(address, evmAddress);
        }
        return result;
    }

    private _updateCache(newMappings: Map<string, string>): void {
        for (const [address, evmAddress] of newMappings) {
            const key = this._getKey(address);
            this._mappingCache.set(key, evmAddress);
        }
    }

    public async batchGetEvmAddresses(addresses: string[]): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        const cacheMisses: string[] = [];

        for (const address of addresses) {
            const key = this._getKey(address);
            if (this._mappingCache.has(key)) {
                result.set(address, this._mappingCache.get(key)!);
            } else {
                cacheMisses.push(address);
            }
        }

        if (cacheMisses.length > 0) {
            const fetchedMappings = await this._fetchAddressesFromApi(cacheMisses);
            this._updateCache(fetchedMappings);
            for (const [address, evmAddress] of fetchedMappings) {
                result.set(address, evmAddress);
            }
        }

        return result;
    }
}

const addressMappingCache = new AddressMappingCache();
export default addressMappingCache;
