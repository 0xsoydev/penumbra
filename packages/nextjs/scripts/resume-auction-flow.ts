/**
 * Resume script — picks up auction 0 from the commit step.
 * The auction was created on-chain and in DB. ETH was deposited.
 * This script commits, waits, reveals, waits, then settles.
 */
import * as crypto from "crypto";
import { ethers } from "ethers";

const BIDDER_KEY = process.env.BIDDER_PRIVATE_KEY || "";
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

const AUCTION_ADDRESS = "0xDFa35B4e287a91468e0308F8475ADf11E5e59A5e";
const AUCTION_ID = 0;
const BID_AMOUNT = ethers.utils.parseEther("0.005");
const COMMIT_DURATION = 60;
const REVEAL_DURATION = 60;
const API_BASE = "http://localhost:3000";

const AUCTION_ABI = [
  "function commitBid(uint256 auctionId, bytes32 commitHash) external",
  "function revealBid(uint256 auctionId, uint256 bidAmount, bytes32 salt) external",
  "function getAuction(uint256 auctionId) external view returns (tuple(address seller, address tokenAddress, uint256 tokenAmount, uint256 minimumBid, uint256 commitDeadline, uint256 revealDeadline, address winner, uint256 winningBid, address winnerStealthAddress, bool settled, bool cancelled))",
  "function getAuctionPhase(uint256 auctionId) external view returns (uint8)",
];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message: string): void {
  console.log(`[${new Date().toISOString().split("T")[1].split(".")[0]}] ${message}`);
}

function separator(): void {
  console.log("─".repeat(60));
}

async function apiPost(path: string, body: object): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`API error: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║        PENUMBRA AUCTION — RESUME FROM COMMIT               ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("\n");

  if (!BIDDER_KEY) {
    console.error("BIDDER_PRIVATE_KEY not set");
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const bidder = new ethers.Wallet(BIDDER_KEY, provider);
  const auction = new ethers.Contract(AUCTION_ADDRESS, AUCTION_ABI, provider);

  log(`Bidder: ${bidder.address}`);
  log(`Auction ID: ${AUCTION_ID}`);

  // Check current phase
  const phase = await auction.getAuctionPhase(AUCTION_ID);
  // 0=NotStarted, 1=Commit, 2=Reveal, 3=Ended
  log(`Current phase: ${phase} (1=Commit, 2=Reveal, 3=Ended)`);
  separator();

  // Check if we still need to commit (phase == 1)
  if (phase.toNumber() > 1) {
    log("Commit phase already passed — skipping commit");
  } else {
    // --- STEP 6: Commit bid ---
    log("STEP 6: Committing bid...");
    const salt = "0x" + crypto.randomBytes(32).toString("hex");
    const commitHash = ethers.utils.solidityKeccak256(["uint256", "bytes32"], [BID_AMOUNT, salt]);

    log(`  Salt: ${salt}`);
    log(`  Commit Hash: ${commitHash}`);
    log(`  Bid Amount: ${ethers.utils.formatEther(BID_AMOUNT)} ETH`);

    // Save salt for reveal — embed it in this run
    (global as any).__salt = salt;

    const commitTx = await auction.connect(bidder).commitBid(AUCTION_ID, commitHash);
    log(`  Tx: ${commitTx.hash}`);
    await commitTx.wait();
    log("  Committed");
    separator();

    // --- STEP 7: Wait for commit phase ---
    log(`STEP 7: Waiting ${COMMIT_DURATION + 10}s for commit phase to end...`);
    await sleep((COMMIT_DURATION + 10) * 1000);
    log("  Commit phase ended");
    separator();

    // --- STEP 8: Reveal bid ---
    log("STEP 8: Revealing bid...");
    const revealTx = await auction.connect(bidder).revealBid(AUCTION_ID, BID_AMOUNT, salt);
    log(`  Tx: ${revealTx.hash}`);
    await revealTx.wait();
    log("  Revealed");
    separator();
  }

  // If already in reveal phase, still need to reveal
  if (phase.toNumber() === 2) {
    log("Currently in reveal phase — but we don't have the salt from a prior run.");
    log("ERROR: Cannot reveal without the salt used during commit.");
    log("This auction is stuck. Need to start a fresh auction.");
    process.exit(1);
  }

  // --- STEP 9: Wait for reveal phase ---
  const currentPhase2 = await auction.getAuctionPhase(AUCTION_ID);
  if (currentPhase2.toNumber() < 3) {
    log(`STEP 9: Waiting for reveal phase to end (current phase: ${currentPhase2})...`);
    await sleep((REVEAL_DURATION + 10) * 1000);
  } else {
    log("STEP 9: Reveal phase already ended");
  }
  separator();

  // --- STEP 10: Verify auction state ---
  log("STEP 10: Verifying auction state...");
  const auctionData = await auction.getAuction(AUCTION_ID);
  log(`  Seller: ${auctionData.seller}`);
  log(`  Winner: ${auctionData.winner}`);
  log(`  Winning Bid: ${ethers.utils.formatEther(auctionData.winningBid)} ETH`);
  log(`  Settled: ${auctionData.settled}`);

  if (auctionData.winner === ethers.constants.AddressZero) {
    log("  ERROR: No winner determined. Reveal phase may not be over yet, or no valid bids.");
    process.exit(1);
  }
  separator();

  // --- STEP 12: Settle ---
  log("STEP 12: Settling auction via API...");
  const settleRes = await apiPost(`/api/auction/${AUCTION_ID}/settle`, {});

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                    AUCTION SETTLED!                        ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  if (settleRes.settlement) {
    log(`  Winner:                ${settleRes.settlement.winner}`);
    log(`  Winning Amount:        ${settleRes.settlement.winningAmount} wei`);
    log(`  Winner Stealth Addr:   ${settleRes.settlement.winnerStealthAddress}`);
    log(`  Seller Stealth Addr:   ${settleRes.settlement.sellerStealthAddress}`);
    log(`  On-chain Tx:           ${settleRes.settlement.onChainTxHash}`);
    log(`  BitGo Tx:              ${settleRes.settlement.bitgoTxId}`);
    log(`  Basescan: https://sepolia.basescan.org/tx/${settleRes.settlement.onChainTxHash}`);
  } else {
    console.log(JSON.stringify(settleRes, null, 2));
  }

  separator();
  log("DONE!");
}

main().catch(e => {
  console.error("\nFATAL ERROR:", e);
  process.exit(1);
});
