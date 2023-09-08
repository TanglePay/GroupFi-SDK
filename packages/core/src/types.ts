
export interface IMRecipient {
    addr: string;
    mkey: string;
}
export interface IMRecipientIntermediate {
    addr: Uint8Array;
    mkey: Uint8Array;
}
export interface IMRecipientIntermediateList {
    list: IMRecipientIntermediate[];
    schemaVersion: number;
    groupId: Uint8Array; 
}

export interface IMMessage {
    schemaVersion: number; // 0 or 1, 1 byte
    groupId: string; // sha256  bytes
    messageType: number; // 0 or 1, 1 byte
    authScheme: number; // 0 or 1, 1 byte
    recipients?: IMRecipient[];
    recipientOutputid?: string; // 32 bytes
    data: string;
}
export interface IMMessageIntermediate {
    schemaVersion: number; // 0 or 1, 1 byte
    groupId: Uint8Array; // sha256  bytes
    messageType: number; // 0 or 1, 1 byte
    authScheme: number; // 0 or 1, 1 byte
    recipients?: IMRecipientIntermediate[];
    recipientOutputid?: Uint8Array; // 32 bytes
    data: Uint8Array;
}
export const ShimmerBech32Addr = 1
export const ShimmerEvmAddr = 2
export type Address = {
    type: typeof ShimmerBech32Addr | typeof ShimmerEvmAddr
    addr: string
}
export const INX_GROUPFI_DOMAIN = "test.api.iotacat.com"
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

export const AddressHashLength = 20
export const GroupIDLength = 32
export const OutputIDLength = 34

export const GroupMemberTooManyToPublicThreshold = 100

export class GroupMemberTooManyError extends Error {
    constructor() {
        super(`members in group exceed ${GroupMemberTooManyToPublicThreshold}`)
         // Set the name for the custom error
         this.name = this.constructor.name;
    
         // This ensures that CustomError instances have a proper stack trace.
         if (Error.captureStackTrace) {
             Error.captureStackTrace(this, this.constructor);
         }
    }
    
    
}