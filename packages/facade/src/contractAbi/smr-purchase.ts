const smrPurchaseAbi = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'w',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'user',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'pubkey',
        type: 'bytes32',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amountIn',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint64',
        name: 'amountOut',
        type: 'uint64',
      },
    ],
    name: 'BuySmr',
    type: 'event',
  },
  {
    inputs: [],
    name: 'PERCENT',
    outputs: [
      {
        internalType: 'uint16',
        name: '',
        type: 'uint16',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'ed25519',
        type: 'bytes32',
      },
      {
        internalType: 'uint64',
        name: 'amount',
        type: 'uint64',
      },
    ],
    name: 'buySmr',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address[]',
        name: 'adds',
        type: 'address[]',
      },
      {
        internalType: 'address[]',
        name: 'subs',
        type: 'address[]',
      },
      {
        internalType: 'contract IERC20',
        name: 'c',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'threshold',
        type: 'uint256',
      },
    ],
    name: 'checkERC20Group',
    outputs: [
      {
        internalType: 'int8',
        name: 'res',
        type: 'int8',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address[]',
        name: 'adds',
        type: 'address[]',
      },
      {
        internalType: 'address[]',
        name: 'subs',
        type: 'address[]',
      },
      {
        internalType: 'contract IERC721',
        name: 'c',
        type: 'address',
      },
    ],
    name: 'checkERC721Group',
    outputs: [
      {
        internalType: 'int8',
        name: '',
        type: 'int8',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address[]',
        name: 'addrs',
        type: 'address[]',
      },
      {
        internalType: 'contract IERC20',
        name: 'c',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'threshold',
        type: 'uint256',
      },
    ],
    name: 'filterERC20Addresses',
    outputs: [
      {
        internalType: 'uint16[]',
        name: 'indexes',
        type: 'uint16[]',
      },
      {
        internalType: 'uint16',
        name: 'count',
        type: 'uint16',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address[]',
        name: 'addrs',
        type: 'address[]',
      },
      {
        internalType: 'contract IERC20',
        name: 'c',
        type: 'address',
      },
    ],
    name: 'filterERC721Addresses',
    outputs: [
      {
        internalType: 'uint16[]',
        name: 'indexes',
        type: 'uint16[]',
      },
      {
        internalType: 'uint16',
        name: 'count',
        type: 'uint16',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'wallet',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

export default smrPurchaseAbi