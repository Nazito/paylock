export const CHAINS = {
  monadTestnet: {
    id: 10143,
    hexId: "0x279f",
    name: "Monad Testnet",
    symbol: "MON",
    rpc: "https://testnet-rpc.monad.xyz",
    explorer: "https://testnet.monadvision.com",
    faucet: "https://faucet.monad.xyz",
  },
  arbitrumSepolia: {
    id: 421614,
    hexId: "0x66eee",
    name: "Arbitrum Sepolia",
    symbol: "ETH",
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    explorer: "https://sepolia.arbiscan.io",
    faucet: "https://faucet.quicknode.com/arbitrum/sepolia",
  },
  anvil: {
    id: 31337,
    hexId: "0x7a69",
    name: "Anvil",
    symbol: "ETH",
    rpc: "http://127.0.0.1:8545",
    explorer: "",
    faucet: "",
  },
} as const;

export type ChainKey = keyof typeof CHAINS;

export const PAYLOCK_ABI = [
  {
    type: "event",
    name: "Created",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "payee", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "memo", type: "bytes32", indexed: false },
    ],
  },
  { type: "error", name: "ZeroPayee", inputs: [] },
  { type: "error", name: "ZeroAmount", inputs: [] },
  { type: "error", name: "NotFound", inputs: [] },
  { type: "error", name: "NotPayer", inputs: [] },
  {
    type: "error",
    name: "WrongStatus",
    inputs: [{ name: "got", type: "uint8" }],
  },
  { type: "error", name: "WrongValue", inputs: [] },
  {
    type: "error",
    name: "PayeeMismatch",
    inputs: [
      { name: "expected", type: "address" },
      { name: "got", type: "address" },
    ],
  },
  {
    type: "error",
    name: "AmountMismatch",
    inputs: [
      { name: "expected", type: "uint256" },
      { name: "got", type: "uint256" },
    ],
  },
  { type: "error", name: "AlreadySettled", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
  {
    type: "function",
    name: "lock",
    stateMutability: "payable",
    inputs: [
      { name: "payee", type: "address" },
      { name: "memo", type: "bytes32" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "expectedPayee", type: "address" },
      { name: "expectedAmount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "get",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "payer", type: "address" },
          { name: "payee", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "memo", type: "bytes32" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
] as const;

export const STATUS_LABEL = ["none", "created", "funded", "released", "refunded"] as const;
