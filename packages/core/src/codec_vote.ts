import { IMUserVoteGroup, IMUserVoteGroupIntermediate, MessageCurrentSchemaVersion } from "./types";
import { WriteStream, ReadStream, Converter } from "@iota/util.js";
import { numberToBytes } from 'iotacat-sdk-utils'
import { serializeCommonHeader, deserializeCommonHeader } from "./codec_common";

export function serializeUserVoteGroups(list:IMUserVoteGroup[],
    ctx:{[key:string]:any}
) : Uint8Array {
    const stream = new WriteStream();
    serializeCommonHeader(stream, ctx);
    const listIntermediate:IMUserVoteGroupIntermediate[] = list.map(umg => ({
        groupId: Converter.hexToBytes(umg.groupId),
        vote: numberToBytes(umg.vote)
    }))
    serializeUserVoteGroupIntermediates(stream, listIntermediate);
    return stream.finalBytes();
}

export function serializeUserVoteGroupIntermediates(writer: WriteStream, list: IMUserVoteGroupIntermediate[]) {
    for (const userVoteGroupIntermediate of list) {
        const { groupId, vote } = userVoteGroupIntermediate;
        // check if list.groupId is 32 bytes
        if (groupId.byteLength !== 32) {
            throw new Error(`groupId length is not 32 bytes`);
        }
        if (vote.byteLength !== 1) {
            throw new Error(`vote length is not 1 bytes`);
        }
        // write groupId
        writer.writeBytes("groupId", 32, groupId);
        // write vote
        writer.writeBytes("vote", 1, vote);
    }
}

export function deserializeUserVoteGroupIntermediates(reader: ReadStream): IMUserVoteGroupIntermediate[] {
    const { schemaVersion } = deserializeCommonHeader(reader);
    if (schemaVersion !== MessageCurrentSchemaVersion) {
        throw new Error(`schema version ${schemaVersion} is not supported`);
    }
    const list: IMUserVoteGroupIntermediate[] = [];
    while (reader.hasRemaining(1)) {
        const groupId = reader.readBytes("groupId", 32);
        const vote = reader.readBytes("vote", 1);
        list.push({
            groupId,
            vote
        });
    }
    return list;
}

export function deserializeUserVoteGroups(bytes: Uint8Array): IMUserVoteGroup[] {
    const listIntermediate = deserializeUserVoteGroupIntermediates(new ReadStream(bytes));
    return listIntermediate.map(umg => ({
        groupId: Converter.bytesToHex(umg.groupId),
        vote: umg.vote[0]
    }))
}