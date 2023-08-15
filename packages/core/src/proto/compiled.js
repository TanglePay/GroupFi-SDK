/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
"use strict";

var $protobuf = require("protobufjs/minimal");

// Common aliases
var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

$root.IM = (function() {

    /**
     * Namespace IM.
     * @exports IM
     * @namespace
     */
    var IM = {};

    IM.Recipient = (function() {

        /**
         * Properties of a Recipient.
         * @memberof IM
         * @interface IRecipient
         * @property {Uint8Array|null} [addr] Recipient addr
         * @property {Uint8Array|null} [mkey] Recipient mkey
         */

        /**
         * Constructs a new Recipient.
         * @memberof IM
         * @classdesc Represents a Recipient.
         * @implements IRecipient
         * @constructor
         * @param {IM.IRecipient=} [properties] Properties to set
         */
        function Recipient(properties) {
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Recipient addr.
         * @member {Uint8Array} addr
         * @memberof IM.Recipient
         * @instance
         */
        Recipient.prototype.addr = $util.newBuffer([]);

        /**
         * Recipient mkey.
         * @member {Uint8Array} mkey
         * @memberof IM.Recipient
         * @instance
         */
        Recipient.prototype.mkey = $util.newBuffer([]);

        /**
         * Creates a new Recipient instance using the specified properties.
         * @function create
         * @memberof IM.Recipient
         * @static
         * @param {IM.IRecipient=} [properties] Properties to set
         * @returns {IM.Recipient} Recipient instance
         */
        Recipient.create = function create(properties) {
            return new Recipient(properties);
        };

        /**
         * Encodes the specified Recipient message. Does not implicitly {@link IM.Recipient.verify|verify} messages.
         * @function encode
         * @memberof IM.Recipient
         * @static
         * @param {IM.IRecipient} message Recipient message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Recipient.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.addr != null && Object.hasOwnProperty.call(message, "addr"))
                writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.addr);
            if (message.mkey != null && Object.hasOwnProperty.call(message, "mkey"))
                writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.mkey);
            return writer;
        };

        /**
         * Encodes the specified Recipient message, length delimited. Does not implicitly {@link IM.Recipient.verify|verify} messages.
         * @function encodeDelimited
         * @memberof IM.Recipient
         * @static
         * @param {IM.IRecipient} message Recipient message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Recipient.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a Recipient message from the specified reader or buffer.
         * @function decode
         * @memberof IM.Recipient
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {IM.Recipient} Recipient
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Recipient.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.IM.Recipient();
            while (reader.pos < end) {
                var tag = reader.uint32();
                switch (tag >>> 3) {
                case 1: {
                        message.addr = reader.bytes();
                        break;
                    }
                case 2: {
                        message.mkey = reader.bytes();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a Recipient message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof IM.Recipient
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {IM.Recipient} Recipient
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Recipient.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Recipient message.
         * @function verify
         * @memberof IM.Recipient
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Recipient.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.addr != null && message.hasOwnProperty("addr"))
                if (!(message.addr && typeof message.addr.length === "number" || $util.isString(message.addr)))
                    return "addr: buffer expected";
            if (message.mkey != null && message.hasOwnProperty("mkey"))
                if (!(message.mkey && typeof message.mkey.length === "number" || $util.isString(message.mkey)))
                    return "mkey: buffer expected";
            return null;
        };

        /**
         * Creates a Recipient message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof IM.Recipient
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {IM.Recipient} Recipient
         */
        Recipient.fromObject = function fromObject(object) {
            if (object instanceof $root.IM.Recipient)
                return object;
            var message = new $root.IM.Recipient();
            if (object.addr != null)
                if (typeof object.addr === "string")
                    $util.base64.decode(object.addr, message.addr = $util.newBuffer($util.base64.length(object.addr)), 0);
                else if (object.addr.length >= 0)
                    message.addr = object.addr;
            if (object.mkey != null)
                if (typeof object.mkey === "string")
                    $util.base64.decode(object.mkey, message.mkey = $util.newBuffer($util.base64.length(object.mkey)), 0);
                else if (object.mkey.length >= 0)
                    message.mkey = object.mkey;
            return message;
        };

        /**
         * Creates a plain object from a Recipient message. Also converts values to other types if specified.
         * @function toObject
         * @memberof IM.Recipient
         * @static
         * @param {IM.Recipient} message Recipient
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Recipient.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.defaults) {
                if (options.bytes === String)
                    object.addr = "";
                else {
                    object.addr = [];
                    if (options.bytes !== Array)
                        object.addr = $util.newBuffer(object.addr);
                }
                if (options.bytes === String)
                    object.mkey = "";
                else {
                    object.mkey = [];
                    if (options.bytes !== Array)
                        object.mkey = $util.newBuffer(object.mkey);
                }
            }
            if (message.addr != null && message.hasOwnProperty("addr"))
                object.addr = options.bytes === String ? $util.base64.encode(message.addr, 0, message.addr.length) : options.bytes === Array ? Array.prototype.slice.call(message.addr) : message.addr;
            if (message.mkey != null && message.hasOwnProperty("mkey"))
                object.mkey = options.bytes === String ? $util.base64.encode(message.mkey, 0, message.mkey.length) : options.bytes === Array ? Array.prototype.slice.call(message.mkey) : message.mkey;
            return object;
        };

        /**
         * Converts this Recipient to JSON.
         * @function toJSON
         * @memberof IM.Recipient
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Recipient.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for Recipient
         * @function getTypeUrl
         * @memberof IM.Recipient
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Recipient.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/IM.Recipient";
        };

        return Recipient;
    })();

    IM.IMMessage = (function() {

        /**
         * Properties of a IMMessage.
         * @memberof IM
         * @interface IIMMessage
         * @property {number|null} [schemaVersion] IMMessage schemaVersion
         * @property {string|null} [group] IMMessage group
         * @property {number|null} [messageType] IMMessage messageType
         * @property {number|null} [authScheme] IMMessage authScheme
         * @property {Array.<IM.IRecipient>|null} [recipients] IMMessage recipients
         * @property {string|null} [recipientOutputid] IMMessage recipientOutputid
         * @property {Array.<string>|null} [data] IMMessage data
         */

        /**
         * Constructs a new IMMessage.
         * @memberof IM
         * @classdesc Represents a IMMessage.
         * @implements IIMMessage
         * @constructor
         * @param {IM.IIMMessage=} [properties] Properties to set
         */
        function IMMessage(properties) {
            this.recipients = [];
            this.data = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * IMMessage schemaVersion.
         * @member {number} schemaVersion
         * @memberof IM.IMMessage
         * @instance
         */
        IMMessage.prototype.schemaVersion = 0;

        /**
         * IMMessage group.
         * @member {string} group
         * @memberof IM.IMMessage
         * @instance
         */
        IMMessage.prototype.group = "";

        /**
         * IMMessage messageType.
         * @member {number} messageType
         * @memberof IM.IMMessage
         * @instance
         */
        IMMessage.prototype.messageType = 0;

        /**
         * IMMessage authScheme.
         * @member {number} authScheme
         * @memberof IM.IMMessage
         * @instance
         */
        IMMessage.prototype.authScheme = 0;

        /**
         * IMMessage recipients.
         * @member {Array.<IM.IRecipient>} recipients
         * @memberof IM.IMMessage
         * @instance
         */
        IMMessage.prototype.recipients = $util.emptyArray;

        /**
         * IMMessage recipientOutputid.
         * @member {string} recipientOutputid
         * @memberof IM.IMMessage
         * @instance
         */
        IMMessage.prototype.recipientOutputid = "";

        /**
         * IMMessage data.
         * @member {Array.<string>} data
         * @memberof IM.IMMessage
         * @instance
         */
        IMMessage.prototype.data = $util.emptyArray;

        /**
         * Creates a new IMMessage instance using the specified properties.
         * @function create
         * @memberof IM.IMMessage
         * @static
         * @param {IM.IIMMessage=} [properties] Properties to set
         * @returns {IM.IMMessage} IMMessage instance
         */
        IMMessage.create = function create(properties) {
            return new IMMessage(properties);
        };

        /**
         * Encodes the specified IMMessage message. Does not implicitly {@link IM.IMMessage.verify|verify} messages.
         * @function encode
         * @memberof IM.IMMessage
         * @static
         * @param {IM.IIMMessage} message IMMessage message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        IMMessage.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.schemaVersion != null && Object.hasOwnProperty.call(message, "schemaVersion"))
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.schemaVersion);
            if (message.group != null && Object.hasOwnProperty.call(message, "group"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.group);
            if (message.messageType != null && Object.hasOwnProperty.call(message, "messageType"))
                writer.uint32(/* id 3, wireType 0 =*/24).int32(message.messageType);
            if (message.authScheme != null && Object.hasOwnProperty.call(message, "authScheme"))
                writer.uint32(/* id 4, wireType 0 =*/32).int32(message.authScheme);
            if (message.recipients != null && message.recipients.length)
                for (var i = 0; i < message.recipients.length; ++i)
                    $root.IM.Recipient.encode(message.recipients[i], writer.uint32(/* id 5, wireType 2 =*/42).fork()).ldelim();
            if (message.recipientOutputid != null && Object.hasOwnProperty.call(message, "recipientOutputid"))
                writer.uint32(/* id 6, wireType 2 =*/50).string(message.recipientOutputid);
            if (message.data != null && message.data.length)
                for (var i = 0; i < message.data.length; ++i)
                    writer.uint32(/* id 7, wireType 2 =*/58).string(message.data[i]);
            return writer;
        };

        /**
         * Encodes the specified IMMessage message, length delimited. Does not implicitly {@link IM.IMMessage.verify|verify} messages.
         * @function encodeDelimited
         * @memberof IM.IMMessage
         * @static
         * @param {IM.IIMMessage} message IMMessage message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        IMMessage.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a IMMessage message from the specified reader or buffer.
         * @function decode
         * @memberof IM.IMMessage
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {IM.IMMessage} IMMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        IMMessage.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.IM.IMMessage();
            while (reader.pos < end) {
                var tag = reader.uint32();
                switch (tag >>> 3) {
                case 1: {
                        message.schemaVersion = reader.int32();
                        break;
                    }
                case 2: {
                        message.group = reader.string();
                        break;
                    }
                case 3: {
                        message.messageType = reader.int32();
                        break;
                    }
                case 4: {
                        message.authScheme = reader.int32();
                        break;
                    }
                case 5: {
                        if (!(message.recipients && message.recipients.length))
                            message.recipients = [];
                        message.recipients.push($root.IM.Recipient.decode(reader, reader.uint32()));
                        break;
                    }
                case 6: {
                        message.recipientOutputid = reader.string();
                        break;
                    }
                case 7: {
                        if (!(message.data && message.data.length))
                            message.data = [];
                        message.data.push(reader.string());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Decodes a IMMessage message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof IM.IMMessage
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {IM.IMMessage} IMMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        IMMessage.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a IMMessage message.
         * @function verify
         * @memberof IM.IMMessage
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        IMMessage.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (message.schemaVersion != null && message.hasOwnProperty("schemaVersion"))
                if (!$util.isInteger(message.schemaVersion))
                    return "schemaVersion: integer expected";
            if (message.group != null && message.hasOwnProperty("group"))
                if (!$util.isString(message.group))
                    return "group: string expected";
            if (message.messageType != null && message.hasOwnProperty("messageType"))
                if (!$util.isInteger(message.messageType))
                    return "messageType: integer expected";
            if (message.authScheme != null && message.hasOwnProperty("authScheme"))
                if (!$util.isInteger(message.authScheme))
                    return "authScheme: integer expected";
            if (message.recipients != null && message.hasOwnProperty("recipients")) {
                if (!Array.isArray(message.recipients))
                    return "recipients: array expected";
                for (var i = 0; i < message.recipients.length; ++i) {
                    var error = $root.IM.Recipient.verify(message.recipients[i]);
                    if (error)
                        return "recipients." + error;
                }
            }
            if (message.recipientOutputid != null && message.hasOwnProperty("recipientOutputid"))
                if (!$util.isString(message.recipientOutputid))
                    return "recipientOutputid: string expected";
            if (message.data != null && message.hasOwnProperty("data")) {
                if (!Array.isArray(message.data))
                    return "data: array expected";
                for (var i = 0; i < message.data.length; ++i)
                    if (!$util.isString(message.data[i]))
                        return "data: string[] expected";
            }
            return null;
        };

        /**
         * Creates a IMMessage message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof IM.IMMessage
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {IM.IMMessage} IMMessage
         */
        IMMessage.fromObject = function fromObject(object) {
            if (object instanceof $root.IM.IMMessage)
                return object;
            var message = new $root.IM.IMMessage();
            if (object.schemaVersion != null)
                message.schemaVersion = object.schemaVersion | 0;
            if (object.group != null)
                message.group = String(object.group);
            if (object.messageType != null)
                message.messageType = object.messageType | 0;
            if (object.authScheme != null)
                message.authScheme = object.authScheme | 0;
            if (object.recipients) {
                if (!Array.isArray(object.recipients))
                    throw TypeError(".IM.IMMessage.recipients: array expected");
                message.recipients = [];
                for (var i = 0; i < object.recipients.length; ++i) {
                    if (typeof object.recipients[i] !== "object")
                        throw TypeError(".IM.IMMessage.recipients: object expected");
                    message.recipients[i] = $root.IM.Recipient.fromObject(object.recipients[i]);
                }
            }
            if (object.recipientOutputid != null)
                message.recipientOutputid = String(object.recipientOutputid);
            if (object.data) {
                if (!Array.isArray(object.data))
                    throw TypeError(".IM.IMMessage.data: array expected");
                message.data = [];
                for (var i = 0; i < object.data.length; ++i)
                    message.data[i] = String(object.data[i]);
            }
            return message;
        };

        /**
         * Creates a plain object from a IMMessage message. Also converts values to other types if specified.
         * @function toObject
         * @memberof IM.IMMessage
         * @static
         * @param {IM.IMMessage} message IMMessage
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        IMMessage.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults) {
                object.recipients = [];
                object.data = [];
            }
            if (options.defaults) {
                object.schemaVersion = 0;
                object.group = "";
                object.messageType = 0;
                object.authScheme = 0;
                object.recipientOutputid = "";
            }
            if (message.schemaVersion != null && message.hasOwnProperty("schemaVersion"))
                object.schemaVersion = message.schemaVersion;
            if (message.group != null && message.hasOwnProperty("group"))
                object.group = message.group;
            if (message.messageType != null && message.hasOwnProperty("messageType"))
                object.messageType = message.messageType;
            if (message.authScheme != null && message.hasOwnProperty("authScheme"))
                object.authScheme = message.authScheme;
            if (message.recipients && message.recipients.length) {
                object.recipients = [];
                for (var j = 0; j < message.recipients.length; ++j)
                    object.recipients[j] = $root.IM.Recipient.toObject(message.recipients[j], options);
            }
            if (message.recipientOutputid != null && message.hasOwnProperty("recipientOutputid"))
                object.recipientOutputid = message.recipientOutputid;
            if (message.data && message.data.length) {
                object.data = [];
                for (var j = 0; j < message.data.length; ++j)
                    object.data[j] = message.data[j];
            }
            return object;
        };

        /**
         * Converts this IMMessage to JSON.
         * @function toJSON
         * @memberof IM.IMMessage
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        IMMessage.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the default type url for IMMessage
         * @function getTypeUrl
         * @memberof IM.IMMessage
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        IMMessage.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/IM.IMMessage";
        };

        return IMMessage;
    })();

    return IM;
})();

module.exports = $root;
