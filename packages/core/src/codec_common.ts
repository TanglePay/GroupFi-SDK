import { ReadStream, WriteStream } from "@iota/util.js";
import { MessageCurrentSchemaVersion } from ".";


export function serializeCommonHeader(writer: WriteStream, ctx:{[key:string]:any}) {
    writer.writeUInt8("schema_version", MessageCurrentSchemaVersion);
    // write isActAsSelf, uint8, 1 for true, 0 for false
    writer.writeUInt8("isActAsSelf", ctx.isActAsSelf?1:0);
}

export function deserializeCommonHeader(reader: ReadStream) {
    const schemaVersion = reader.readUInt8("schema_version");
    // for schemaVersion < 2, we only have schemaVersion
    if (schemaVersion < 2) {
        return {schemaVersion};
    }
    const isActAsSelf = reader.readUInt8("isActAsSelf");
    return {schemaVersion, isActAsSelf:isActAsSelf===1};
}