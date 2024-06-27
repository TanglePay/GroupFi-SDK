import { AddressHashLength, GroupIDLength, IMMessageIntermediate, IMRecipientIntermediate, IMRecipientIntermediateList, MessageAuthSchemeRecipeintInMessage, MessageAuthSchemeRecipeintOnChain, MessageTypePrivate, OutputIDLength } from "./types";
import { WriteStream, ReadStream } from "@iota/util.js";

export function serializeRecipient(writer: WriteStream, recipient: IMRecipientIntermediate): void {
    if (recipient.addr.byteLength !== AddressHashLength) {
        throw new Error(`Address length is not ${AddressHashLength} bytes`);
    }
    
    if (recipient.mkey.byteLength > 1024) {
        throw new Error("mkey length is greater than 1024 bytes");
    }

    // Write addr (fixed 20 bytes length)
    writer.writeBytes("addr", AddressHashLength, recipient.addr);

    // Write the length of mkey as UInt16
    writer.writeUInt16("mkey_length", recipient.mkey.byteLength);

    // Write mkey after its length
    writer.writeBytes("mkey", recipient.mkey.byteLength, recipient.mkey);
}
export function deserializeRecipient(reader: ReadStream): IMRecipientIntermediate {
    const addr = reader.readBytes("addr", AddressHashLength);
    const mkeyLength = reader.readUInt16("mkey_length");
    const mkey = reader.readBytes("mkey", mkeyLength);
    
    return {
        addr,
        mkey
    };
}

export function serializeRecipientArray(writer: WriteStream, recipients: IMRecipientIntermediate[]): void {
    // First, write the number of recipients as UInt32
    writer.writeUInt8("num_recipients", recipients.length);

    for (const recipient of recipients) {
        serializeRecipient(writer, recipient);
    }
}

export function deserializeRecipientArray(reader: ReadStream): IMRecipientIntermediate[] {
    const numRecipients = reader.readUInt8("num_recipients");
    const recipients: IMRecipientIntermediate[] = [];

    for (let i = 0; i < numRecipients; i++) {
        recipients.push(deserializeRecipient(reader));
    }

    return recipients;
}


export function serializeRecipientList(writer: WriteStream,list:IMRecipientIntermediateList) {
    // first write schema version
    writer.writeUInt8("schema_version", list.schemaVersion);
    // check if list.groupId is 32 bytes
    if (list.groupId.byteLength !== GroupIDLength) {
        throw new Error(`groupId length is not ${GroupIDLength} bytes`);
    }
    // write groupId
    writer.writeBytes("groupId", GroupIDLength, list.groupId);

    serializeRecipientArray(writer,list.list)
}

export function deserializeRecipientList(reader: ReadStream): IMRecipientIntermediateList {
    const schemaVersion = reader.readUInt8("schema_version");
    const groupId = reader.readBytes("groupId", GroupIDLength);
    const list = deserializeRecipientArray(reader);
    
    return {
        schemaVersion,
        groupId,
        list
    };
}


export function serializeIMMessage(writer: WriteStream, message: IMMessageIntermediate): void {
    // Write schema_version as Int8
    writer.writeUInt8("schema_version", message.schemaVersion);
    // Validate and write groupId (fixed 32 bytes length) first
    if (message.groupId.byteLength !== GroupIDLength) {
        throw new Error("groupId length is not 32 bytes");
    }
    writer.writeBytes("groupId", GroupIDLength, message.groupId);

    

    // Write message_type as Int8
    writer.writeUInt8("message_type", message.messageType);

    // Write auth_scheme as Int8
    writer.writeUInt8("auth_scheme", message.authScheme);

    // Write timestamp as UInt32
    writer.writeUInt32("timestamp", message.timestamp);

    if (message.messageType === MessageTypePrivate) {
        if (message.authScheme == MessageAuthSchemeRecipeintOnChain) {
            // check if message.recipientOutputid is null
            if (message.recipientOutputid == undefined) {
                throw new Error("recipient_outputid is null");
            }

            // Validate and write recipient_outputid (fixed 34 bytes length)
            if (message.recipientOutputid.byteLength !== OutputIDLength) {
                throw new Error("recipient_outputid length is not 34 bytes");
            }
            writer.writeBytes("recipient_outputid", OutputIDLength, message.recipientOutputid);
        } else if (message.authScheme == MessageAuthSchemeRecipeintInMessage) {
            // check if message.recipients is null
            if (message.recipients == undefined) {
                throw new Error("recipients is null");
            }
            // Write recipients
            serializeRecipientArray(writer, message.recipients);
        }
    }

    // Write the length of mkey as UInt16
    writer.writeUInt16("data length", message.data.byteLength);
    writer.writeBytes("data", message.data.byteLength, message.data);

}

export function deserializeIMMessage(reader: ReadStream): IMMessageIntermediate {
    const schemaVersion = reader.readUInt8("schema_version");
    const groupId = reader.readBytes("groupId", GroupIDLength);
    const messageType = reader.readUInt8("message_type");
    const authScheme = reader.readUInt8("auth_scheme");
    const timestamp = reader.readUInt32("timestamp");

    let recipientOutputid: Uint8Array | undefined;
    let recipients: IMRecipientIntermediate[] | undefined;
    if (messageType === MessageTypePrivate) {
        if (authScheme === MessageAuthSchemeRecipeintOnChain) {
            recipientOutputid = reader.readBytes("recipient_outputid", OutputIDLength);
        } else if (authScheme === MessageAuthSchemeRecipeintInMessage) {
            recipients = deserializeRecipientArray(reader);
        }
    }

    const dataLength = reader.readUInt16("data length");
    const data = reader.readBytes("data", dataLength);

    return {
        schemaVersion,
        groupId,
        messageType,
        authScheme,
        timestamp,
        recipientOutputid,
        recipients,
        data
    };
}
