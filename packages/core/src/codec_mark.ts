import { GroupIDLength, IMUserMarkedGroupId, IMUserMarkedGroupIdIntermediate, MessageCurrentSchemaVersion } from "./types";
import { WriteStream, ReadStream, Converter } from "@iota/util.js";
import { unixSecondsToBytes, bytesToUnixSeconds } from 'iotacat-sdk-utils'
import { serializeCommonHeader, deserializeCommonHeader } from "./codec_common";
export function serializeUserMarkedGroupIds(list:IMUserMarkedGroupId[],
    ctx:{[key:string]:any}
) : Uint8Array {
    const stream = new WriteStream();
    const listIntermediate:IMUserMarkedGroupIdIntermediate[] = list.map(umg => ({
        groupId: Converter.hexToBytes(umg.groupId),
        timestamp: unixSecondsToBytes(umg.timestamp)
    }))
    serializeCommonHeader(stream, ctx);
    serializeUserMarkedGroupIdsIntermediate(stream, listIntermediate);
    return stream.finalBytes();
}

export function serializeUserMarkedGroupIdsIntermediate(writer: WriteStream, list: IMUserMarkedGroupIdIntermediate[]) {
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
    const { schemaVersion } =
        deserializeCommonHeader(reader);
    if (schemaVersion !== MessageCurrentSchemaVersion) {
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

