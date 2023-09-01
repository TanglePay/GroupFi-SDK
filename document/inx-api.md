# GroupFi API Documentation

## Fetch Message Output IDs

Retrieve message output IDs for a specified group.

### Endpoint

**GET** `/api/groupfi/v1/messages`

### Parameters

| Parameter  | Type   | Description                                                  | Required |
|------------|--------|--------------------------------------------------------------|----------|
| `groupId`  | string | Unique identifier for the group. Should be prefixed with '0x'. | Yes      |
| `size`     | number | Maximum number of message output IDs to fetch. Default is 10. | No       |
| `token`    | string | Continuation token to fetch the next set of IDs.             | No       |

### Headers

| Header Name | Value            | Description                            |
|-------------|------------------|----------------------------------------|
| Content-Type| `application/json`| Specifies the format of the response.  |

### Response

The response will be a JSON object with the following fields:

- `messageList`: Array of message output IDs.
- `headToken`: String token to access the previous set of messages.
- `tailToken`: String token to access the next set of messages.

### Example Request

\```http
GET https://[your-domain]/api/groupfi/v1/messages?groupId=0x[YourGroupId]&size=10&token=[YourContinuationToken]
\```

### Example Response

\```json
{
  "messageList": ["id1", "id2", "id3"],
  "headToken": "previousToken123",
  "tailToken": "nextToken456"
}
\```

### Errors

In case of errors, an appropriate HTTP status code will be returned along with an error message.


## Fetch Message List Until a Given Token

Retrieve message output IDs for a specified group until a specified continuation token.

### Endpoint

**GET** `/api/groupfi/v1/messages/until`

### Parameters

| Parameter  | Type   | Description                                                  | Required |
|------------|--------|--------------------------------------------------------------|----------|
| `groupId`  | string | Unique identifier for the group. Should be prefixed with '0x'. | Yes      |
| `size`     | number | Maximum number of message output IDs to fetch. Default is 10. | No       |
| `token`    | string | Continuation token to fetch messages up until.               | Yes      |

### Headers

| Header Name | Value            | Description                            |
|-------------|------------------|----------------------------------------|
| Content-Type| `application/json`| Specifies the format of the response.  |

### Response

The response will be a JSON object with the following fields:

- `messageList`: Array of message output IDs.
- `headToken`: String token to access the previous set of messages.
- `tailToken`: String token to access the next set of messages.

### Example Request

\```http
GET https://[your-domain]/api/groupfi/v1/messages/until?groupId=0x[YourGroupId]&size=10&token=[YourContinuationToken]
\```

### Example Response

\```json
{
  "messageList": ["id4", "id5", "id6"],
  "headToken": "previousToken789",
  "tailToken": "nextToken012"
}
\```

### Errors

In case of errors, an appropriate HTTP status code will be returned along with an error message.


## Get Address List for Group

Retrieve a list of addresses associated with a specific group.

### Endpoint

**GET** `/api/groupfi/v1/nfts`

### Parameters

| Parameter  | Type   | Description                                                  | Required |
|------------|--------|--------------------------------------------------------------|----------|
| `groupId`  | string | Unique identifier for the group. Should be prefixed with '0x'. | Yes      |

### Headers

| Header Name | Value            | Description                            |
|-------------|------------------|----------------------------------------|
| Content-Type| `application/json`| Specifies the format of the response.  |

### Response

The response will be a JSON array containing NFT items, with each item having the following fields:

- `ownerAddress`: The address associated with each NFT item.

### Example Request

\```http
GET https://[your-domain]/api/groupfi/v1/nfts?groupId=0x[YourGroupId]
\```

### Example Response

\```json
[
  {
    "ownerAddress": "0xAddress1"
  },
  {
    "ownerAddress": "0xAddress2"
  }
]
\```

### Errors

In case of errors, an appropriate HTTP status code will be returned, and the error will be logged to the console with the prefix '_getAddressListForGroupFromInxApi error'.

## Get Shared Output ID for Group

Retrieve the shared output ID associated with a specific group.

### Endpoint

**GET** `/api/groupfi/v1/shared`

### Parameters

| Parameter  | Type   | Description                                                  | Required |
|------------|--------|--------------------------------------------------------------|----------|
| `groupId`  | string | Unique identifier for the group. Should be prefixed with '0x'. | Yes      |

### Headers

| Header Name    | Value                  | Description                            |
|----------------|------------------------|----------------------------------------|
| Content-Type   | `application/json`     | Specifies the format of the response.  |
| Authorization  | `Bearer [YourJWTToken]`| JWT token for authorized access.       |

### Response

The response will be a JSON object containing:

- `outputId`: The shared output ID associated with the group.

### Example Request

\```http
GET https://[your-domain]/api/groupfi/v1/shared?groupId=0x[YourGroupId]
Authorization: Bearer [YourJWTToken]
\```

### Example Response

\```json
{
  "outputId": "exampleOutputId123"
}
\```

### Errors

In case of errors, an appropriate HTTP status code will be returned, and the error will be logged to the console.

