import { GroupIDLength, IMUserMarkedGroupId, IMUserMarkedGroupIdIntermediate, MarkSchemaVersion } from "./types";
import { WriteStream, ReadStream, Converter } from "@iota/util.js";
import { unixSecondsToBytes, bytesToUnixSeconds } from 'groupfi-sdk-utils'

export function serializeUserMarkedGroupIds(list:IMUserMarkedGroupId[]) : Uint8Array {
    const stream = new WriteStream();
    const listIntermediate:IMUserMarkedGroupIdIntermediate[] = list.map(umg => ({
        groupId: Converter.hexToBytes(umg.groupId),
        timestamp: unixSecondsToBytes(umg.timestamp)
    }))

    serializeUserMarkedGroupIdsIntermediate(stream, listIntermediate);
    return stream.finalBytes();
}

export function serializeUserMarkedGroupIdsIntermediate(writer: WriteStream, list: IMUserMarkedGroupIdIntermediate[]) {
    // first write schema version
    writer.writeUInt8("schema_version", MarkSchemaVersion);
    for (const userMarkedGroupIdIntermediate of list) {
        const { groupId, timestamp } = userMarkedGroupIdIntermediate;
        // check if list.groupId is 32 bytes
        if (groupId.byteLength !== GroupIDLength) {
            throw new Error(`groupId length is not ${GroupIDLength} bytes`);
        }
        if (timestamp.byteLength !== 4) {
            throw new Error(`timestamp length is not 4 bytes`);
        }
        // write groupId
        writer.writeBytes("groupId", GroupIDLength, groupId);
        // write timestamp
        writer.writeBytes("timestamp", 4, timestamp);
    }
}

export function deserializeUserMarkedGroupIdsIntermediate(reader: ReadStream): IMUserMarkedGroupIdIntermediate[] {
    const schemaVersion = reader.readUInt8("schema_version");
    if (schemaVersion !== MarkSchemaVersion) {
        throw new Error(`schema version ${schemaVersion} is not supported`);
    }
    const list: IMUserMarkedGroupIdIntermediate[] = [];
    while (reader.hasRemaining(1)) {
        const groupId = reader.readBytes("groupId", GroupIDLength);
        const timestamp = reader.readBytes("timestamp", 4);
        list.push({
            groupId,
            timestamp
        });
    }
    return list;
}

export function deserializeUserMarkedGroupIds(bytes: Uint8Array): IMUserMarkedGroupId[] {
    const listIntermediate = deserializeUserMarkedGroupIdsIntermediate(new ReadStream(bytes));
    console.log('deserializeUserMarkedGroupIds listIntermediate', listIntermediate)
    return listIntermediate.map(umg => ({
        groupId: Converter.bytesToHex(umg.groupId),
        timestamp: bytesToUnixSeconds(umg.timestamp)
    }))
}

