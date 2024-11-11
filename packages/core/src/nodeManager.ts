import { INodeProvider } from "./types";

export class NodeManager implements INodeProvider {
    private currentUrl: string = "";
    private backendDomain: string;
  
    constructor(backendDomain: string) {
      this.backendDomain = backendDomain;
    }
  
    // Getter for the current URL
    getUrl(): string {
      return process.env.INX_GROUPFI_DOMAIN??this.currentUrl;
    }
  
    // Report failure and trigger a new URL fetch
    reportFailure(): void {
      console.warn("Current URL failed. Fetching a new URL...");
      this.fetchUrlFromBackend();
    }
  
    // Fetches a working URL from the backend API
    async fetchUrlFromBackend(): Promise<void> {
      try {
        const response = await fetch(`https://${this.backendDomain}/hornet`);
        const data = await response.json();
  
        // Assuming the response format is: {"id":1,"result":true,"rpc":"https://test2.api.groupfi.ai"}
        if (data.result && data.rpc) {
          this.currentUrl = data.rpc;
        } else {
          console.error("Unexpected response format:", data);
          throw new Error("Invalid response from backend");
        }
      } catch (error) {
        console.error("Failed to fetch URL from backend:", error);
        throw new Error("Unable to fetch a working URL from the backend");
      }
    }
  }
  