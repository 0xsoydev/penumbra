# DarkAuction — Complete Project Context

> **ETHMumbai 2026 Hackathon** · March 8, 2026 · Team of 4 · ~36-48 hours
>
> Sealed-bid OTC auction platform for illiquid tokens with privacy-preserving settlement.

---

## Table of Contents

1. [Project Summary](#1-project-summary)
2. [Bounty Targets](#2-bounty-targets)
3. [Tech Stack](#3-tech-stack)
4. [Architecture Overview](#4-architecture-overview)
5. [Detailed Auction Flow](#5-detailed-auction-flow)
6. [Smart Contracts](#6-smart-contracts)
7. [Database Schema](#7-database-schema)
8. [API Routes](#8-api-routes)
9. [Backend Services](#9-backend-services)
10. [Frontend Pages](#10-frontend-pages)
11. [Custom Hooks](#11-custom-hooks)
12. [Integration Components](#12-integration-components)
13. [Team Structure & File Ownership](#13-team-structure--file-ownership)
14. [Environment Variables](#14-environment-variables)
15. [SE2 Scaffold Rules](#15-se2-scaffold-rules)
16. [Repo File Structure](#16-repo-file-structure)
17. [Dependency Notes & Gotchas](#17-dependency-notes--gotchas)
18. [Scaffold Setup History](#18-scaffold-setup-history)
19. [Key Commands Reference](#19-key-commands-reference)
20. [Deployment Checklist](#20-deployment-checklist)

---

## 1. Project Summary

**DarkAuction** is a sealed-bid OTC (over-the-counter) auction platform that allows sellers of illiquid ERC-20 tokens to run private, verifiable auctions. Bidders compete in a commit-reveal scheme — nobody can see what others are bidding until the reveal phase ends. Settlement is privacy-preserving: winners and sellers receive funds to **stealth addresses** (Umbra protocol), making the payment trail unlinkable on-chain.

### Why it's novel

- **Sealed bids are on-chain** (commit-reveal in the contract itself, not trusted off-chain) — required for the Base Privacy bounty
- **Hybrid custodial/non-custodial architecture**: the contract holds the seller's ERC-20 tokens; BitGo holds bidder ETH deposits. This is necessary because BitGo only supports pre-registered coins and cannot custody arbitrary custom ERC-20s
- **Settlement via stealth addresses**: both the winner (receives tokens) and the seller (receives ETH) get paid to fresh Umbra-derived stealth addresses, breaking the on-chain linkage between auction participation and fund receipt
- **Seller pseudonymity via ENS**: sellers can set a `darkauction.[auctionId]` text record on their ENS name to present a pseudonym rather than their raw address
- **Encrypted deal documents**: sellers can attach deal terms via Fileverse (NaCl-encrypted, stored on IPFS)

---

## 2. Bounty Targets

| Bounty | Prize | How We Qualify | Team Owner |
|---|---|---|---|
| **BitGo Privacy** | $600 | BitGo custodial escrow for all bidder ETH deposits; `sendMany()` for batch settlement/refund | Person 2 |
| **Base Privacy** | $200 | Commit-reveal is fully on-chain in `DarkAuction.sol` (not backend-trusted) | Person 1 |
| **ENS Creative** | $500+ | Sellers set `darkauction.[id]` text record on ENS name → displayed as pseudonym | Person 4 |
| **Fileverse** | $600 | NaCl-encrypted deal documents stored on IPFS via `@fileverse/crypto` | Person 4 |
| **ETHMumbai Privacy** | $250 | Umbra stealth addresses for settlement — tokens to winner, ETH to seller, both unlinkable | Person 2 |
| **ETHMumbai DeFi** | $250 | Novel sealed-bid auction primitive for illiquid token markets | Person 1 |
| **ETHMumbai Best Overall** | $250 | Combined privacy + DeFi + UX narrative | All |
| **Total potential** | **~$2,750** | | |

---

## 3. Tech Stack

### Blockchain
| Layer | Choice | Notes |
|---|---|---|
| Framework | Scaffold-ETH 2 (SE2), **Foundry flavor** | Foundry v1.5.1 (upgraded from 1.3.5 which was too old) |
| Network | **Base Sepolia** | Chain ID `84532` |
| Solidity | `^0.8.19` | |
| Contract libs | OpenZeppelin v5 | `ReentrancyGuard`, `Ownable`, `SafeERC20`, `ERC20` |

### Frontend
| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js App Router | `~15.2.8` |
| React | React | `~19.2.3` |
| Wallet | RainbowKit + Wagmi + Viem | Wagmi `2.19.5`, Viem `2.39.0` |
| UI | SE2 scaffold-ui components + DaisyUI | DaisyUI `5.0.9` |
| State | Zustand | `~5.0.0` |
| Queries | TanStack React Query | `~5.59.15` |

### Backend (Next.js API Routes — server-side only)
| Layer | Choice | Notes |
|---|---|---|
| Database | **Neon.tech** (serverless Postgres) | `@neondatabase/serverless` |
| ORM | Drizzle ORM | `drizzle-orm` + `drizzle-kit push` for migrations |
| Custodial ETH escrow | **BitGo** | `@bitgo/sdk-api`, `@bitgo/sdk-core`, `@bitgo/sdk-coin-eth` |
| Privacy / stealth | **Umbra JS** | `@umbracash/umbra-js` v0.2.2 — **ethers v5 only, server-side only** |
| Contract calls | ethers v5 | `ethers@^5.7.2` — backend only |
| Encryption | Fileverse | `@fileverse/crypto` — client-safe (NaCl) |

### Package Manager
- **Yarn 3.2.3** (Berry), workspaces
- Resolution fix added: `"@uniswap/sdk-core": "7.12.2"` in root `package.json`
- Node requirement: `>=20.18.3`

---

## 4. Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          BROWSER (Client)                           │
│                                                                     │
│  Next.js App Router Pages                                           │
│  ┌───────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │
│  │  Home /       │  │ /auction/create  │  │  /auction/[id]       │ │
│  │  (list aucts) │  │ (seller flow)    │  │  (commit/reveal/end) │ │
│  └───────────────┘  └──────────────────┘  └──────────────────────┘ │
│                                                                     │
│  SE2 Hooks (wagmi/viem)                Custom Hooks (Person 4)      │
│  useScaffoldReadContract               useAuctionPhase              │
│  useScaffoldWriteContract              useBidCommit                 │
│                                        useStealthKeys               │
│                                        useBitGoDeposit              │
│                                                                     │
│  @scaffold-ui/components: Address, Balance, EtherInput              │
│  @fileverse/crypto (NaCl encrypt/decrypt — browser-safe)            │
└───────────────────┬─────────────────────────────────────────────────┘
                    │  RainbowKit/Wagmi wallet txs
                    │  Next.js API fetch calls
          ┌─────────▼──────────────────────────────────────────────────┐
          │               BASE SEPOLIA (Chain ID 84532)                 │
          │                                                             │
          │   ┌───────────────────┐      ┌────────────────────────┐    │
          │   │   DarkToken.sol   │      │    DarkAuction.sol     │    │
          │   │   ERC20 + Ownable │      │  ReentrancyGuard       │    │
          │   │   1M DARK minted  │      │  Ownable               │    │
          │   │   to deployer     │      │  SafeERC20             │    │
          │   └───────────────────┘      │                        │    │
          │                              │  createAuction()       │    │
          │   Seller calls:              │  commitBid()           │    │
          │   approve(DarkAuction, amt)  │  revealBid()           │    │
          │   → then createAuction()     │  settle() [onlyOwner]  │    │
          │                              │  cancelAuction()       │    │
          │                              └────────────┬───────────┘    │
          └───────────────────────────────────────────┼────────────────┘
                                                      │
                    ┌─────────────────────────────────▼─────────────────┐
                    │          NEXT.JS API ROUTES (Server-side)          │
                    │                                                    │
                    │  POST /api/auction/create                          │
                    │  POST /api/auction/[id]/deposit                    │
                    │  GET  /api/auction/[id]/status                     │
                    │  POST /api/auction/[id]/settle  ◄── owner key      │
                    │  POST /api/webhook/bitgo                           │
                    │  POST /api/stealth/register                        │
                    │  GET  /api/stealth/announcements                   │
                    │                                                    │
                    │  Services (server-only):                           │
                    │  ┌────────────┐ ┌────────────┐ ┌───────────────┐  │
                    │  │  bitgo.ts  │ │  umbra.ts  │ │ contract.ts   │  │
                    │  │            │ │  ethers v5 │ │  ethers v5    │  │
                    │  └─────┬──────┘ └─────┬──────┘ └───────┬───────┘  │
                    └────────┼──────────────┼────────────────┼──────────┘
                             │              │                │
               ┌─────────────▼──┐    ┌──────▼───────┐   ┌───▼──────────┐
               │  BITGO TEST     │    │  NEON.TECH   │   │ BASE SEPOLIA  │
               │  app.bitgo-     │    │  Serverless  │   │ RPC (owner    │
               │  test.com       │    │  PostgreSQL  │   │ signer calls  │
               │  coin: tbaseeth │    │  (Drizzle)   │   │ settle())     │
               │                 │    │              │   └───────────────┘
               │  Per-auction    │    │  4 tables:   │
               │  wallet holds   │    │  auctions    │
               │  bidder ETH     │    │  deposits    │
               │                 │    │  stealth_keys│
               │  sendMany() →   │    │  announcements│
               │  seller stealth │    └──────────────┘
               │  + loser refunds│
               └─────────────────┘
```

### Privacy Flow Diagram

```
                        COMMIT PHASE
  Bidder ──── commitBid(keccak256(amount ‖ salt)) ────► DarkAuction.sol
  Bidder ──── send ETH ──────────────────────────────► BitGo deposit address
  BitGo webhook ─────── confirms deposit ────────────► Neon DB (confirmed=true)

                        REVEAL PHASE
  Bidder ──── revealBid(amount, salt) ───────────────► DarkAuction.sol
  Contract verifies: keccak256(amount ‖ salt) == stored hash
  Contract tracks highest revealed bid → winner

                        SETTLEMENT
  Backend (owner) ──── getAuction(id) ───────────────► read winner address
  Backend ──────────── generateStealthAddress(winner) ► Umbra EC math → stealthAddr₁
  Backend ──────────── generateStealthAddress(seller) ► Umbra EC math → stealthAddr₂
  Backend ──────────── settle(id, stealthAddr₁) ──────► DarkAuction.sol
  Contract ─────────── safeTransfer(tokens → stealthAddr₁)
  Backend ──────────── BitGo.sendMany([
                          seller → stealthAddr₂ (winning ETH),
                          loser₁ → their address (refund),
                          loser₂ → their address (refund),
                        ])
  Backend ──────────── store stealthAnnouncements in Neon DB
  Recipients ────────── fetch /api/stealth/announcements
                        scan ephemeral keys → find their stealth payment
```

---

## 5. Detailed Auction Flow

### Step 1: Seller Creates Auction

1. Seller navigates to `/auction/create`
2. Seller calls `DarkToken.approve(DarkAuction_address, tokenAmount)` via wallet
3. Seller calls `DarkAuction.createAuction(tokenAddress, tokenAmount, minimumBid, commitDuration, revealDuration)`
   - Contract pulls tokens via `safeTransferFrom` — tokens are now locked in the contract
   - Returns `auctionId` (auto-incremented `nextAuctionId`)
   - Emits `AuctionCreated(auctionId, seller, tokenAddress, tokenAmount)`
4. Frontend calls `POST /api/auction/create` with `{ auctionId, sellerAddress, ensName?, docCid? }`
   - Backend creates a dedicated BitGo wallet for this auction
   - Stores `{ id, sellerAddress, bitgoWalletId, bitgoWalletAddress }` in Neon `auctions` table
5. Seller optionally sets ENS text record `darkauction.[auctionId]` for pseudonymity

### Step 2: Bidder Gets Deposit Address

1. Bidder navigates to `/auction/[id]` (commit phase)
2. `useBitGoDeposit(auctionId)` hook calls `POST /api/auction/[id]/deposit` with `{ bidderAddress }`
   - Backend creates a unique BitGo deposit address within the auction's wallet
   - Stores deposit record in Neon `deposits` table
   - Returns `{ depositAddress }`
3. Bidder sends ETH to the BitGo deposit address (outside the UI — raw transfer)
4. BitGo fires webhook to `POST /api/webhook/bitgo` when deposit confirms
   - Backend sets `confirmed = true`, `amountWei = <amount>` in `deposits` table
5. UI polls `GET /api/auction/[id]/status?bidder=<address>` every 15 seconds to show confirmation status

### Step 3: Bidder Commits Bid

1. Bidder enters their bid amount in the UI
2. `useBidCommit(auctionId).generateCommit(amount)`:
   - Generates cryptographically random 32-byte salt via `crypto.getRandomValues`
   - Computes `commitHash = keccak256(encodePacked(["uint256","bytes32"], [amount, salt]))` using viem
   - Stores salt to `localStorage` keyed by `dark-auction-salt:[auctionId]:[address]`
3. Bidder calls `DarkAuction.commitBid(auctionId, commitHash)` via wallet
   - Contract stores `{ commitHash, revealed: false }` for `(auctionId, bidder)`
   - Emits `BidCommitted(auctionId, bidder, commitHash)`
   - Reverts if: past commitDeadline, duplicate commit, auction cancelled

### Step 4: Reveal Phase

1. After `commitDeadline` passes, auction enters reveal phase
2. Bidder navigates to auction detail — sees "Reveal Your Bid" form
3. `useBidCommit(auctionId)` loads salt from localStorage automatically
4. Bidder calls `DarkAuction.revealBid(auctionId, bidAmount, salt)` via wallet
   - Contract verifies: `keccak256(abi.encodePacked(bidAmount, salt)) == storedHash`
   - Updates winner if this bid is the new highest
   - Emits `BidRevealed(auctionId, bidder, amount)`
   - Reverts if: not in reveal window, no commit, already revealed, invalid hash, below minimumBid

### Step 5: Settlement

1. After `revealDeadline`, backend (or admin UI) calls `POST /api/auction/[id]/settle`
2. Backend reads on-chain winner via `getAuction(auctionId)`
3. Backend computes stealth addresses:
   - Fetches winner's `{ spendingPublicKey, viewingPublicKey }` from `stealth_keys` table
   - Fetches seller's keys from `stealth_keys` table
   - Uses Umbra JS elliptic curve math to derive `winnerStealthAddress` and `sellerStealthAddress`
   - Generates random ephemeral key per recipient
   - Stores announcements in `stealth_announcements` table
4. Backend calls `DarkAuction.settle(auctionId, winnerStealthAddress)` as contract owner
   - Contract transfers `tokenAmount` ERC-20 tokens to `winnerStealthAddress`
   - Emits `AuctionSettled(auctionId, winner, winningBid, stealthAddress)`
5. Backend calls `BitGo.sendMany()`:
   - Seller's stealth address receives winner's deposited ETH (winning bid amount)
   - All losing bidders receive refunds to their original addresses
6. Recipients call `GET /api/stealth/announcements?recipient=<address>` to find their stealth payments
   - They use their viewing key to scan ephemeral keys and identify which stealth address is theirs

---

## 6. Smart Contracts

### 6.1 `DarkToken.sol`

**Location:** `packages/foundry/contracts/DarkToken.sol`

Simple ERC-20 token used for testing the auction flow.

```
Inherits: ERC20, Ownable
Constructor: DarkToken(address initialOwner)
  - Sets name="DarkToken", symbol="DARK"
  - Mints 1,000,000 DARK (with 18 decimals) to initialOwner

Functions:
  mint(address to, uint256 amount) onlyOwner
    - Allows owner to mint additional tokens
```

### 6.2 `DarkAuction.sol`

**Location:** `packages/foundry/contracts/DarkAuction.sol`

Core auction contract. Holds seller's ERC-20 tokens for the duration of the auction.

```
Inherits: ReentrancyGuard, Ownable
Uses: SafeERC20 for IERC20
```

#### Enums

```solidity
enum AuctionPhase {
  COMMIT     = 0,   // before commitDeadline
  REVEAL     = 1,   // after commitDeadline, before revealDeadline
  ENDED      = 2,   // after revealDeadline
  CANCELLED  = 3    // explicitly cancelled
}
```

#### Structs

```solidity
struct Auction {
  address seller;
  address tokenAddress;
  uint256 tokenAmount;
  uint256 minimumBid;
  uint256 commitDeadline;       // block.timestamp + commitDuration
  uint256 revealDeadline;       // commitDeadline + revealDuration
  address winner;               // address(0) until a bid is revealed
  uint256 winningBid;           // 0 until a bid is revealed
  address winnerStealthAddress; // set by settle()
  bool settled;
  bool cancelled;
}

struct Commit {
  bytes32 commitHash;           // keccak256(abi.encodePacked(bidAmount, salt))
  bool revealed;
  uint256 revealedAmount;
}
```

#### Storage

```solidity
uint256 public nextAuctionId;
mapping(uint256 => Auction)                       public auctions;
mapping(uint256 => mapping(address => Commit))    public commits;
mapping(uint256 => address[])                     public auctionBidders;
```

#### Functions

| Function | Visibility | Description |
|---|---|---|
| `createAuction(tokenAddress, tokenAmount, minimumBid, commitDuration, revealDuration)` | `external` | Pulls ERC-20 tokens from seller, creates auction record. Returns `auctionId`. |
| `commitBid(auctionId, commitHash)` | `external` | Stores commit hash. Only during commit phase, one commit per bidder. |
| `revealBid(auctionId, bidAmount, salt)` | `external` | Verifies reveal against stored hash, updates winner if highest bid. |
| `settle(auctionId, winnerStealthAddress)` | `external onlyOwner nonReentrant` | Transfers tokens to stealth address. Backend calls this after computing stealth addrs. |
| `cancelAuction(auctionId)` | `external nonReentrant` | Seller or owner cancels. Refunds tokens to seller. |
| `getAuctionPhase(auctionId)` | `external view` | Returns `AuctionPhase` enum value. |
| `getAuction(auctionId)` | `external view` | Returns full `Auction` struct. |
| `getCommit(auctionId, bidder)` | `external view` | Returns `Commit` struct for a bidder. |
| `getAuctionBidders(auctionId)` | `external view` | Returns `address[]` of all committed bidders. |

#### Events

```solidity
event AuctionCreated(uint256 indexed auctionId, address indexed seller, address tokenAddress, uint256 tokenAmount);
event BidCommitted(uint256 indexed auctionId, address indexed bidder, bytes32 commitHash);
event BidRevealed(uint256 indexed auctionId, address indexed bidder, uint256 amount);
event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 winningBid, address stealthAddress);
event AuctionCancelled(uint256 indexed auctionId);
```

#### Commit Hash Computation

The commit-reveal scheme uses:
```solidity
commitHash = keccak256(abi.encodePacked(bidAmount, salt))
// bidAmount: uint256 (wei)
// salt: bytes32 (random)
```

Client-side equivalent (viem):
```typescript
import { keccak256, encodePacked } from "viem";
const hash = keccak256(encodePacked(["uint256", "bytes32"], [amount, salt]));
```

#### Security Properties

- `nonReentrant` on `settle` and `cancelAuction` — prevents reentrancy during token transfers
- `SafeERC20` — handles non-standard ERC-20 tokens safely
- `onlyOwner` on `settle` — only the backend (deployer) can trigger settlement, ensuring stealth address computation happens off-chain first
- Commit phase enforced by timestamp — bids submitted after deadline revert
- Reveal phase enforced by timestamp — reveals outside window revert
- Double-commit and double-reveal both revert

### 6.3 Deploy Script

**Location:** `packages/foundry/script/Deploy.s.sol`

Deploys both `DarkToken` and `DarkAuction` with the deployer as `initialOwner` / `Ownable` owner.

```
Reads: PRIVATE_KEY from env
Deploys: DarkToken(deployer), DarkAuction(deployer)
Logs: both deployed addresses
```

After deploy, `yarn deploy --network baseSepolia` auto-generates:
- `packages/nextjs/contracts/deployedContracts.ts` — contains ABIs + addresses, consumed by SE2 hooks

### 6.4 Test Scenarios

**Location:** `packages/foundry/test/DarkAuction.t.sol`

13 required test scenarios:

| # | Test Name | What It Covers |
|---|---|---|
| 1 | `test_CreateAuction_Success` | Seller approves + createAuction, verify stored state + token transfer |
| 2 | `test_CreateAuction_RevertsOnZeroAmount` | tokenAmount = 0 reverts |
| 3 | `test_CommitBid_Success` | commitBid stores hash, emits event |
| 4 | `test_CommitBid_RevertsAfterDeadline` | vm.warp past commitDeadline, expect revert |
| 5 | `test_CommitBid_RevertsDuplicate` | same bidder commits twice, reverts |
| 6 | `test_RevealBid_Success` | valid reveal, winner updated |
| 7 | `test_RevealBid_RevertsInvalidHash` | wrong amount or salt, reverts |
| 8 | `test_RevealBid_RevertsBelowMinimum` | bidAmount < minimumBid, reverts |
| 9 | `test_RevealBid_MultipleWinnerIsHighest` | 3 bidders reveal, assert correct winner |
| 10 | `test_Settle_TransfersTokensToStealth` | settle() transfers tokenAmount to stealthAddress |
| 11 | `test_Settle_RevertsIfNoWinner` | no reveals, settle reverts |
| 12 | `test_Settle_RevertsIfNotOwner` | non-owner calls settle, reverts |
| 13 | `test_CancelAuction_RefundsSeller` | cancel returns tokens to seller |

---

## 7. Database Schema

**Provider:** Neon.tech (serverless PostgreSQL)
**ORM:** Drizzle ORM
**File:** `packages/nextjs/db/schema.ts`
**Migrations:** `npx drizzle-kit push` (schema-push, no migration files for hackathon)

### Table: `auctions`

| Column | Type | Notes |
|---|---|---|
| `id` | `bigint PK` | Matches on-chain `auctionId` — NOT auto-increment |
| `seller_address` | `text NOT NULL` | Lowercase hex |
| `bitgo_wallet_id` | `text NOT NULL` | BitGo wallet ID for this auction |
| `bitgo_wallet_address` | `text NOT NULL` | Base receive address of BitGo wallet |
| `ens_name` | `text` | Nullable — seller's ENS name if provided |
| `doc_cid` | `text` | Nullable — IPFS CID of encrypted Fileverse document |
| `created_at` | `timestamp` | defaultNow() |

### Table: `deposits`

| Column | Type | Notes |
|---|---|---|
| `id` | `serial PK` | Auto-increment |
| `auction_id` | `bigint FK → auctions.id` | |
| `bidder_address` | `text NOT NULL` | Lowercase hex |
| `bitgo_deposit_address` | `text NOT NULL` | Unique deposit address within the auction wallet |
| `amount_wei` | `text NOT NULL` | String to avoid BigInt overflow. Default `"0"` |
| `confirmed` | `boolean` | Default `false`. Set to `true` by BitGo webhook |

### Table: `stealth_keys`

| Column | Type | Notes |
|---|---|---|
| `address` | `text PK` | Lowercase hex — the user's wallet address |
| `spending_public_key` | `text NOT NULL` | EC public key for stealth address generation |
| `viewing_public_key` | `text NOT NULL` | EC public key for stealth address scanning |

Note: Keys are stored in Neon DB, NOT in the Umbra StealthKeyRegistry contract (which is not deployed on Base Sepolia). This is an intentional architectural decision — the contract is not needed since we use Umbra as a pure math library.

### Table: `stealth_announcements`

| Column | Type | Notes |
|---|---|---|
| `id` | `serial PK` | Auto-increment |
| `recipient_address` | `text NOT NULL` | Lowercase hex of intended recipient |
| `ephemeral_public_key` | `text NOT NULL` | One-time public key generated during stealth addr derivation |
| `stealth_address` | `text NOT NULL` | The derived stealth address receiving funds |
| `auction_id` | `bigint NOT NULL` | Which auction this settlement is for |

Recipients use the ephemeral public key + their viewing private key to scan and identify which stealth address is theirs.

---

## 8. API Routes

All routes live in `packages/nextjs/app/api/`. All are Next.js App Router Route Handlers.

### `POST /api/auction/create`

**Purpose:** Create a BitGo wallet for a new auction, store in DB.

**Request body:**
```json
{
  "auctionId": 0,
  "sellerAddress": "0x...",
  "ensName": "seller.eth",     // optional
  "docCid": "bafyrei..."       // optional — IPFS CID of encrypted doc
}
```

**Response:**
```json
{ "success": true, "walletId": "...", "walletAddress": "0x..." }
```

**Side effects:** Creates BitGo wallet labeled `dark-auction-[auctionId]`, inserts row in `auctions` table.

---

### `POST /api/auction/[id]/deposit`

**Purpose:** Create or fetch a unique BitGo deposit address for a bidder.

**Request body:**
```json
{ "bidderAddress": "0x..." }
```

**Response:**
```json
{ "depositAddress": "0x..." }
```

**Side effects:** Calls `BitGo.createAddress()` on the auction wallet. Inserts row in `deposits` table. Idempotent — returns existing address if already created.

---

### `GET /api/auction/[id]/status`

**Purpose:** Check whether a bidder's ETH deposit has been confirmed by BitGo.

**Query params:** `?bidder=0x...`

**Response:**
```json
{
  "confirmed": true,
  "depositAddress": "0x...",
  "amountWei": "1000000000000000"
}
```

---

### `POST /api/auction/[id]/settle`

**Purpose:** Compute stealth addresses, settle contract, disburse ETH via BitGo.

**Request body:** none (auction ID is in path)

**Response:**
```json
{
  "success": true,
  "settleTxHash": "0x...",
  "bitgoTxHash": "0x...",
  "winnerStealth": "0x...",
  "sellerStealth": "0x..."
}
```

**Side effects (in order):**
1. Reads on-chain winner from `DarkAuction.getAuction(id)`
2. Fetches winner + seller stealth keys from Neon `stealth_keys`
3. Generates stealth addresses via Umbra JS + stores in `stealth_announcements`
4. Calls `DarkAuction.settle(id, winnerStealth)` as contract owner → transfers ERC-20 tokens
5. Calls `BitGo.sendMany()` → sends ETH to seller stealth + refunds to losers

---

### `POST /api/webhook/bitgo`

**Purpose:** Receive BitGo transfer confirmation webhooks.

**Payload:** Standard BitGo webhook body with `type === "transfer"` and `transfer.state === "confirmed"`.

**Side effects:** Updates `deposits` row: sets `confirmed = true`, stores `amountWei`.

**Setup:** Configure in BitGo admin dashboard → Notifications → Add webhook → URL: `<ngrok or Vercel URL>/api/webhook/bitgo`

---

### `POST /api/stealth/register`

**Purpose:** Store a user's stealth public keys in Neon DB.

**Request body:**
```json
{
  "address": "0x...",
  "spendingPublicKey": "0x...",
  "viewingPublicKey": "0x..."
}
```

**Response:**
```json
{ "success": true }
```

**Note:** Uses `onConflictDoUpdate` — upserts if keys already exist for this address.

---

### `GET /api/stealth/announcements`

**Purpose:** Return stealth payment announcements so recipients can scan for their funds.

**Query params:** `?recipient=0x...` (optional — returns all if omitted)

**Response:**
```json
[
  {
    "id": 1,
    "recipientAddress": "0x...",
    "ephemeralPublicKey": "0x...",
    "stealthAddress": "0x...",
    "auctionId": 0
  }
]
```

---

## 9. Backend Services

All services are in `packages/nextjs/services/`. All are server-side only — never import in `"use client"` files.

### `services/bitgo.ts`

Wraps `@bitgo/sdk-api` for all BitGo operations.

| Function | Description |
|---|---|
| `createAuctionWallet(auctionId)` | Creates a new BitGo wallet labeled `dark-auction-[id]`. Returns `{ walletId, address }` |
| `createDepositAddress(walletId)` | Creates a new receive address within the wallet. Returns address string |
| `getWalletBalance(walletId)` | Returns balance as string (wei) |
| `sendMany(walletId, recipients)` | Sends ETH to multiple recipients in one BitGo transaction. Returns txid |

**BitGo Configuration:**
- Environment: `test`
- Base URL: `https://app.bitgo-test.com`
- Coin identifier: `tbaseeth` (Base Sepolia on BitGo test)
- OTP: always `"0000000"` on test environment
- Wallet passphrase: from `BITGO_WALLET_PASSPHRASE` env var

---

### `services/umbra.ts`

Provides stealth address generation using Umbra JS elliptic curve math.

**Critical constraints:**
- `@umbracash/umbra-js` v0.2.2 uses **ethers v5** — not v6
- **Server-side only** — never import in any `"use client"` file or browser-executed code
- Umbra contracts are **not deployed on Base Sepolia** — we use the package purely as an EC math library
- No interaction with any Umbra on-chain contracts
- Stealth keys are stored in Neon DB, not in `StealthKeyRegistry`

| Function | Description |
|---|---|
| `generateStealthAddress(recipientAddress, auctionId)` | Fetches recipient's public keys from DB, generates ephemeral key pair, derives stealth address via ECDH, stores announcement. Returns `{ stealthAddress, ephemeralPublicKey }` |

**Stealth Address Derivation Algorithm:**
1. Fetch recipient's `spendingPublicKey` and `viewingPublicKey` from DB
2. Generate random ephemeral private key (`ethers.Wallet.createRandom()`)
3. ECDH: `sharedSecret = keccak256(ephemeralPrivKey × viewingPubKey)`
4. Stealth key = `spendingPubKey + sharedSecret × G`
5. Stealth address = Ethereum address of stealth public key
6. Announcement stored: `{ recipientAddress, ephemeralPublicKey, stealthAddress, auctionId }`

---

### `services/contract.ts`

Wraps ethers v5 contract calls for server-side use.

| Function | Description |
|---|---|
| `settleAuction(auctionId, winnerStealthAddress)` | Calls `settle()` as owner signer. Waits for tx confirmation. Returns tx hash |
| `getAuctionOnChain(auctionId)` | Reads full Auction struct |
| `getAuctionBidders(auctionId)` | Returns `address[]` |

**Signer:** Deployer private key from `DEPLOYER_PRIVATE_KEY` env var. This is the same key used to deploy the contracts (making it the `Ownable` owner).

---

### `services/fileverse.ts`

Client-safe NaCl encryption/decryption using `@fileverse/crypto`.

| Function | Description |
|---|---|
| `encryptAndUploadDoc(content, secretKey)` | Encrypts string content with NaCl secretbox, uploads to IPFS. Returns CID |
| `fetchAndDecryptDoc(cid, secretKey)` | Fetches encrypted blob from IPFS gateway (`w3s.link`), decrypts. Returns string |

**Note:** `@fileverse/crypto` is browser-compatible — unlike ethers/umbra, this CAN be imported in client components.

---

## 10. Frontend Pages

All pages are in `packages/nextjs/app/`. All use Next.js App Router.

### `app/page.tsx` — Home / Auction List

**What it shows:**
- Page title and tagline
- "Create Auction" button → `/auction/create`
- Grid of `AuctionCard` components, one per auction
- Each card: auction ID, seller address (SE2 `<Address>` component), token amount, phase badge, time remaining, link to detail

**Contract reads:** `nextAuctionId` → iterate and load each auction

**Phase display:** `COMMIT` (warning), `REVEAL` (info), `ENDED` (success), `CANCELLED` (error)

---

### `app/auction/create/page.tsx` — Create Auction

**Flow:**
1. Input: token address (`AddressInput`), token amount, minimum bid (`EtherInput`), commit phase hours, reveal phase hours
2. Click "Create Auction":
   - `writeContractAsync` on `DarkToken.approve(DarkAuction, amount)`
   - `writeContractAsync` on `DarkAuction.createAuction(...)`
   - `POST /api/auction/create` to set up BitGo wallet
3. Redirect to `/auction/[newId]`

---

### `app/auction/[id]/page.tsx` — Auction Detail

The most complex page. Shows different UI based on auction phase.

**All phases — always shows:**
- Auction ID, phase badge
- Seller address with ENS resolution
- Token amount
- Minimum bid
- Fileverse doc viewer (if `docCid` exists) — from Person 4's component

**COMMIT phase (phase = 0):**
- BitGo deposit address (from `useBitGoDeposit` hook) with QR code
- Deposit confirmation status (polling)
- Bid amount input
- "Generate Commit Hash" button → calls `useBidCommit.generateCommit(amount)` → computes and stores hash+salt
- Warning alert showing salt + localStorage reminder
- "Submit Commit" button → calls `DarkAuction.commitBid(auctionId, commitHash)`

**REVEAL phase (phase = 1):**
- "Reveal Your Bid" form
- Bid amount input
- Salt field (auto-populated from localStorage via `useBidCommit`)
- "Reveal Bid" button → calls `DarkAuction.revealBid(auctionId, bidAmount, salt)`

**ENDED phase (phase = 2), not settled:**
- "Auction Ended" card
- Admin settle button → `POST /api/auction/[id]/settle`

**ENDED phase, settled:**
- Success alert
- Winner's stealth address displayed

---

### `app/profile/page.tsx` — Privacy Profile

- Register stealth public keys form → `POST /api/stealth/register`
- View all stealth announcements for connected address → `GET /api/stealth/announcements?recipient=<address>`
- Announcements show: auction ID, stealth address (where funds were sent), ephemeral public key

---

## 11. Custom Hooks

All hooks in `packages/nextjs/hooks/`. All are `"use client"` hooks. Person 4 owns implementation; Person 3 consumes.

### Types (defined in `packages/nextjs/types/auction.ts`)

```typescript
export enum AuctionPhase {
  COMMIT    = 0,
  REVEAL    = 1,
  ENDED     = 2,
  CANCELLED = 3,
}

export type StealthKeys = {
  spendingPubKey: string;
  viewingPubKey: string;
  isRegistered: boolean;
  register: () => Promise<void>;
};

export type AuctionPhaseData = {
  phase: AuctionPhase;
  timeRemaining: number;  // seconds until next phase transition
};

export type BidCommitData = {
  commitHash: `0x${string}` | null;
  generateCommit: (amount: bigint) => void;
  salt: `0x${string}` | null;
  clearSalt: () => void;
};

export type BitGoDepositData = {
  depositAddress: string | null;
  confirmed: boolean;
  amount: string;  // wei string
};
```

---

### `useStealthKeys()` → `StealthKeys`

**File:** `packages/nextjs/hooks/useStealthKeys.ts`

**What it does:**
- Checks localStorage for cached keys on mount
- `register()`: prompts wallet signature → deterministically derives `spendingPublicKey` + `viewingPublicKey` from signature → calls `POST /api/stealth/register` → caches in localStorage
- Returns `isRegistered: true` if keys exist in localStorage

**Key derivation (hackathon-grade):**
```
spendingSeed = keccak256("dark-auction-spending:" + signature)
viewingSeed  = keccak256("dark-auction-viewing:"  + signature)
```
Deterministic from wallet signature — regeneratable without storage.

---

### `useAuctionPhase(auctionId)` → `AuctionPhaseData`

**File:** `packages/nextjs/hooks/useAuctionPhase.ts`

**What it does:**
- Reads `getAuction(auctionId)` and `getAuctionPhase(auctionId)` via `useScaffoldReadContract`
- Computes `timeRemaining` = seconds until `commitDeadline` (during COMMIT) or `revealDeadline` (during REVEAL)
- Runs a `setInterval` countdown that ticks every second
- Returns 0 for `timeRemaining` when phase is ENDED or CANCELLED

---

### `useBidCommit(auctionId)` → `BidCommitData`

**File:** `packages/nextjs/hooks/useBidCommit.ts`

**What it does:**
- On mount: loads saved salt from `localStorage["dark-auction-salt:[auctionId]:[address]"]`
- `generateCommit(amount)`:
  - Generates 32 random bytes via `crypto.getRandomValues`
  - Computes `keccak256(encodePacked(["uint256","bytes32"], [amount, salt]))` using viem
  - Persists salt to localStorage
- `clearSalt()`: removes from localStorage and resets state

**Storage key format:** `dark-auction-salt:[auctionId]:[address.toLowerCase()]`

---

### `useBitGoDeposit(auctionId)` → `BitGoDepositData`

**File:** `packages/nextjs/hooks/useBitGoDeposit.ts`

**What it does:**
- On mount: calls `POST /api/auction/[id]/deposit` to get/create deposit address
- Polls `GET /api/auction/[id]/status?bidder=[address]` every 15 seconds
- Updates `confirmed` and `amount` as BitGo confirms

---

## 12. Integration Components

### `components/fileverse/FileverseDocViewer.tsx`

**Props:** `{ cid: string, secretKey?: Uint8Array }`

If `secretKey` is provided: fetches encrypted blob from `https://w3s.link/ipfs/[cid]`, decrypts with NaCl secretbox, displays content.

If no key: shows CID + "Provide decryption key to view" message.

Shows loading spinner while fetching, error alert on failure.

---

### `components/ens/ENSSellerName.tsx`

**Props:** `{ sellerAddress: 0x${string}, auctionId: number }`

Uses `useEnsName` (wagmi) to resolve ENS name for seller address (queries mainnet).

Uses `useEnsText` (wagmi) to read text record `darkauction.[auctionId]` from the resolved ENS name.

Displays: `<Address>` component + ENS name badge + darkauction text record badge (if set).

**ENS bounty flow for demo:**
1. Seller registers an ENS name on mainnet (e.g., `seller.eth`)
2. Seller sets text record: key = `darkauction.0`, value = `"The Whale"` via app.ens.domains
3. UI automatically shows "The Whale" as the seller's pseudonym for auction #0

---

## 13. Team Structure & File Ownership

### Person 1 — Smart Contracts

**Owns:** `packages/foundry/`

**Produces (critical path — team is blocked on this):**
- `DarkToken.sol`, `DarkAuction.sol` compiled and tested
- `dark-auction/deployed.json` immediately after `yarn deploy --network baseSepolia`
- `packages/nextjs/contracts/deployedContracts.ts` (auto-generated by deploy)

**Blocks:** Person 2 needs `DARKAUCTION_CONTRACT_ADDRESS`. Person 3 needs `externalContracts.ts`. Person 4's `useAuctionPhase` needs the contract live.

---

### Person 2 — Backend & Services

**Owns:** `packages/nextjs/db/`, `packages/nextjs/services/`, `packages/nextjs/app/api/`

**Produces:**
- Neon DB live with schema pushed → shares `DATABASE_URL`
- BitGo test account registered → shares credentials
- All 7 API routes functional
- `.env.example` committed (keys but no values)

**Blocks:** Person 3's live fetch calls. Person 4's `useBitGoDeposit` hook.

---

### Person 3 — Frontend Pages & UI

**Owns:** `packages/nextjs/app/` pages, `packages/nextjs/components/` (shared UI)

**Produces:**
- All 4 pages with SE2-compliant patterns
- Wires hooks from Person 4 once delivered
- Updates `externalContracts.ts` once Person 1 shares `deployed.json`

**Blocked by:** Person 1 (contract addresses), Person 4 (hook interfaces). Can work with mocks until unblocked.

---

### Person 4 — Hooks, Integrations & Deployment

**Owns:** `packages/nextjs/hooks/`, `packages/nextjs/services/fileverse.ts`, `packages/nextjs/components/fileverse/`, `packages/nextjs/components/ens/`, `packages/nextjs/app/layout.tsx`

**Produces:**
- `types/auction.ts` — **share immediately, Person 3 is blocked on this**
- 4 custom hooks
- Fileverse encrypt/decrypt service + viewer component
- ENS seller component
- Vercel deployment

**Blocks:** Person 3's hook integrations. Final demo URL for judging.

---

### Coordination Rules

```
Person 1 deploys → posts deployed.json to team chat
  → Person 2 updates DARKAUCTION_CONTRACT_ADDRESS in .env.local + services/contract.ts
  → Person 3 updates externalContracts.ts

Person 4 publishes types/auction.ts first thing
  → Person 3 can stub hook consumers immediately

Person 2 shares DATABASE_URL
  → Everyone adds to their .env.local

Person 2 runs ngrok for BitGo webhook testing
  → Updates BitGo webhook URL in admin dashboard

If any contract function signature changes:
  → Person 1 must notify ALL teammates immediately
  → Person 3 must update any direct calls
  → Person 2 must update services/contract.ts ABI
```

---

## 14. Environment Variables

All in `packages/nextjs/.env.local` (gitignored). Commit `packages/nextjs/.env.example` with keys but no values.

```env
# Database (Person 2 sets up, shares with team)
DATABASE_URL=postgres://...neon.tech/neondb?sslmode=require

# BitGo (Person 2 registers at app.bitgo-test.com)
BITGO_ACCESS_TOKEN=
BITGO_ENTERPRISE_ID=
BITGO_BASE_URL=https://app.bitgo-test.com
BITGO_WALLET_PASSPHRASE=auction-passphrase

# Contract (add after Person 1 deploys)
DARKAUCTION_CONTRACT_ADDRESS=TODO
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
DEPLOYER_PRIVATE_KEY=0x...   # same key that deployed contracts — IS the owner

# Frontend (public — safe to expose)
NEXT_PUBLIC_ALCHEMY_API_KEY=
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=

# Optional — Fileverse IPFS upload
NEXT_PUBLIC_WEB3_STORAGE_TOKEN=
```

**For Vercel deployment:** Add all env vars via Vercel dashboard before running `yarn vercel:yolo --prod`.

---

## 15. SE2 Scaffold Rules

These are mandatory patterns enforced by `AGENTS.md`. Violating them will cause runtime errors or break SE2's auto-wiring.

### Contract Hooks

```typescript
// CORRECT — use SE2 hooks
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

const { data } = useScaffoldReadContract({
  contractName: "DarkAuction",          // must match key in deployedContracts.ts
  functionName: "getAuction",
  args: [BigInt(auctionId)],
});

const { writeContractAsync } = useScaffoldWriteContract({ contractName: "DarkAuction" });
await writeContractAsync({ functionName: "commitBid", args: [BigInt(auctionId), hash] });

// WRONG — never use raw wagmi hooks for our contracts
import { useReadContract } from "wagmi";  // ❌
```

### UI Components

```typescript
// CORRECT — always use @scaffold-ui/components for web3 UI
import { Address, AddressInput, Balance, EtherInput } from "@scaffold-eth/ui-components";

// Address: shows ENS-resolved address with blockie + explorer link
<Address address="0x..." />

// EtherInput: number input with ETH/USD toggle
<EtherInput value={amount} onChange={setAmount} />
```

### Styling

```tsx
// CORRECT — DaisyUI components
<button className="btn btn-primary">Submit</button>
<div className="card bg-base-100 shadow-xl p-6">...</div>
<span className="badge badge-warning">COMMIT</span>
<span className="loading loading-spinner" />
<div className="alert alert-success">Settled!</div>

// AVOID — raw Tailwind when DaisyUI has a component
<button className="px-4 py-2 bg-blue-500 rounded text-white">Submit</button>  // ❌
```

### Notifications

```typescript
import { notification } from "~~/utils/scaffold-eth";
notification.success("Bid committed!");
notification.error("Transaction failed");
notification.warning("Check your salt backup");
```

### Path Alias

```typescript
// ALWAYS use ~~ alias for nextjs package imports
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { db } from "~~/db";
import { notification } from "~~/utils/scaffold-eth";
```

### Page Format

```tsx
import type { NextPage } from "next";

const MyPage: NextPage = () => {
  return <div>...</div>;
};

export default MyPage;
```

### "use client" Boundary

Files with `"use client"` directive must NEVER import:
- `ethers` (v5 or v6)
- `@umbracash/umbra-js`
- Any `services/bitgo.ts`, `services/umbra.ts`, `services/contract.ts`
- Any Neon/Drizzle DB imports

These are server-only. Use them only in API routes (`app/api/`) or server components.

### Contract Address Sources

- `packages/nextjs/contracts/deployedContracts.ts` — auto-generated by `yarn deploy`, contains ABI + address for `DarkAuction` and `DarkToken`
- `packages/nextjs/contracts/externalContracts.ts` — manually maintained, for external/pre-deployed contracts

---

## 16. Repo File Structure

```
dark-auction/                                # SE2 project root
├── AGENTS.md                                # SE2 rules — must read before any work
├── PLAN-1-CONTRACTS.md                      # Person 1 plan
├── PLAN-2-BACKEND.md                        # Person 2 plan
├── PLAN-3-FRONTEND.md                       # Person 3 plan
├── PLAN-4-INTEGRATIONS.md                   # Person 4 plan
├── deployed.json                            # ← Person 1 creates after deploy (team unblocks here)
├── package.json                             # root — has resolutions fix for @uniswap/sdk-core
│
├── packages/
│   ├── foundry/                             # Person 1 owns entirely
│   │   ├── contracts/
│   │   │   ├── DarkToken.sol               # ERC20 + Ownable, 1M DARK to deployer
│   │   │   └── DarkAuction.sol             # Core auction contract
│   │   ├── script/
│   │   │   └── Deploy.s.sol                # Deploys both contracts
│   │   ├── test/
│   │   │   └── DarkAuction.t.sol           # 13 test scenarios
│   │   └── foundry.toml                    # Has baseSepolia RPC configured
│   │
│   └── nextjs/                             # Persons 2/3/4 own different subdirs
│       ├── scaffold.config.ts              # ✅ Updated: targetNetworks=[baseSepolia], pollingInterval=3000
│       │
│       ├── app/                            # Person 3 owns pages; Person 2 owns api/
│       │   ├── page.tsx                    # Home — auction list
│       │   ├── auction/
│       │   │   ├── create/page.tsx         # Create auction form
│       │   │   └── [id]/page.tsx           # Auction detail — commit/reveal/settle
│       │   ├── profile/page.tsx            # Stealth key registration + announcements
│       │   ├── layout.tsx                  # Person 4 adds nav here
│       │   └── api/                        # Person 2 owns
│       │       ├── auction/
│       │       │   ├── create/route.ts
│       │       │   └── [id]/
│       │       │       ├── deposit/route.ts
│       │       │       ├── status/route.ts
│       │       │       └── settle/route.ts
│       │       ├── webhook/
│       │       │   └── bitgo/route.ts
│       │       └── stealth/
│       │           ├── register/route.ts
│       │           └── announcements/route.ts
│       │
│       ├── db/                             # Person 2 owns
│       │   ├── index.ts                    # Drizzle + Neon client
│       │   └── schema.ts                   # 4 tables
│       │
│       ├── services/                       # Person 2 owns (except fileverse.ts)
│       │   ├── bitgo.ts                    # BitGo wallet + deposit + sendMany
│       │   ├── umbra.ts                    # Stealth address derivation (server-only)
│       │   ├── contract.ts                 # ethers v5 contract calls (server-only)
│       │   └── fileverse.ts                # Person 4 — NaCl encrypt/decrypt (client-safe)
│       │
│       ├── hooks/                          # Person 4 owns
│       │   ├── useStealthKeys.ts
│       │   ├── useAuctionPhase.ts
│       │   ├── useBidCommit.ts
│       │   └── useBitGoDeposit.ts
│       │
│       ├── components/
│       │   ├── fileverse/
│       │   │   └── FileverseDocViewer.tsx  # Person 4
│       │   └── ens/
│       │       └── ENSSellerName.tsx       # Person 4
│       │
│       ├── contracts/
│       │   ├── deployedContracts.ts        # Auto-generated by yarn deploy — do not edit manually
│       │   └── externalContracts.ts        # Person 3 updates after Person 1 deploys
│       │
│       └── types/
│           └── auction.ts                  # Person 4 — AuctionPhase enum + hook return types
```

---

## 17. Dependency Notes & Gotchas

### `@umbracash/umbra-js` v0.2.2

- Uses **ethers v5** internally — if you accidentally import ethers v6, it will break
- **Never import in browser/client code** — it uses Node.js crypto APIs not available in browsers
- The Umbra StealthKeyRegistry contract is **not deployed on Base Sepolia** — this is fine because we only use the package for pure elliptic curve math (ECDH key derivation)
- Install only in `packages/nextjs` as a non-public dependency (no `NEXT_PUBLIC_` usage)

### `ethers@^5.7.2`

- Needed by umbra-js — install as a regular dep in `packages/nextjs`
- **Server-side only** — never import in `"use client"` files
- Do not upgrade to ethers v6 — umbra-js will break

### `@bitgo/sdk-*`

- BitGo test portal: `https://app.bitgo-test.com` (not `app.bitgo.com`)
- Test OTP is always `"0000000"`
- Coin identifier for Base Sepolia on BitGo test: `tbaseeth`
- BitGo cannot custody arbitrary ERC-20 tokens — this is why the contract holds seller tokens, not BitGo
- For webhook testing locally: `ngrok http 3000` + update webhook URL in BitGo admin

### Yarn workspaces resolution fix

The following was added to root `package.json` to fix a broken transitive dep:

```json
"resolutions": {
  "@uniswap/sdk-core": "7.12.2"
}
```

Without this, `yarn install` fails with: `@uniswap/sdk-core@workspace:*: Workspace not found`

### Foundry version requirement

SE2 Foundry flavor requires Foundry `>=1.4.0`. The system had `1.3.5` which failed — manually upgraded to **Foundry 1.5.1**.

### `create-eth@latest` behavior

- Does NOT accept a `-n <name>` flag — project name is piped via stdin
- Correct invocation: `printf "dark-auction\n" | npx create-eth@latest -s foundry --skip-install`
- Cloning the SE2 repo directly gives the Hardhat flavor, not Foundry — must use `create-eth` CLI

### `scaffold.config.ts` — pollingInterval

For L2 chains (like Base Sepolia), decrease polling interval. Already set to `3000ms`. The `chains.foundry` default has been replaced with `chains.baseSepolia`.

### `foundry.toml` — Base Sepolia RPC

Already present in the SE2 scaffold:
```toml
baseSepolia = "https://sepolia.base.org"
```

No modification needed.

### viem vs ethers for commit hash

The commit hash must be computed identically on both client (viem) and contract (Solidity). Use:

```typescript
// Client (viem)
keccak256(encodePacked(["uint256", "bytes32"], [amount, salt]))

// Solidity
keccak256(abi.encodePacked(bidAmount, salt))
```

These are equivalent. Do not use `abi.encode` (pads to 32 bytes per param with `abi.encode`; `abi.encodePacked` does not).

---

## 18. Scaffold Setup History

Recorded here so nobody repeats failed approaches.

| Step | What Happened |
|---|---|
| Attempted `create-eth -n dark-auction` | Failed — `-n` flag does not exist in `create-eth@2.0.10` |
| Cloned SE2 repo directly | Got Hardhat flavor, not Foundry |
| Correct command: `printf "dark-auction\n" \| npx create-eth@latest -s foundry --skip-install` | ✅ Worked — Foundry flavor scaffolded |
| `yarn install` failed: `@uniswap/sdk-core@workspace:*: Workspace not found` | Added `resolutions` override to root `package.json` |
| `yarn install` failed: Foundry version too old | User upgraded Foundry from 1.3.5 → 1.5.1 |
| `yarn install` | ✅ Completed with warnings in ~69s |
| `scaffold.config.ts` updated | `chains.foundry` → `chains.baseSepolia`, pollingInterval already 3000 |

---

## 19. Key Commands Reference

```bash
# From dark-auction/ root unless noted

# Development
yarn chain                         # Start local Anvil chain (not used — we target Base Sepolia)
yarn start                         # Start Next.js dev server at http://localhost:3000
yarn compile                       # Compile Solidity contracts

# Testing
yarn foundry:test                  # Run all Forge tests
cd packages/foundry && forge test --match-test test_Settle -vvv   # Single test verbose

# Deployment
yarn generate                      # Generate new deployer keypair
yarn account:import                # Import existing private key
yarn account                       # View current deployer address + balance
yarn deploy --network baseSepolia  # Deploy contracts → auto-generates deployedContracts.ts
yarn verify --network baseSepolia  # Verify contracts on Base Sepolia explorer

# Database
cd packages/nextjs && npx drizzle-kit push    # Push schema to Neon (no migration files)

# Frontend
yarn next:build                    # Build Next.js for production
yarn vercel:yolo --prod            # Deploy to Vercel (ignores build errors)

# Code quality
yarn lint                          # Lint both packages
yarn format                        # Format both packages
```

---

## 20. Deployment Checklist

### Pre-deploy (Person 1)
- [ ] `DarkToken.sol` and `DarkAuction.sol` written and compiling
- [ ] `DarkAuction.t.sol` all 13 tests passing (`yarn foundry:test`)
- [ ] Deployer account funded with Base Sepolia ETH from https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
- [ ] `PRIVATE_KEY` set in `packages/foundry/.env`
- [ ] `yarn deploy --network baseSepolia` succeeds
- [ ] `deployed.json` created and shared with team
- [ ] `yarn verify --network baseSepolia` succeeds (for judges to inspect)

### Pre-deploy (Person 2)
- [ ] Neon DB project created, `DATABASE_URL` working
- [ ] `npx drizzle-kit push` — all 4 tables created
- [ ] BitGo test account registered at `app.bitgo-test.com`
- [ ] `BITGO_ACCESS_TOKEN` and `BITGO_ENTERPRISE_ID` in `.env.local`
- [ ] `DARKAUCTION_CONTRACT_ADDRESS` updated after Person 1 deploys
- [ ] BitGo webhook configured to `<vercel-url>/api/webhook/bitgo`
- [ ] All API routes tested (use `curl` or Postman)

### Pre-deploy (Person 3)
- [ ] `externalContracts.ts` updated with deployed addresses
- [ ] All 4 pages rendering without errors
- [ ] `useBidCommit` commit hash computation verified correct vs contract

### Pre-deploy (Person 4)
- [ ] All 4 hooks implemented and exported
- [ ] `types/auction.ts` committed
- [ ] `FileverseDocViewer` and `ENSSellerName` components tested
- [ ] All Vercel env vars set in dashboard

### Final Vercel Deploy (Person 4)
```bash
yarn vercel:yolo --prod
```

### Judging Demo Script
1. Connect wallet (MetaMask on Base Sepolia)
2. Navigate to `/profile` → register stealth keys (sign message)
3. Create an auction on `/auction/create` (DARK token)
4. Show BitGo deposit address on auction detail
5. Commit a bid (show commit hash, localStorage salt)
6. Warp/wait to reveal phase → reveal bid
7. Trigger settlement → show stealth addresses receiving funds
8. Show Base Sepolia explorer: tokens sent to stealth address
9. Show BitGo test dashboard: ETH sent via `sendMany`
10. Show `/profile` announcements: ephemeral keys for stealth scanning
11. Show seller's ENS text record `darkauction.0` in ENS app (if set)
12. Show Fileverse encrypted doc (if attached to auction)
