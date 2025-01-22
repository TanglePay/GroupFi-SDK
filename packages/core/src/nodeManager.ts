import { INodeProvider, StorageFacade } from "./types";

export class NodeManager implements INodeProvider {
    private currentUrl: string | undefined;
    private backendDomain: string;
    private storageFacade: StorageFacade;
    private static readonly STORAGE_KEY = 'groupfi_node_url';
  
    constructor(backendDomain: string, storageFacade: StorageFacade) {
      this.backendDomain = backendDomain;
      this.storageFacade = storageFacade;
    }
  
    getUrl(): string {
      if (process.env.INX_GROUPFI_DOMAIN) {
        return 'https://' + process.env.INX_GROUPFI_DOMAIN;
      }
      return this.currentUrl || '';
    }
  
    reportFailure(): void {
      console.warn("Current URL failed. Fetching a new URL...");
      this.fetchUrlFromBackend();
    }
  
    async fetchUrlFromBackend(): Promise<void> {
      if (!this.currentUrl) {
        // First try to get from storage immediately
        const storedUrl = await this.storageFacade.get(this.storageFacade.prefix + NodeManager.STORAGE_KEY);
        if (storedUrl) {
          this.currentUrl = storedUrl;
          // Trigger API refresh in background
          this.refreshFromApi();
          return;
        }
      }

      // If no stored URL, wait for API call
      try {
        const newUrl = await this.fetchFromApi();
        this.currentUrl = newUrl;
      } catch (error) {
        if (!this.currentUrl) {
          console.error("Error fetching URL:", error);
          throw new Error("Unable to fetch a working URL");
        }
        console.warn("Failed to refresh URL from API:", error);
      }
    }

    private async fetchFromApi(): Promise<string> {
      try {
        const response = await fetch(`https://${this.backendDomain}/hornet`);
        const data = await response.json();

        if (data.result && data.rpc) {
          // Store the new URL in storage without awaiting
          this.storageFacade.set(NodeManager.STORAGE_KEY, data.rpc).catch(err => {
            console.warn("Failed to persist URL to storage:", err);
          });
          return data.rpc;
        } else {
          console.error("Unexpected response format:", data);
          throw new Error("Invalid response from backend");
        }
      } catch (error) {
        console.error("Failed to fetch URL from backend:", error);
        throw error;
      }
    }

    private async refreshFromApi(): Promise<void> {
      try {
        const newUrl = await this.fetchFromApi();
        this.currentUrl = newUrl;
      } catch (error) {
        console.warn("Background URL refresh failed:", error);
      }
    }
}
  