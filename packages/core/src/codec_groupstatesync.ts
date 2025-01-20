import { Converter, ReadStream, WriteStream } from "@iota/util.js";
import { GroupStateSyncSchemaVersion, GroupStateSync, GroupStateSyncItem, GroupIDLength } from "./types";
import { uint16ToBytes, uint32ToBytes } from "groupfi-sdk-utils";

// serialize group state sync
export function serializeGroupStateSync(items: GroupStateSyncItem[]): Uint8Array {
    const writer = new WriteStream();
    writer.writeUInt8("schema_version", GroupStateSyncSchemaVersion);
    const itemsLengthBytes = uint16ToBytes(items.length);
    writer.writeBytes("items_length", itemsLengthBytes.length, itemsLengthBytes);
    for (const item of items) {
        writer.writeBytes("group_id", GroupIDLength,Converter.hexToBytes(item.groupId));
        const lastTimeReadLatestMessageTimestampBytes = uint32ToBytes(item.lastTimeReadLatestMessageTimestamp);
        writer.writeBytes("lastTimeReadLatestMessageTimestamp", lastTimeReadLatestMessageTimestampBytes.length, lastTimeReadLatestMessageTimestampBytes);
    }
    return writer.finalBytes();
}
