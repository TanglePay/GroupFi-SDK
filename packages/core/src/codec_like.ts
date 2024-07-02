import { IMUserLikeGroupMember, IMUserLikeGroupMemberIntermediate, IMUserMuteGroupMember, IMUserMuteGroupMemberIntermediate, LikeSchemaVersion,  } from "./types";
import { WriteStream, ReadStream, Converter } from "@iota/util.js";

export function serializeUserLikeGroupMembers(list:IMUserLikeGroupMember[]) : Uint8Array {
    const stream = new WriteStream();
    const listIntermediate:IMUserLikeGroupMemberIntermediate[] = list.map(ulg => ({
        groupId: Converter.hexToBytes(ulg.groupId),
        addrSha256Hash: Converter.hexToBytes(ulg.addrSha256Hash)
    }))
    serializeUserLikeGroupMemberIntermediates(stream, listIntermediate);
    return stream.finalBytes();
}

export function serializeUserLikeGroupMemberIntermediates(writer: WriteStream, list: IMUserLikeGroupMemberIntermediate[]) {
    // first write schema version
    writer.writeUInt8("schema_version", LikeSchemaVersion);
    for (const userLikeGroupMemberIntermediate of list) {
        const { groupId, addrSha256Hash } = userLikeGroupMemberIntermediate;
        // check if list.groupId is 32 bytes
        if (groupId.byteLength !== 32) {
            throw new Error(`groupId length is not 32 bytes`);
        }
        if (addrSha256Hash.byteLength !== 32) {
            throw new Error(`addrSha256Hash length is not 32 bytes`);
        }

        // write groupId
        writer.writeBytes("groupId", 32, groupId);
        // write memberId
        writer.writeBytes("memberId", 32, addrSha256Hash);
    }
}

export function deserializeUserLikeGroupMemberIntermediates(reader: ReadStream): IMUserLikeGroupMemberIntermediate[] {
    const schemaVersion = reader.readUInt8("schema_version");
    if (schemaVersion !== LikeSchemaVersion) {
        throw new Error(`schema version ${schemaVersion} is not supported`);
    }
    const list: IMUserLikeGroupMemberIntermediate[] = [];
    while (reader.hasRemaining(1)) {
        const groupId = reader.readBytes("groupId", 32);
        const addrSha256Hash = reader.readBytes("addrSha256Hash", 32);
        list.push({
            groupId,
            addrSha256Hash
        });
    }
    return list;
}

export function deserializeUserLikeGroupMembers(bytes: Uint8Array): IMUserLikeGroupMember[] {
    const listIntermediate = deserializeUserLikeGroupMemberIntermediates(new ReadStream(bytes));
    return listIntermediate.map(ulg => ({
        groupId: Converter.bytesToHex(ulg.groupId),
        addrSha256Hash: Converter.bytesToHex(ulg.addrSha256Hash)
    }))
}