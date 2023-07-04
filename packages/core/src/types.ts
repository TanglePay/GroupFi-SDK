export interface IMMessage {
    schemaVersion: number; // 0 or 1, 1 byte
    group: string; // sha256  bytes
    messageType: number; // 0 or 1, 1 byte
    authScheme: number; // 0 or 1, 1 byte
    recipients: {addr:string,key:string}[];
    data: string[];
}
export const ShimmerBech32Addr = 1
export const ShimmerEvmAddr = 2
export type Address = {
    type: typeof ShimmerBech32Addr | typeof ShimmerEvmAddr
    addr: string
}

export const MessageCurrentSchemaVersion = 1
export const MessageTypePrivate = 1
export const MessageTypePublic = 2
export const MessageAuthSchemeRecipeintInMessage = 1
export const MessageAuthSchemeRecipeintOnChain = 2
export interface MessageGroupMeta {
    schemaVersion: number; 
    messageType:typeof MessageTypePrivate | typeof MessageTypePublic,
    authScheme: typeof MessageAuthSchemeRecipeintInMessage | typeof MessageAuthSchemeRecipeintOnChain,
}