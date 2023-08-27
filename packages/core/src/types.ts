export interface IMRecipient {
    addr: string;
    mkey: string;
}
export interface IMRecipientIntermediate {
    addr: Uint8Array;
    mkey: Uint8Array;
}
export interface IMMessage {
    schemaVersion: number; // 0 or 1, 1 byte
    group: string; // sha256  bytes
    messageType: number; // 0 or 1, 1 byte
    authScheme: number; // 0 or 1, 1 byte
    recipients: IMRecipient[];
    recipientOutputid?: string; // 32 bytes
    data: string[];
}
export interface IMMessageIntermediate {
    schemaVersion: number; // 0 or 1, 1 byte
    group: string; // sha256  bytes
    messageType: number; // 0 or 1, 1 byte
    authScheme: number; // 0 or 1, 1 byte
    recipients: IMRecipientIntermediate[];
    recipientOutputid?: string; // 32 bytes
    data: string[];
}
export const ShimmerBech32Addr = 1
export const ShimmerEvmAddr = 2
export type Address = {
    type: typeof ShimmerBech32Addr | typeof ShimmerEvmAddr
    addr: string
}
export const INX_GROUPFI_DOMAIN = "test2.api.iotacat.com"
export const MessageCurrentSchemaVersion = 1
export const MessageTypePrivate = 1
export const MessageTypePublic = 2
export const MessageAuthSchemeRecipeintInMessage = 1
export const MessageAuthSchemeRecipeintOnChain = 2
export interface MessageGroupMeta {
    groupName: string;
    schemaVersion: number; 
    messageType:typeof MessageTypePrivate | typeof MessageTypePublic,
    authScheme: typeof MessageAuthSchemeRecipeintInMessage | typeof MessageAuthSchemeRecipeintOnChain,
}
export type PushedValue = {type:1,groupId:string,outputId:string}| {type:2, groupId:string, sender:string, meta:string}
export type MessageGroupMetaKey = keyof MessageGroupMeta
export type MessageAuthScheme = typeof MessageAuthSchemeRecipeintInMessage | typeof MessageAuthSchemeRecipeintOnChain