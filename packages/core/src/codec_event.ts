import { DidChangedEvent, EventGroupMarkChanged, EventGroupMemberChanged, EvmQualifyChangedEvent, GroupIDLength, IMUserMarkedGroupId, IMUserMarkedGroupIdIntermediate, ImInboxEventTypeDidChangedEvent, ImInboxEventTypeEvmQualifyChanged, ImInboxEventTypeGroupMemberChanged, ImInboxEventTypeMarkChanged, ImInboxEventTypeNewMessage, ImInboxEventTypePairXChanged, MessageCurrentSchemaVersion, PairXChangedEvent, PushedEvent, PushedNewMessage, PushedValue, Sha256Length } from "./types";
import { WriteStream, ReadStream, Converter } from "@iota/util.js";
import { unixSecondsToBytes, bytesToUnixSeconds } from 'iotacat-sdk-utils'
import { deserializeFieldWithLengthPrefixed } from "./codec_util";

export function deserializePushed(data: Uint8Array): PushedValue {
    // reader stream
    const reader = new ReadStream(data);
    // read event type, which is 1 byte
    const eventType = reader.readUInt8("event_type");
    // case ImInboxEventTypeGroupMemberChanged
    if (eventType === ImInboxEventTypeGroupMemberChanged) {
        return {
            type: ImInboxEventTypeGroupMemberChanged,
            ...deserializeGroupMemberChangedEvent(reader)
        };
    } else if (eventType === ImInboxEventTypeEvmQualifyChanged) {
        return {
            type: ImInboxEventTypeEvmQualifyChanged,
            ...deserializeEvmQualifyChangedEvent(reader)
        };
    } else if (eventType === ImInboxEventTypeMarkChanged) {
        return {
            type: ImInboxEventTypeMarkChanged,
            ...deserializeMarkChangedEvent(reader)
        };
    } else if (eventType === ImInboxEventTypePairXChanged) {
        return {
            type: ImInboxEventTypePairXChanged,
            ...deserializePairXChangedEvent(reader)
        };
    } else if (eventType === ImInboxEventTypeDidChangedEvent) {
        return {
            type: ImInboxEventTypeDidChangedEvent,
            ...deserializeDidChangedEvent(reader)
        };
    } else if (eventType === ImInboxEventTypeNewMessage) {
        return {
            type: ImInboxEventTypeNewMessage,
            ...deserializeNewMessageEvent(reader)
        };
    } else {
        throw new Error("Unrecognized event type");
    }
    
}

export function deserializeGroupMemberChangedEvent(reader : ReadStream): Omit<EventGroupMemberChanged,'type'> {
    // read groupId
    const groupIdBytes = reader.readBytes("groupId", GroupIDLength);
    const groupId = Converter.bytesToHex(groupIdBytes, true);
    // read timestamp
    const timestamp = reader.readUInt32("timestamp");
    // read isNewMember
    const isNewMember = reader.readUInt8("isNewMember") === 1;
    // deserializeFieldWithLengthPrefixed
    const addressBytes = deserializeFieldWithLengthPrefixed(reader, "address");
    const address = Converter.bytesToUtf8(addressBytes);
    return {
        groupId,
        timestamp,
        isNewMember,
        address
    };
}
export function deserializeEvmQualifyChangedEvent(reader : ReadStream): Omit<EvmQualifyChangedEvent,'type'> {
    // read groupId
    const groupIdBytes = reader.readBytes("groupId", GroupIDLength);
    const groupId = Converter.bytesToHex(groupIdBytes, true);
    // read timestamp
    const timestamp = reader.readUInt32("timestamp");
    return {
        groupId,
        timestamp
    };
}

// deserializeMarkChangedEvent
export function deserializeMarkChangedEvent(reader : ReadStream): Omit<EventGroupMarkChanged,'type'> {
    // read groupId
    const groupIdBytes = reader.readBytes("groupId", GroupIDLength);
    const groupId = Converter.bytesToHex(groupIdBytes, true);
    // read timestamp
    const timestamp = reader.readUInt32("timestamp");
    // read isNewMark
    const isNewMark = reader.readUInt8("isNewMark") === 1;
    
    return {
        groupId,
        timestamp,
        isNewMark
    };
}

// deserializePairXChangedEvent
export function deserializePairXChangedEvent(reader : ReadStream): Omit<PairXChangedEvent,'type'> {
    // read addressSha256Hash
    const addressSha256Hash = Converter.bytesToHex(reader.readBytes("addressSha256Hash", 32), true);
    // read timestamp
    const timestamp = reader.readUInt32("timestamp");
    return {
        addressSha256Hash,
        timestamp
    };
}

// deserializeDidChangedEvent
export function deserializeDidChangedEvent(reader : ReadStream): Omit<DidChangedEvent,'type'> {
    // read addressSha256Hash
    const addressSha256Hash = Converter.bytesToHex(reader.readBytes("addressSha256Hash", 32), true);
    // read timestamp
    const timestamp = reader.readUInt32("timestamp");
    return {
        addressSha256Hash,
        timestamp
    };
}

// deserializeNewMessageEvent
export function deserializeNewMessageEvent(reader : ReadStream): Omit<PushedNewMessage,'type'> {
    // read schema version
    const schemaVersion = reader.readUInt8("schema_version");
    const addressHash = Converter.bytesToHex(reader.readBytes("addressHash", Sha256Length), true);
    // rest is meta
    const meta = reader.readBytes("meta", reader.length() - reader.getReadIndex())
    const readerMeta = new ReadStream(meta);
    // read one byte to skip
    readerMeta.readUInt8("skip");
    // read groupId
    const groupId = Converter.bytesToHex(readerMeta.readBytes("groupId", GroupIDLength), true);
    return {
        groupId,
        sender:addressHash,
        meta:Converter.bytesToHex(meta, true)
    };
}