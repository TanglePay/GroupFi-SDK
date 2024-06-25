import { IMUserMuteGroupMember, IMUserMuteGroupMemberIntermediate, MuteSchemaVersion } from "./types";
import { WriteStream, ReadStream, Converter } from "@iota/util.js";

export function serializeUserMuteGroupMembers(list:IMUserMuteGroupMember[]) : Uint8Array {
    const stream = new WriteStream();
    const listIntermediate:IMUserMuteGroupMemberIntermediate[] = list.map(umg => ({
        groupId: Converter.hexToBytes(umg.groupId),
        addrSha256Hash: Converter.hexToBytes(umg.addrSha256Hash)
    }))
    serializeUserMuteGroupMemberIntermediates(stream, listIntermediate);
    return stream.finalBytes();
}

export function serializeUserMuteGroupMemberIntermediates(writer: WriteStream, list: IMUserMuteGroupMemberIntermediate[]) {
    // first write schema version
    writer.writeUInt8("schema_version", MuteSchemaVersion);
    for (const userMuteGroupMemberIntermediate of list) {
        const { groupId, addrSha256Hash } = userMuteGroupMemberIntermediate;
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

export function deserializeUserMuteGroupMemberIntermediates(reader: ReadStream): IMUserMuteGroupMemberIntermediate[] {
    const schemaVersion = reader.readUInt8("schema_version");
    if (schemaVersion !== MuteSchemaVersion) {
        throw new Error(`schema version ${schemaVersion} is not supported`);
    }
    const list: IMUserMuteGroupMemberIntermediate[] = [];
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

export function deserializeUserMuteGroupMembers(bytes: Uint8Array): IMUserMuteGroupMember[] {
    const listIntermediate = deserializeUserMuteGroupMemberIntermediates(new ReadStream(bytes));
    return listIntermediate.map(umg => ({
        groupId: Converter.bytesToHex(umg.groupId),
        addrSha256Hash: Converter.bytesToHex(umg.addrSha256Hash)
    }))
}