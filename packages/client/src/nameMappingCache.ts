import { IotaCatSDKObj } from 'groupfi-sdk-core';

class MappingCache<T> {
  private _mappingCache: Map<string, T> = new Map<string, T>();

  private _getMapKey(key: string): string {
    return `mapping-${key}`;
  }

  private _api: (keys: string[]) => Promise<{ [key: string]: T }>;

  constructor(api: (keys: string[]) => Promise<{ [key: string]: T }>) {
    this._api = api;
  }

  private async _fetchFromApi(keys: string[]): Promise<Map<string, T>> {
    const mapping = await this._api(keys);
    const result = new Map<string, T>();
    for (const [key, res] of Object.entries<T>(mapping)) {
      result.set(key, res);
    }
    return result;
  }

  private _updateCache(newMappings: Map<string, T>): void {
    for (const [key, res] of newMappings) {
      const mapkey = this._getMapKey(key);
      this._mappingCache.set(mapkey, res);
    }
  }

  public async batchGetRes(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    const cacheMisses: string[] = [];

    for (const key of keys) {
      const mapkey = this._getMapKey(key);
      if (this._mappingCache.has(mapkey)) {
        result.set(key, this._mappingCache.get(mapkey)!);
      } else {
        cacheMisses.push(key);
      }
    }

    if (cacheMisses.length > 0) {
      const fetchedMappings = await this._fetchFromApi(cacheMisses);
      this._updateCache(fetchedMappings);
      for (const [key, res] of fetchedMappings) {
        result.set(key, res);
      }
    }

    return result;
  }

  private _pendingSet: Set<string> = new Set<string>();
  private _callbacks: Map<string, Array<(res: T) => void>> = new Map<
    string,
    Array<(res: T) => void>
  >();
  private _debounceTime: number = 100; // Adjust the debounce time as needed

  async getRes(key: string): Promise<T> {
    return new Promise((resolve, reject) => {
      this.getMapping(key, resolve, reject);
    });
  }

  public getMapping(
    address: string,
    callback: (res: T) => void,
    errorCallBack: (error: Error) => void
  ): void {
    const mapkey = this._getMapKey(address);
    if (this._mappingCache.has(mapkey)) {
      callback(this._mappingCache.get(mapkey)!);
    } else {
      if (!this._callbacks.has(mapkey)) {
        this._callbacks.set(mapkey, []);
      }
      this._callbacks.get(mapkey)!.push(callback);
      this._addToPendingSet(address);
      setTimeout(() => {
        if (this._mappingCache.has(mapkey)) {
          return;
        }
        if (this._callbacks.has(mapkey)) {
          this._callbacks
            .get(mapkey)!
            .forEach((cb) =>
              errorCallBack(
                new Error(`Timeout fetching mapping for address: ${address}`)
              )
            );
          this._callbacks.delete(mapkey);
        }
      }, 15000);
    }
  }

  _addToPendingSet(key: string): void {
    this._pendingSet.add(key);
    this._debounceFetchPendingSet();
  }

  private _debounceFetchPendingSet = this._debounce(() => {
    this._fetchPendingSet();
  }, this._debounceTime);

  async _fetchPendingSet(): Promise<void> {
    try {
      const keys = Array.from(this._pendingSet);
      // Clear the pending set
      this._pendingSet.clear();
      const mapping = await this._api(keys);
      // Store the mapping and emit the event
      for (const [key, res] of Object.entries(mapping)) {
        const mapkey = this._getMapKey(key);
        this._mappingCache.set(mapkey, res);
        // Emit the event for all callbacks
        if (this._callbacks.has(mapkey)) {
          for (const callback of this._callbacks.get(mapkey)!) {
            callback(res);
          }
          this._callbacks.delete(mapkey);
        }
      }
    } finally {
      // If there are still addresses in the pending set, schedule another fetch
      if (this._pendingSet.size > 0) {
        this._debounceFetchPendingSet();
      }
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

const nameMappingCache = new MappingCache<{ name: string }>(
  IotaCatSDKObj.fetchAddressNames
);

export default nameMappingCache;
