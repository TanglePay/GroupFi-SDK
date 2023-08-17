import { beforeEach, describe, expect, test, beforeAll, jest } from '@jest/globals';
import { NodePowProvider } from "@iota/pow-node.js";
import IotaCatClient from '../src';
import type { MqttClient } from 'mqtt';
type MockedMqttClient = {
    subscribe: (topic: string | string[], callback?: () => void) => void;
    on: (event: string, callback: (...args: any[]) => void) => void;
    // Add any other methods or properties as needed
  };
  
  // Create the mocked client object
  
describe('seed related test', () => {

    beforeAll(async ()=>{
        await IotaCatClient.setup(101,NodePowProvider)
    })
    test('test client initialized', async () => {
        expect(IotaCatClient._nodeInfo).toBeDefined()
    })
    test('test set hex seed', () => {
        const hexSeed = '641d959fc57ab40cee6c1ccb9bf55971a3a89558166fccd618908cf7545f05121ceb40c26b116e5cc6d3eebc75ef0099db96213dab0eac5b450fecc09b05395a';
        IotaCatClient.setHexSeed(hexSeed).then(()=>{
            console.log('set hex seed success')
        })
    })
})

