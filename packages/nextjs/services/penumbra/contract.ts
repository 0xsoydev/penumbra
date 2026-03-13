import { ethers } from "ethers";

// ----------------------------------------------------------------
// PenumbraAuction contract service — server-side only (ethers v5)
// Deployed on Base Sepolia: packages/foundry/deployments/84532.json
// ----------------------------------------------------------------

const DARKAUCTION_ADDRESS = process.env.DARKAUCTION_CONTRACT_ADDRESS || ethers.constants.AddressZero;
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

// Minimal ABI — only the functions Person 2 backend calls.
// Tuple field order MUST match the on-chain Auction struct exactly:
//   seller, tokenAddress, tokenAmount, minimumBid, commitDeadline,
//   revealDeadline, winner, winningBid, winnerStealthAddress, settled, cancelled
const DARKAUCTION_ABI = [
  // --- Write (only callable by deployer / owner) ---
  "function settle(uint256 auctionId, address winnerStealthAddress) external",
  // --- Read ---
  "function getAuction(uint256 auctionId) external view returns (tuple(address seller, address tokenAddress, uint256 tokenAmount, uint256 minimumBid, uint256 commitDeadline, uint256 revealDeadline, address winner, uint256 winningBid, address winnerStealthAddress, bool settled, bool cancelled))",
  "function getAuctionBidders(uint256 auctionId) external view returns (address[])",
  "function getCommit(uint256 auctionId, address bidder) external view returns (tuple(bytes32 commitHash, bool revealed, uint256 revealedAmount))",
  // --- Events ---
  "event AuctionCreated(uint256 indexed auctionId, address indexed seller, address tokenAddress, uint256 tokenAmount)",
  "event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 winningBid, address stealthAddress)",
];

function getProvider() {
  return new ethers.providers.JsonRpcProvider(RPC_URL);
}

function getReadContract() {
  return new ethers.Contract(DARKAUCTION_ADDRESS, DARKAUCTION_ABI, getProvider());
}

function getWriteContract() {
  if (!DEPLOYER_KEY || DEPLOYER_KEY === "0x") {
    throw new Error("DEPLOYER_PRIVATE_KEY not configured — cannot send transactions");
  }
  const wallet = new ethers.Wallet(DEPLOYER_KEY, getProvider());
  return new ethers.Contract(DARKAUCTION_ADDRESS, DARKAUCTION_ABI, wallet);
}

// ----------------------------------------------------------------
// Reads
// ----------------------------------------------------------------

export type AuctionData = {
  seller: string;
  tokenAddress: string;
  tokenAmount: ethers.BigNumber;
  minimumBid: ethers.BigNumber;
  commitDeadline: ethers.BigNumber;
  revealDeadline: ethers.BigNumber;
  winner: string;
  winningBid: ethers.BigNumber;
  winnerStealthAddress: string;
  settled: boolean;
  cancelled: boolean;
};

export type CommitData = {
  commitHash: string;
  revealed: boolean;
  revealedAmount: ethers.BigNumber;
};

export async function getAuction(auctionId: number): Promise<AuctionData> {
  const contract = getReadContract();
  return contract.getAuction(auctionId);
}

export async function getAuctionBidders(auctionId: number): Promise<string[]> {
  const contract = getReadContract();
  return contract.getAuctionBidders(auctionId);
}

export async function getCommit(auctionId: number, bidder: string): Promise<CommitData> {
  const contract = getReadContract();
  return contract.getCommit(auctionId, bidder);
}

/**
 * Determine the winner: highest revealedAmount among revealed bidders.
 * Returns { winner, amount } or null if no valid reveals.
 */
export async function determineWinner(auctionId: number): Promise<{ winner: string; amount: ethers.BigNumber } | null> {
  const bidders = await getAuctionBidders(auctionId);
  let best: { winner: string; amount: ethers.BigNumber } | null = null;

  for (const bidder of bidders) {
    const commit = await getCommit(auctionId, bidder);
    if (commit.revealed && (!best || commit.revealedAmount.gt(best.amount))) {
      best = { winner: bidder, amount: commit.revealedAmount };
    }
  }
  return best;
}

// ----------------------------------------------------------------
// Writes
// ----------------------------------------------------------------

/**
 * Call settle() on-chain — transfers ERC-20 tokens to winnerStealthAddress.
 * Only callable by the deployer (owner).
 */
export async function settle(auctionId: number, winnerStealthAddress: string) {
  const contract = getWriteContract();
  // Use a fixed gas limit to avoid UNPREDICTABLE_GAS_LIMIT on Base Sepolia
  const tx = await contract.settle(auctionId, winnerStealthAddress, {
    gasLimit: 300_000,
  });
  let receipt;
  try {
    receipt = await tx.wait();
  } catch (e: any) {
    // tx.wait() can fail with "transaction type not supported" on Base Sepolia
    // due to ethers v5 parsing bugs, but the tx may have landed on-chain.
    // Re-fetch the receipt by hash as a fallback.
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
