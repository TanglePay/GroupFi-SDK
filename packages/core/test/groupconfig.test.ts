import { beforeEach, describe, expect, test, beforeAll, jest } from '@jest/globals';
import { IotaCatSDKObj, IMMessage, ShimmerBech32Addr, MessageAuthSchemeRecipeintOnChain, MessageCurrentSchemaVersion, MessageTypePrivate, MessageAuthSchemeRecipeintInMessage, MessageGroupMeta } from '../src';


const map:Record<string,MessageGroupMeta> = {
    'iceberg':{
        groupName: 'iceberg',
        schemaVersion: MessageCurrentSchemaVersion,
        messageType:MessageTypePrivate,
        authScheme:MessageAuthSchemeRecipeintOnChain,
    },
    'iceberg-collection-1':{
        groupName: 'iceberg-collection-1',
        schemaVersion: MessageCurrentSchemaVersion,
        messageType:MessageTypePrivate,
        authScheme:MessageAuthSchemeRecipeintOnChain,
    },
    'iceberg-collection-2':{
        groupName: 'iceberg-collection-2',
        schemaVersion: MessageCurrentSchemaVersion,
        messageType:MessageTypePrivate,
        authScheme:MessageAuthSchemeRecipeintOnChain,
    },
    'iceberg-collection-3':{
        groupName: 'iceberg-collection-3',
        schemaVersion: MessageCurrentSchemaVersion,
        messageType:MessageTypePrivate,
        authScheme:MessageAuthSchemeRecipeintOnChain,
    },
    'iceberg-collection-4':{
        groupName: 'iceberg-collection-4',
        schemaVersion: MessageCurrentSchemaVersion,
        messageType:MessageTypePrivate,
        authScheme:MessageAuthSchemeRecipeintOnChain,
    },
    'iceberg-collection-5':{
        groupName: 'iceberg-collection-5',
        schemaVersion: MessageCurrentSchemaVersion,
        messageType:MessageTypePrivate,
        authScheme:MessageAuthSchemeRecipeintOnChain,
    },
    'iceberg-collection-6':{
        groupName: 'iceberg-collection-6',
        schemaVersion: MessageCurrentSchemaVersion,
        messageType:MessageTypePrivate,
        authScheme:MessageAuthSchemeRecipeintOnChain,
    },
    'iceberg-collection-7':{
        groupName: 'iceberg-collection-7',
        schemaVersion: MessageCurrentSchemaVersion,
        messageType:MessageTypePrivate,
        authScheme:MessageAuthSchemeRecipeintOnChain,
    },
    'iceberg-collection-8':{
        groupName: 'iceberg-collection-8',
        schemaVersion: MessageCurrentSchemaVersion,
        messageType:MessageTypePrivate,
        authScheme:MessageAuthSchemeRecipeintOnChain,
    },
}

describe('test and dump group config', () => {
    test('test dump group config', async () => {
        const groupJson = JSON.stringify(map)
        console.log(groupJson)
    })
})