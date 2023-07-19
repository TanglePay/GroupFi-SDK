import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace IM. */
export namespace IM {

    /** Properties of a Recipient. */
    interface IRecipient {

        /** Recipient addr */
        addr?: (string|null);

        /** Recipient mkey */
        mkey?: (string|null);
    }

    /** Represents a Recipient. */
    class Recipient implements IRecipient {

        /**
         * Constructs a new Recipient.
         * @param [properties] Properties to set
         */
        constructor(properties?: IM.IRecipient);

        /** Recipient addr. */
        public addr: string;

        /** Recipient mkey. */
        public mkey: string;

        /**
         * Creates a new Recipient instance using the specified properties.
         * @param [properties] Properties to set
         * @returns Recipient instance
         */
        public static create(properties?: IM.IRecipient): IM.Recipient;

        /**
         * Encodes the specified Recipient message. Does not implicitly {@link IM.Recipient.verify|verify} messages.
         * @param message Recipient message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: IM.IRecipient, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified Recipient message, length delimited. Does not implicitly {@link IM.Recipient.verify|verify} messages.
         * @param message Recipient message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: IM.IRecipient, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Recipient message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Recipient
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): IM.Recipient;

        /**
         * Decodes a Recipient message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns Recipient
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): IM.Recipient;

        /**
         * Verifies a Recipient message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a Recipient message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns Recipient
         */
        public static fromObject(object: { [k: string]: any }): IM.Recipient;

        /**
         * Creates a plain object from a Recipient message. Also converts values to other types if specified.
         * @param message Recipient
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: IM.Recipient, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this Recipient to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for Recipient
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a IMMessage. */
    interface IIMMessage {

        /** IMMessage schemaVersion */
        schemaVersion?: (number|null);

        /** IMMessage group */
        group?: (string|null);

        /** IMMessage messageType */
        messageType?: (number|null);

        /** IMMessage authScheme */
        authScheme?: (number|null);

        /** IMMessage recipients */
        recipients?: (IM.IRecipient[]|null);

        /** IMMessage recipientOutputid */
        recipientOutputid?: (string|null);

        /** IMMessage data */
        data?: (string[]|null);
    }

    /** Represents a IMMessage. */
    class IMMessage implements IIMMessage {

        /**
         * Constructs a new IMMessage.
         * @param [properties] Properties to set
         */
        constructor(properties?: IM.IIMMessage);

        /** IMMessage schemaVersion. */
        public schemaVersion: number;

        /** IMMessage group. */
        public group: string;

        /** IMMessage messageType. */
        public messageType: number;

        /** IMMessage authScheme. */
        public authScheme: number;

        /** IMMessage recipients. */
        public recipients: IM.IRecipient[];

        /** IMMessage recipientOutputid. */
        public recipientOutputid: string;

        /** IMMessage data. */
        public data: string[];

        /**
         * Creates a new IMMessage instance using the specified properties.
         * @param [properties] Properties to set
         * @returns IMMessage instance
         */
        public static create(properties?: IM.IIMMessage): IM.IMMessage;

        /**
         * Encodes the specified IMMessage message. Does not implicitly {@link IM.IMMessage.verify|verify} messages.
         * @param message IMMessage message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: IM.IIMMessage, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified IMMessage message, length delimited. Does not implicitly {@link IM.IMMessage.verify|verify} messages.
         * @param message IMMessage message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: IM.IIMMessage, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a IMMessage message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns IMMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): IM.IMMessage;

        /**
         * Decodes a IMMessage message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns IMMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): IM.IMMessage;

        /**
         * Verifies a IMMessage message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a IMMessage message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns IMMessage
         */
        public static fromObject(object: { [k: string]: any }): IM.IMMessage;

        /**
         * Creates a plain object from a IMMessage message. Also converts values to other types if specified.
         * @param message IMMessage
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: IM.IMMessage, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this IMMessage to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };

        /**
         * Gets the default type url for IMMessage
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}
