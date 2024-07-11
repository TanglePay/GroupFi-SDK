import { Converter, ReadStream, WriteStream } from "@iota/util.js";
import { GroupStateSyncSchemaVersion, GroupStateSync, GroupStateSyncItem, GroupIDLength } from "./types";

// serialize group state sync
export function serializeGroupStateSync(items: GroupStateSyncItem[]): Uint8Array {
    const writer = new WriteStream();
    writer.writeUInt8("schema_version", GroupStateSyncSchemaVersion);
    writer.writeUInt16("items_length", items.length);
    for (const item of items) {
        writer.writeBytes("group_id", GroupIDLength,Converter.hexToBytes(item.groupId));
        writer.writeUInt32("lastTimeReadLatestMessageTimestamp", item.lastTimeReadLatestMessageTimestamp);
    }
    return writer.finalBytes();
}

// deserialize group state sync
export function deserializeGroupStateSync(bytes: Uint8Array): GroupStateSync {
    const reader = new ReadStream(bytes);
    const schemaVersion = reader.readUInt8("schema_version");
    const itemsLength = reader.readUInt16("items_length");
    const items = [];
    for (let i = 0; i < itemsLength; i++) {
        const groupId = Converter.bytesToHex(reader.readBytes("group_id", GroupIDLength), true);
        const lastTimeReadLatestMessageTimestamp = reader.readUInt32("lastTimeReadLatestMessageTimestamp");
        items.push({
            groupId,
            lastTimeReadLatestMessageTimestamp
        });
    }
    return {
        schemaVersion,
        items
    };
}