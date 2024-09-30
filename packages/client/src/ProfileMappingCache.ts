import { IotaCatSDKObj, ProfileResponse } from "groupfi-sdk-core";

class ProfileCache {
    private _profileCache: Map<string, ProfileResponse> = new Map<string, ProfileResponse>();

    private _getKey(address: string): string {
        return `profile-${address}`;
    }

    private async _fetchProfilesFromApi(addresses: string[]): Promise<Map<string, ProfileResponse>> {
        console.log(`Fetching profiles for addresses: ${addresses}`);
        const profiles = await IotaCatSDKObj._fetchProfilesByEvmAddresses(addresses);
        const result = new Map<string, ProfileResponse>();

        for (const profile of profiles) {
            result.set(profile.address, profile);
        }

        return result;
    }

    private _updateCache(newProfiles: Map<string, ProfileResponse>): void {
        for (const [address, profile] of newProfiles) {
            const key = this._getKey(address);
            this._profileCache.set(key, profile);
        }
    }

    public async batchGetProfiles(addresses: string[]): Promise<Map<string, ProfileResponse>> {
        const result = new Map<string, ProfileResponse>();
        const cacheMisses: string[] = [];

        for (const address of addresses) {
            const key = this._getKey(address);
            if (this._profileCache.has(key)) {
                result.set(address, this._profileCache.get(key)!);
            } else {
                cacheMisses.push(address);
            }
        }

        if (cacheMisses.length > 0) {
            const fetchedProfiles = await this._fetchProfilesFromApi(cacheMisses);
            this._updateCache(fetchedProfiles);
            for (const [address, profile] of fetchedProfiles) {
                result.set(address, profile);
            }
        }

        return result;
    }
}

const profileCache = new ProfileCache();
export default profileCache;
