import { ethers } from "ethers";

// ----------------------------------------------------------------
// PenumbraAuction contract service — server-side only (ethers v5)
// Deployed on Base Sepolia (ZK-enabled, nullifier-based)
// ----------------------------------------------------------------

const AUCTION_ADDRESS = process.env.DARKAUCTION_CONTRACT_ADDRESS || ethers.constants.AddressZero;
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

// Minimal ABI — only the functions the backend calls.
// Struct order: seller, tokenAddress, tokenAmount, minimumBid,
//   commitDeadline, settleDeadline, winningNullifier, claimed, cancelled
const AUCTION_ABI = [
  // --- Write (owner-only) ---
  "function commitBid(uint256 auctionId, bytes32 nullifier, bytes32 commitHash) external",
  "function declareWinner(uint256 auctionId, bytes32 winningNullifier) external",

  // --- Write (permissionless — winner calls from burner wallet) ---
  "function claimWithProof(uint256 auctionId, bytes proof, address stealthAddress) external",

  // --- Write (seller or owner) ---
  "function cancelAuction(uint256 auctionId) external",

  // --- Read ---
  "function getAuction(uint256 auctionId) external view returns (tuple(address seller, address tokenAddress, uint256 tokenAmount, uint256 minimumBid, uint256 commitDeadline, uint256 settleDeadline, bytes32 winningNullifier, bool claimed, bool cancelled))",
  "function getCommit(uint256 auctionId, bytes32 nullifier) external view returns (tuple(bytes32 commitHash, bool exists))",
  "function getAuctionPhase(uint256 auctionId) external view returns (uint8)",
  "function getCommitCount(uint256 auctionId) external view returns (uint256)",
  "function nextAuctionId() external view returns (uint256)",
  "function usedNullifiers(bytes32) external view returns (bool)",
  "function verifier() external view returns (address)",

  // --- Events ---
  "event AuctionCreated(uint256 indexed auctionId, address indexed seller, address tokenAddress, uint256 tokenAmount)",
  "event BidCommitted(uint256 indexed auctionId, bytes32 indexed nullifier)",
  "event WinnerDeclared(uint256 indexed auctionId, bytes32 indexed winningNullifier)",
  "event AuctionClaimed(uint256 indexed auctionId, address stealthAddress)",
  "event AuctionCancelled(uint256 indexed auctionId)",
];

function getProvider() {
  return new ethers.providers.JsonRpcProvider(RPC_URL);
}

function getReadContract() {
  return new ethers.Contract(AUCTION_ADDRESS, AUCTION_ABI, getProvider());
}

function getWriteContract() {
  if (!DEPLOYER_KEY || DEPLOYER_KEY === "0x") {
    throw new Error("DEPLOYER_PRIVATE_KEY not configured — cannot send transactions");
  }
  const wallet = new ethers.Wallet(DEPLOYER_KEY, getProvider());
  return new ethers.Contract(AUCTION_ADDRESS, AUCTION_ABI, wallet);
}

// ----------------------------------------------------------------
// Types (match on-chain Auction struct)
// ----------------------------------------------------------------

export enum AuctionPhase {
  COMMIT = 0,
  SETTLE = 1,
  ENDED = 2,
  CANCELLED = 3,
}

export type AuctionData = {
  seller: string;
  tokenAddress: string;
  tokenAmount: ethers.BigNumber;
  minimumBid: ethers.BigNumber;
  commitDeadline: ethers.BigNumber;
  settleDeadline: ethers.BigNumber;
  winningNullifier: string; // bytes32 hex
  claimed: boolean;
  cancelled: boolean;
};

export type CommitData = {
  commitHash: string; // bytes32 hex
  exists: boolean;
};

// ----------------------------------------------------------------
// Reads
// ----------------------------------------------------------------

export async function getAuction(auctionId: number): Promise<AuctionData> {
  const contract = getReadContract();
  return contract.getAuction(auctionId);
}

export async function getCommit(auctionId: number, nullifier: string): Promise<CommitData> {
  const contract = getReadContract();
  return contract.getCommit(auctionId, nullifier);
}

export async function getAuctionPhase(auctionId: number): Promise<AuctionPhase> {
  const contract = getReadContract();
  const phase: number = await contract.getAuctionPhase(auctionId);
  return phase as AuctionPhase;
}

export async function getCommitCount(auctionId: number): Promise<number> {
  const contract = getReadContract();
  const count: ethers.BigNumber = await contract.getCommitCount(auctionId);
  return count.toNumber();
}

export async function getNextAuctionId(): Promise<number> {
  const contract = getReadContract();
  const id: ethers.BigNumber = await contract.nextAuctionId();
  return id.toNumber();
}

export async function isNullifierUsed(nullifier: string): Promise<boolean> {
  const contract = getReadContract();
  return contract.usedNullifiers(nullifier);
}

// ----------------------------------------------------------------
// Writes (owner-only — backend relays these transactions)
// ----------------------------------------------------------------

/**
 * Relay a sealed bid commitment on-chain.
 * The backend calls this on behalf of the bidder — the bidder's address
 * never touches the contract. Only the nullifier is recorded.
 *
 * @param auctionId  The auction to bid on
 * @param nullifier  pedersen_hash(secret) — bidder's pseudonymous ID
 * @param commitHash keccak256(abi.encodePacked(bidAmount, salt, nullifier))
 */
export async function commitBidOnChain(auctionId: number, nullifier: string, commitHash: string) {
  const contract = getWriteContract();
  const tx = await contract.commitBid(auctionId, nullifier, commitHash, {
    gasLimit: 200_000,
  });
  return waitForTx(tx);
}

/**
 * Declare the winner after off-chain reveal.
 * Backend has all bid amounts off-chain, verifies commit hashes,
 * determines the highest bid, and posts only the winning nullifier.
 * NO bid amounts are ever posted on-chain.
 */
export async function declareWinner(auctionId: number, winningNullifier: string) {
  const contract = getWriteContract();
  const tx = await contract.declareWinner(auctionId, winningNullifier, {
    gasLimit: 150_000,
  });
  return waitForTx(tx);
}

/**
 * Cancel an auction and return tokens to seller.
 */
export async function cancelAuction(auctionId: number) {
  const contract = getWriteContract();
  const tx = await contract.cancelAuction(auctionId, {
    gasLimit: 200_000,
  });
  return waitForTx(tx);
}

// ----------------------------------------------------------------
// Note: claimWithProof() is NOT called by the backend.
// The winner calls it directly from a burner wallet using a ZK proof.
// The JS-side proof generation lives in zkproof.ts.
// IMPORTANT: claimWithProof uses ~2.6M gas for ZK verification.
//            Set gasLimit to at least 3,000,000 when calling.
// ----------------------------------------------------------------

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

/**
 * Wait for a transaction to be confirmed with retry logic.
 * Works around ethers v5 + Base Sepolia EIP-1559 parsing quirks.
 */
async function waitForTx(tx: ethers.ContractTransaction) {
  let receipt;
  try {
    receipt = await tx.wait();
  } catch (e: any) {
    // tx.wait() can fail with "transaction type not supported" on Base Sepolia
    // due to ethers v5 parsing bugs, but the tx may have landed on-chain.
    console.warn("tx.wait() failed:", e.message, "— retrying via getTransactionReceipt");
    const provider = getProvider();
    let attempts = 0;
    while (attempts < 30) {
      receipt = await provider.getTransactionReceipt(tx.hash);
      if (receipt && receipt.blockNumber) break;
      await new Promise(r => setTimeout(r, 2000));
      attempts++;
    }
    if (!receipt || !receipt.blockNumber) {
      throw new Error(`Transaction ${tx.hash} not confirmed after retries: ${e.message}`);
    }
  }
  return receipt;
}
