# Paylock

Invoice escrow: native tokens sit in a contract until the payer confirms the **exact payee and amount**. A wrong address does not get paid. A settled invoice cannot pay twice.

Live demo: https://paylock.vercel.app  
Contract (Monad Testnet): [`0x132f284c85421EEF684a0B4A6639Cc541d9ED9aB`](https://testnet.monadvision.com/address/0x132f284c85421EEF684a0B4A6639Cc541d9ED9aB)

Built for [Monad Metropolis](https://hackathon.monad.xyz) (Consumer Products & Payments) and [Arbitrum Open House](https://hackquest.io/en/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon). Same Angular app + same Solidity contract; switch the network in the UI.

## Demo (Monad Testnet)

1. Open the live app. Connect a browser wallet (MetaMask).
2. Confirm the network is **Monad Testnet**. In current MetaMask the network list is at the **bottom of the sidebar**. The title **Account 1** is the account, not the network.
3. The contract address above should already be filled. Do not deploy a new one unless you want your own copy.
4. Get test MON from https://faucet.monad.xyz if the wallet is empty.
5. **Lock payment** → status `funded`.
6. **Pay a different address** → `held · payee_mismatch`. Funds stay in the lock.
7. **Pay the invoice payee** → `released`.
8. **Pay again** → `already_settled`.

Need testnet MON, not mainnet money.

## Layout

```
contracts/   Foundry: Paylock.sol + tests
src/         Angular 17 UI
```

## Local

```bash
npm install
npm start
```

Open http://localhost:4200.

```bash
export PATH="$PATH:$HOME/.foundry/bin"
cd contracts
forge install foundry-rs/forge-std
forge test
```

## Monad Testnet

| | |
|---|---|
| Chain ID | `10143` |
| RPC | `https://testnet-rpc.monad.xyz` |
| Explorer | https://testnet.monadvision.com |
| Faucet | https://faucet.monad.xyz |
| Contract | `0x132f284c85421EEF684a0B4A6639Cc541d9ED9aB` |

## Tests

`forge test` covers: match → released, wrong payee → funds stay, wrong amount → funds stay, replay → already_settled, stranger cannot release, refund.
