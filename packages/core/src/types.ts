import { GROUPFIMARKTAG, GROUPFIMUTETAG, GROUPFIVOTETAG, IOTACATSHAREDTAG, IOTACATTAG } from ".";

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
    timestamp: number; // 4 bytes
    recipients?: IMRecipient[];
    recipientOutputid?: string; // 32 bytes
    data: string;
}
export interface IMMessageIntermediate {
    schemaVersion: number; // 0 or 1, 1 byte
    groupId: Uint8Array; // sha256  bytes
    messageType: number; // 0 or 1, 1 byte
    authScheme: number; // 0 or 1, 1 byte
    timestamp: number; // 4 bytes
    recipients?: IMRecipientIntermediate[];
    recipientOutputid?: Uint8Array; // 32 bytes
    data: Uint8Array;
}
export interface IMUserMarkedGroupId {
    groupId: string;
    timestamp: number;
}
export interface IMUserMarkedGroupIdIntermediate {
    groupId: Uint8Array;
    timestamp: Uint8Array;
}

export interface IMUserMuteGroupMember {
    groupId: string;
    addrSha256Hash: string;
}

export interface IMUserMuteGroupMemberIntermediate {
    groupId: Uint8Array;
    addrSha256Hash: Uint8Array;
}

export interface IMUserVoteGroup {
    groupId: string;
    vote: number;
}
export type VotePublic = 0
export type VotePrivate = 1
export interface IMUserVoteGroupIntermediate {
    groupId: Uint8Array;
    vote: Uint8Array;
}
export const ShimmerBech32Addr = 1
export const ShimmerEvmAddr = 2
export type Address = {
    type: typeof ShimmerBech32Addr | typeof ShimmerEvmAddr
    addr: string
}
export const INX_GROUPFI_DOMAIN = process.env.INX_GROUPFI_DOMAIN
export const NFT_CONFIG_URL = 'https://api.iotaichi.com'
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
    qualifyType: GroupQualifyTypeStr,
    chainName: string,
    tokenThres: string,
    tokenId: string,
    collectionIds: string[],
}
export type PushedNewMessage = {type:typeof ImInboxEventTypeNewMessage, groupId:string, sender:string, meta:string}
export type EventGroupMemberChanged = {type:typeof ImInboxEventTypeGroupMemberChanged, groupId:string, timestamp:number, isNewMember:boolean, address:string}
export type EventGroupMarkChanged = {type: typeof ImInboxEventTypeMarkChanged, groupId: string, timestamp: number, isNewMark: boolean} 
export type EventGroupUpdateMinMaxToken = {
    type: typeof DomainGroupUpdateMinMaxToken
    groupId:string
    min?:string
    max?:string
}
export type PushedValue = PushedNewMessage | EventGroupMemberChanged | EventGroupMarkChanged
export type MessageGroupMetaKey = keyof MessageGroupMeta
export type MessageAuthScheme = typeof MessageAuthSchemeRecipeintInMessage | typeof MessageAuthSchemeRecipeintOnChain

export const AddressHashLength = 20
export const GroupIDLength = 32
export const OutputIDLength = 34

export const GroupMemberTooManyToPublicThreshold = 100
export type EncryptedHexPayload = {
    payload:string,
} & any;
export class SharedNotFoundError extends Error {
    sharedOutputId: string;

    constructor(message: string, sharedOutputId: string) {
        super(message); // Pass the message to the base Error class
        this.sharedOutputId = sharedOutputId;
        this.name = this.constructor.name; // Set the error name to the class name

        // Maintaining proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}

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
export class UserDoesNotHasEnoughTokenError extends Error {
    constructor() {
        super(`user does not has enough token`)
         // Set the name for the custom error
         this.name = this.constructor.name;
    
         // This ensures that CustomError instances have a proper stack trace.
         if (Error.captureStackTrace) {
             Error.captureStackTrace(this, this.constructor);
         }
    }
}
export type IMessage = {type:typeof ImInboxEventTypeNewMessage,messageId:string, groupId:string, sender:string, message:string, timestamp:number,token?:string}
export type EventItemFromFacade = EventGroupMemberChanged | IMessage | EventGroupMarkChanged
export interface IGroupFiSDK {
    bootstrap(): Promise<void>;
    getGroups(): Promise<{groupId:string,groupName:string}[]>;
    getInboxMessages(from?:string,until?:string,limit?:number): Promise<IMessage[]>;
    sendMessage(groupId:string, message:string): Promise<{status:number,message?:string}>;
    onMessage(callback:(message:IMessage)=>void):void;
}

export const GroupQualifyTypeNFT = 0
export const GroupQualifyTypeToken = 1
export type GroupQualifyType  = typeof GroupQualifyTypeNFT | typeof GroupQualifyTypeToken
export const GroupQualifyTypeNFTStr = 'nft'
export const GroupQualifyTypeTokenStr = 'token'
export type GroupQualifyTypeStr = typeof GroupQualifyTypeNFTStr | typeof GroupQualifyTypeTokenStr
export interface IGroupQualify {
    groupId:string
    groupName:string
    groupQualifyType:GroupQualifyType
    ipfsLink:string
    tokenName:string
    tokenThres:string
}

export interface IGroupUserReputation {
    groupId:string
    addressSha256Hash:string
    reputation:number
}

/*
const (
	// plain text, new message
	ImInboxEventTypeNewMessage         byte = 1
	ImInboxEventTypeGroupMemberChanged byte = 2
)
*/
export const ImInboxEventTypeNewMessage = 1
export const ImInboxEventTypeGroupMemberChanged = 2
export const DomainGroupUpdateMinMaxToken = 3
export const ImInboxEventTypeMarkChanged = 4

export type InboxItemResponse = {
    items:EventItem[]
    token:string
}

export type EventItem = MessageResponseItem | EventGroupMemberChanged

export type MessageResponseItem = {
    type: typeof ImInboxEventTypeNewMessage
    outputId: string;
    token: string;
    timestamp: number;
}
export type PublicItemsResponse = {
    items:MessageResponseItem[]
    startToken:string
    endToken:string
}
export const GROUPFICASHTAG = 'GROUPFICASH'

// tags that can not be used by user
/*
export const IOTACATTAG = 'GROUPFIV4'
export const IOTACATSHAREDTAG = 'GROUPFISHAREDV2'
export const GROUPFIMARKTAG = 'GROUPFIMARKV2'
export const GROUPFIMUTETAG = 'GROUPFIMUTEV1'
export const GROUPFIVOTETAG = 'GROUPFIVOTEV2'
export const GROUPFISELFPUBLICKEYTAG = 'GROUPFISELFPUBLICKEY'
*/
export const GROUPFIReservedTags = [
    IOTACATTAG,
    IOTACATSHAREDTAG,
    GROUPFIMARKTAG,
    GROUPFIMUTETAG,
    GROUPFIVOTETAG,
    'PARTICIPANTION',
]
