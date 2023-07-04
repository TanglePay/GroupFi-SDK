# IotaCatSDK

The IotaCatSDK is a library for interacting with the IotaCat blockchain. It provides a simple and easy-to-use interface for developers to build applications on top of the IotaCat network.

## Installation

To install the IotaCatSDK, you can use npm or yarn:

```bash
npm install iotacat-sdk-core
```

or

```bash
yarn add iotacat-sdk-core
```

## Usage

To use the IotaCatSDK in your project, you can import instance like this:

```typescript
import { IotaCatSDKObj } from 'iotacat-sdk-core';
```

From there, you can use the various methods provided by the SDK to interact with the IotaCat network.

## Examples

Here are some examples of how to use the IotaCatSDK:

```typescript
// Import a instance of the SDK
import { IotaCatSDKObj } from 'iotacat-sdk-core';

// Prepare a message to be send
const dummyAddr = 'smr123';
const dummyGroupName = 'dummy';
const dummyMessage = 'Hello world';

const msgObject = IotaCatSDKObj.prepareSendMessage({type:ShimmerBech32Addr,addr:dummyAddr},dummyGroupName,dummyMessage);

// serialized a message
const msgBytes = await IotaCatSDKObj.serializeMessage(msgObject!,async (key,data)=>{
    /* implementation of encrypting using receiver public key needed */
})

// deserialize a message
const msgObject2 = await IotaCatSDKObj.deserializeMessage(msgBytes,basicAddr,async (data)=>{
    /* implementation of decrypting using receiver private key needed */
})

```


