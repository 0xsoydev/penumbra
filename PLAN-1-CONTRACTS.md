# PLAN-1-CONTRACTS.md — Person 1: Smart Contracts

## CRITICAL: Read `AGENTS.md` before any work

---

## Shared Project Context

**Project:** DarkAuction — sealed-bid OTC auction platform for illiquid tokens with privacy-preserving settlement.
**Hackathon:** ETHMumbai 2026, ~36-48 hours.
**Stack:** Scaffold-ETH 2 (Foundry flavor), Next.js 14 App Router, Base Sepolia (chain ID 84532).
**Repo root:** `dark-auction/` (SE2 project scaffolded, `yarn install` done).

### Architecture Summary

1. Seller deposits ERC-20 tokens into `DarkAuction.sol`, creates auction.
2. Bidders submit commit hashes on-chain (`keccak256(abi.encodePacked(bidAmount, salt))`), deposit ETH to unique BitGo addresses (handled by backend).
3. BitGo webhooks confirm deposits to backend.
4. Reveal phase: bidders call `revealBid()` on-chain, contract determines highest bid winner.
5. Backend calls `settle()` (owner-only) — contract transfers tokens to winner's stealth address; BitGo sends ETH to seller's stealth address; losers refunded.

### Why hybrid (contract + BitGo)
BitGo cannot handle arbitrary custom ERC-20 tokens — only pre-registered coins. Contract holds the seller's ERC-20 tokens; BitGo holds bidder ETH.

### Bounty Targets
| Bounty | Prize | Owner |
|---|---|---|
| BitGo Privacy | $600 | Person 2 |
| Base Privacy | $200 | **Person 1** (commit-reveal on-chain) |
| ENS Creative | $500+ | Person 4 |
| Fileverse | $600 | Person 4 |
| ETHMumbai Privacy | $250 | Person 2 (Umbra) |
| ETHMumbai DeFi | $250 | **Person 1** |
| ETHMumbai Best Overall | $250 | All |

### Team File Ownership
- **Person 1 (you):** `packages/foundry/` — all contracts, scripts, tests
- **Person 2:** `packages/nextjs/db/`, `services/`, `app/api/`
- **Person 3:** `packages/nextjs/app/` pages and UI components
- **Person 4:** `packages/nextjs/hooks/`, integrations (Fileverse, ENS), deployment

### SE2 Foundry Paths
- Contracts: `packages/foundry/contracts/`
- Scripts: `packages/foundry/script/`
- Tests: `packages/foundry/test/`
- Config: `packages/foundry/foundry.toml`
- After `yarn deploy`, ABIs auto-generated to `packages/nextjs/contracts/deployedContracts.ts`

### Database Schema (Drizzle, Neon Postgres — Person 2 owns)
```typescript
auctions:              { id, sellerAddress, bitgoWalletId, bitgoWalletAddress, ensName, docCid, createdAt }
deposits:              { id, auctionId, bidderAddress, bitgoDepositAddress, amountWei, confirmed }
stealth_keys:          { address, spendingPublicKey, viewingPublicKey }
stealth_announcements: { id, recipientAddress, ephemeralPublicKey, stealthAddress, auctionId }
```

### API Routes (Person 2 owns)
```
POST /api/auction/create
POST /api/auction/[id]/deposit
GET  /api/auction/[id]/status
POST /api/auction/[id]/settle
POST /api/webhook/bitgo
POST /api/stealth/register
GET  /api/stealth/announcements
```

---

## Your Responsibilities

You own **everything in `packages/foundry/`**. You are the **critical path** — the entire team is blocked until you deploy and share `deployed.json`.

### Step 1: Write `DarkToken.sol`

**File:** `packages/foundry/contracts/DarkToken.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DarkToken is ERC20, Ownable {
    constructor(address initialOwner) ERC20("DarkToken", "DARK") Ownable(initialOwner) {
        _mint(initialOwner, 1_000_000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
```

### Step 2: Write `DarkAuction.sol`

**File:** `packages/foundry/contracts/DarkAuction.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DarkAuction is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum AuctionPhase { COMMIT, REVEAL, ENDED, CANCELLED }

    struct Auction {
        address seller;
        address tokenAddress;
        uint256 tokenAmount;
        uint256 minimumBid;
        uint256 commitDeadline;
        uint256 revealDeadline;
        address winner;
        uint256 winningBid;
        address winnerStealthAddress;
        bool settled;
        bool cancelled;
    }

    struct Commit {
        bytes32 commitHash;
        bool revealed;
        uint256 revealedAmount;
    }

    uint256 public nextAuctionId;
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => mapping(address => Commit)) public commits;
    mapping(uint256 => address[]) public auctionBidders;

    event AuctionCreated(uint256 indexed auctionId, address indexed seller, address tokenAddress, uint256 tokenAmount);
    event BidCommitted(uint256 indexed auctionId, address indexed bidder, bytes32 commitHash);
    event BidRevealed(uint256 indexed auctionId, address indexed bidder, uint256 amount);
    event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 winningBid, address stealthAddress);
    event AuctionCancelled(uint256 indexed auctionId);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function createAuction(
        address tokenAddress,
        uint256 tokenAmount,
        uint256 minimumBid,
        uint256 commitDuration,
        uint256 revealDuration
    ) external returns (uint256 auctionId) {
        require(tokenAmount > 0, "Token amount must be > 0");
        require(minimumBid > 0, "Minimum bid must be > 0");
        require(commitDuration > 0, "Commit duration must be > 0");
        require(revealDuration > 0, "Reveal duration must be > 0");

        auctionId = nextAuctionId++;

        IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), tokenAmount);

        auctions[auctionId] = Auction({
            seller: msg.sender,
            tokenAddress: tokenAddress,
            tokenAmount: tokenAmount,
            minimumBid: minimumBid,
            commitDeadline: block.timestamp + commitDuration,
            revealDeadline: block.timestamp + commitDuration + revealDuration,
            winner: address(0),
            winningBid: 0,
            winnerStealthAddress: address(0),
            settled: false,
            cancelled: false
        });

        emit AuctionCreated(auctionId, msg.sender, tokenAddress, tokenAmount);
    }

    function commitBid(uint256 auctionId, bytes32 commitHash) external {
        Auction storage auction = auctions[auctionId];
        require(!auction.cancelled, "Auction cancelled");
        require(block.timestamp <= auction.commitDeadline, "Commit phase ended");
        require(commits[auctionId][msg.sender].commitHash == bytes32(0), "Already committed");

        commits[auctionId][msg.sender] = Commit({
            commitHash: commitHash,
            revealed: false,
            revealedAmount: 0
        });
        auctionBidders[auctionId].push(msg.sender);

        emit BidCommitted(auctionId, msg.sender, commitHash);
    }

    function revealBid(uint256 auctionId, uint256 bidAmount, bytes32 salt) external {
        Auction storage auction = auctions[auctionId];
        require(!auction.cancelled, "Auction cancelled");
        require(block.timestamp > auction.commitDeadline, "Commit phase not ended");
        require(block.timestamp <= auction.revealDeadline, "Reveal phase ended");

        Commit storage commit = commits[auctionId][msg.sender];
        require(commit.commitHash != bytes32(0), "No commit found");
        require(!commit.revealed, "Already revealed");
        require(
            commit.commitHash == keccak256(abi.encodePacked(bidAmount, salt)),
            "Invalid reveal"
        );
        require(bidAmount >= auction.minimumBid, "Below minimum bid");

        commit.revealed = true;
        commit.revealedAmount = bidAmount;

        if (bidAmount > auction.winningBid) {
            auction.winningBid = bidAmount;
            auction.winner = msg.sender;
        }

        emit BidRevealed(auctionId, msg.sender, bidAmount);
    }

    function settle(uint256 auctionId, address winnerStealthAddress) external onlyOwner nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(!auction.cancelled, "Auction cancelled");
        require(!auction.settled, "Already settled");
        require(block.timestamp > auction.revealDeadline, "Reveal phase not ended");
        require(auction.winner != address(0), "No winner");
        require(winnerStealthAddress != address(0), "Invalid stealth address");

        auction.settled = true;
        auction.winnerStealthAddress = winnerStealthAddress;

        IERC20(auction.tokenAddress).safeTransfer(winnerStealthAddress, auction.tokenAmount);

        emit AuctionSettled(auctionId, auction.winner, auction.winningBid, winnerStealthAddress);
    }

    function cancelAuction(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(msg.sender == auction.seller || msg.sender == owner(), "Not authorized");
        require(!auction.settled, "Already settled");
        require(!auction.cancelled, "Already cancelled");

        auction.cancelled = true;

        IERC20(auction.tokenAddress).safeTransfer(auction.seller, auction.tokenAmount);

        emit AuctionCancelled(auctionId);
    }

    function getAuctionPhase(uint256 auctionId) external view returns (AuctionPhase) {
        Auction storage auction = auctions[auctionId];
        if (auction.cancelled) return AuctionPhase.CANCELLED;
        if (block.timestamp <= auction.commitDeadline) return AuctionPhase.COMMIT;
        if (block.timestamp <= auction.revealDeadline) return AuctionPhase.REVEAL;
        return AuctionPhase.ENDED;
    }

    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        return auctions[auctionId];
    }

    function getCommit(uint256 auctionId, address bidder) external view returns (Commit memory) {
        return commits[auctionId][bidder];
    }

    function getAuctionBidders(uint256 auctionId) external view returns (address[] memory) {
        return auctionBidders[auctionId];
    }
}
```

### Step 3: Write Deploy Script

**File:** `packages/foundry/script/Deploy.s.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../contracts/DarkToken.sol";
import "../contracts/DarkAuction.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        DarkToken darkToken = new DarkToken(deployer);
        DarkAuction darkAuction = new DarkAuction(deployer);

        vm.stopBroadcast();

        console.log("DarkToken deployed at:", address(darkToken));
        console.log("DarkAuction deployed at:", address(darkAuction));
    }
}
```

### Step 4: Write Tests

**File:** `packages/foundry/test/DarkAuction.t.sol`

Write tests for all 13 scenarios:

1. `test_CreateAuction_Success` — seller approves + createAuction, verify stored state
2. `test_CreateAuction_RevertsOnZeroAmount` — tokenAmount = 0 reverts
3. `test_CommitBid_Success` — commitBid stores hash, emits event
4. `test_CommitBid_RevertsAfterDeadline` — warp past commitDeadline, expect revert
5. `test_CommitBid_RevertsDuplicate` — same bidder commits twice, expect revert
6. `test_RevealBid_Success` — valid reveal, winner updated
7. `test_RevealBid_RevertsInvalidHash` — wrong amount/salt, expect revert
8. `test_RevealBid_RevertsBelowMinimum` — bidAmount < minimumBid, expect revert
9. `test_RevealBid_MultipleWinnerIsHighest` — 3 bidders, assert correct winner
10. `test_Settle_TransfersTokensToStealth` — settle() transfers tokenAmount to stealthAddress
11. `test_Settle_RevertsIfNoWinner` — no reveals, settle reverts
12. `test_Settle_RevertsIfNotOwner` — non-owner calls settle, reverts
13. `test_CancelAuction_RefundsSeller` — cancel returns tokens to seller

Use `vm.warp()` for time manipulation. Use `deal()` for ETH. Use `vm.startPrank()` for address impersonation.

### Step 5: Verify foundry.toml has Base Sepolia RPC

**File:** `packages/foundry/foundry.toml`

Ensure this section exists:
```toml
[rpc_endpoints]
baseSepolia = "${BASE_SEPOLIA_RPC_URL}"
```

If not present, add it.

### Step 6: Configure deployer account

```bash
# In dark-auction/
yarn generate   # generates a new deployer keypair + saves to packages/foundry/.env
# OR
yarn account:import  # if you have an existing private key
```

Fund the deployer address with Base Sepolia ETH from https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet

### Step 7: Deploy to Base Sepolia

```bash
yarn deploy --network baseSepolia
```

This auto-generates `packages/nextjs/contracts/deployedContracts.ts`.

### Step 8: Publish `deployed.json` (TEAM UNBLOCKS HERE)

Immediately after deploy succeeds, create `dark-auction/deployed.json`:

```json
{
  "network": "baseSepolia",
  "chainId": 84532,
  "DarkToken": "0x<address>",
  "DarkAuction": "0x<address>",
  "deployedAt": "<ISO timestamp>",
  "deployerAddress": "0x<address>"
}
```

Post the addresses in the team chat. Person 2 needs `DARKAUCTION_CONTRACT_ADDRESS`. Person 3 needs both for `externalContracts.ts`.

### Step 9: Verify on Base Sepolia Explorer

```bash
yarn verify --network baseSepolia
```

---

## Working in Parallel

### You are the critical path. Prioritize ruthlessly.

**Do first:** Get contracts deployed. Tests can be written simultaneously — don't let test-writing block deployment.

### Coordination Rules

| Dependency | Who Needs It | When |
|---|---|---|
| `deployed.json` | Person 2 (backend) | Immediately after deploy — they have a TODO placeholder for `DARKAUCTION_CONTRACT_ADDRESS` |
| `deployed.json` | Person 3 (frontend) | To populate `externalContracts.ts` |
| Contract ABI | Person 3 | Auto-generated by `yarn deploy` to `deployedContracts.ts` |
| `AuctionPhase` enum values | Person 3, Person 4 | Share: COMMIT=0, REVEAL=1, ENDED=2, CANCELLED=3 |

### Do NOT touch
- `packages/nextjs/` — owned by Persons 2, 3, 4
- Any existing SE2 scaffold files unless required for deploy config

### Notify team when
- Deploy script is ready (they can review contract interface)
- Deploy succeeds — post `deployed.json` to team chat immediately
- Any function signature changes (Person 3 and 4 depend on these)

### Contract interface is locked after first deploy
If you need to change function signatures after sharing `deployed.json`, notify ALL teammates and redeploy — they will need to update their code.

### Quick commands reference
```bash
# Compile only
yarn compile

# Run tests (local)
yarn foundry:test

# Run specific test
cd packages/foundry && forge test --match-test test_Settle_TransfersTokensToStealth -vvv

# Deploy to Base Sepolia
yarn deploy --network baseSepolia

# Verify contracts
yarn verify --network baseSepolia
```
