# Hardhat package

Contracts, tests and the deploy script for HBAR price-drop cover. Run the commands below from the repository root.

## Test

```bash
yarn hardhat:test
```

The tests run on the in-process Hardhat network. `test/coverFixture.ts` installs mocks of the Hedera Token Service at `0x167` and the Hedera Schedule Service at `0x16b`, and deploys a mock Chainlink aggregator. There is no local node and no testnet fork.

## Deploy to Hedera testnet

1. Create a deployer key. It is stored encrypted in `packages/hardhat/.env`.

   ```bash
   yarn hardhat:account:generate
   ```

   Or import an existing key with `yarn hardhat:account:import`.

2. Fund the printed address with testnet HBAR from the [Hedera Portal faucet](https://portal.hedera.com/faucet). You need about 30 HBAR. Check the balance with `yarn hardhat:account`.

3. Deploy. You are asked for the key's password.

   ```bash
   yarn hardhat:deploy --network hederaTestnet
   ```

   The script deploys `PriceDropCover` with the terms in `DEFAULT_TERMS`, calls `createPolicyToken` to create the policy NFT collection, and writes `../nextjs/contracts/deployedContracts.ts`.

4. Verify the source on Sourcify. HashScan shows Sourcify-verified contracts.

   ```bash
   yarn hardhat:verify:testnet
   ```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `HEDERA_TESTNET_RPC_URL` | `https://testnet.hashio.io/api` | JSON-RPC for testnet |
| `HEDERA_MAINNET_RPC_URL` | `https://mainnet.hashio.io/api` | JSON-RPC for mainnet |
| `COVER_PERIOD_SECONDS` | `604800` | Cover length for a new deployment |
| `POLICY_TOKEN_CREATION_FEE_HBAR` | `25` | HBAR sent to create the NFT collection |

## Layout

| Path | Contents |
| --- | --- |
| `contracts/` | `PriceDropCover`, `UnderwriterPool` |
| `contracts/chainlink/` | Feed interface and `ChainlinkRounds` |
| `contracts/hedera/` | HTS and HSS interfaces and addresses |
| `contracts/test/` | Mocks, used only by tests |
| `deploy/` | hardhat-deploy script with feed addresses and cover terms |
| `test/` | Unit tests |
| `hardhat.config.ts` | Compiler (Solidity 0.8.28, Cancun), networks, Sourcify |
