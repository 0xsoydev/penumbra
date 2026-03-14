# Deployment steps (PLAN-1-CONTRACTS)

From repo root. Contracts and tests are done; follow these in order.

---

## Step 6: Configure deployer account

**Option A — New keypair**

```bash
yarn generate
```

This creates a new Foundry keystore and prints the address. It may update `packages/foundry/.env` (e.g. `DEPLOYER_PRIVATE_KEY`).

**Option B — Use existing private key**

```bash
yarn account:import
```

Follow the prompts to import your key into a keystore.

**Then**

1. Note the deployer address (e.g. from `yarn account`).
2. Fund it with Base Sepolia ETH: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet

---

## Step 7: Deploy to Base Sepolia

```bash
yarn deploy --network baseSepolia
```

- Uses the script `Deploy.s.sol` (PenumbraToken + PenumbraAuction).
- You may be prompted to select or create a keystore and enter its password.
- On success, `packages/nextjs/contracts/deployedContracts.ts` is auto-generated.

---

## Step 8: Publish `deployed.json`

Right after deploy:

1. Copy `deployed.json.example` to `deployed.json` in the **repo root**.
2. Fill in:
   - **PenumbraToken** and **PenumbraAuction** — from the deploy script logs.
   - **deployerAddress** — yes, include it (the wallet that deployed; same as “Penumbra” keystore address). The team may need it (e.g. backend owner). Addresses are public on-chain, so it’s fine to share and commit.
   - **deployedAt** — the time the contracts were deployed, in ISO format (e.g. `2026-03-13T12:34:56.000Z`). Use the time you ran `yarn deploy`, or get the block timestamp from the deploy tx on [Basescan](https://sepolia.basescan.org). Running `date -u +%Y-%m-%dT%H:%M:%S.000Z` when you deploy is close enough.
3. Share the addresses with the team. Person 2 needs the auction address for `DARKAUCTION_CONTRACT_ADDRESS`; Person 3 needs both for `externalContracts.ts`.

**Commit:** You may commit `deployed.json`. It only contains addresses, not secrets. Never commit `.env` or any file with private keys.

---

## Step 9: Verify on Base Sepolia Explorer

```bash
yarn verify --network baseSepolia
```

**Why an API key?** It’s only for **contract verification** (Step 9), not for deployment or your wallet. `yarn verify` sends your contract source to **Basescan** (Base Sepolia’s block explorer) so the contract shows as “Verified” and people can read the code. Basescan uses the same kind of API key as Etherscan. Get one (free) at https://basescan.org/myapikey and set it in `packages/foundry/.env` as `ETHERSCAN_API_KEY`.
