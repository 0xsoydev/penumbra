/**
 * Penumbra Auction — End-to-End Test Script
 *
 * This script runs the complete auction flow:
 *   1. Seller approves + creates auction on-chain
 *   2. Backend sets up BitGo wallet
 *   3. Bidder gets deposit address
 *   4. Bidder deposits ETH (manual step)
 *   5. Bidder commits bid
 *   6. Wait for commit phase to end
 *   7. Bidder reveals bid
 *   8. Wait for reveal phase to end
 *   9. Backend settles auction (stealth addresses + on-chain + BitGo)
 *  10. Verify results
 *
 * Prerequisites:
 *   - Server running: yarn start (in another terminal)
 *   - DEPLOYER_PRIVATE_KEY in .env.local (has PNBR tokens)
 *   - BIDDER_PRIVATE_KEY in .env.local (has Base Sepolia ETH)
 *   - Both addresses registered with stealth keys via /api/stealth/register
 *
 * Usage:
 *   cd packages/nextjs
 *   npx tsx scripts/test-auction-flow.ts
 */
import * as crypto from "crypto";
import * as dotenv from "dotenv";
import { ethers } from "ethers";
import * as path from "path";

// Load .env.local from the nextjs package root
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ----------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------

const SELLER_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const BIDDER_KEY = process.env.BIDDER_PRIVATE_KEY || "";
const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

const TOKEN_ADDRESS = "0x5dfbd7e43d207f3c1c67e5d81a28593bec0981e7";
const AUCTION_ADDRESS = "0xDFa35B4e287a91468e0308F8475ADf11E5e59A5e";

const TOKEN_AMOUNT = ethers.utils.parseEther("1000");
const MIN_BID = ethers.utils.parseEther("0.001");
const BID_AMOUNT = ethers.utils.parseEther("0.002");

const COMMIT_DURATION = 90;
const REVEAL_DURATION = 90;
const API_BASE = "http://localhost:3000";

// ----------------------------------------------------------------
// ABIs (minimal, extracted from deployedContracts.ts)
// ----------------------------------------------------------------

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
];

const AUCTION_ABI = [
  "function nextAuctionId() external view returns (uint256)",
  "function createAuction(address tokenAddress, uint256 tokenAmount, uint256 minimumBid, uint256 commitDuration, uint256 revealDuration) external returns (uint256)",
  "function commitBid(uint256 auctionId, bytes32 commitHash) external",
  "function revealBid(uint256 auctionId, uint256 bidAmount, bytes32 salt) external",
  "function getAuction(uint256 auctionId) external view returns (tuple(address seller, address tokenAddress, uint256 tokenAmount, uint256 minimumBid, uint256 commitDeadline, uint256 revealDeadline, address winner, uint256 winningBid, address winnerStealthAddress, bool settled, bool cancelled))",
  "function getAuctionPhase(uint256 auctionId) external view returns (uint8)",
];

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
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
  if (!res.ok) {
    throw new Error(`API error: ${JSON.stringify(data)}`);
  }
  return data;
}

async function apiGet(path: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`);
  return res.json();
}

// ----------------------------------------------------------------
// Main
// ----------------------------------------------------------------

async function main() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║          PENUMBRA AUCTION — END-TO-END TEST                ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("\n");

  if (!SELLER_KEY || SELLER_KEY === "0x") {
    console.error("ERROR: DEPLOYER_PRIVATE_KEY not set in .env.local");
    process.exit(1);
  }
  if (!BIDDER_KEY || BIDDER_KEY === "0x") {
    console.error("ERROR: BIDDER_PRIVATE_KEY not set in .env.local");
    process.exit(1);
  }

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const seller = new ethers.Wallet(SELLER_KEY, provider);
  const bidder = new ethers.Wallet(BIDDER_KEY, provider);

  const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);
  const auction = new ethers.Contract(AUCTION_ADDRESS, AUCTION_ABI, provider);

  const tokenSymbol = await token.symbol();
  const tokenDecimals = await token.decimals();

  log("Addresses:");
  log(`  Seller:  ${seller.address}`);
  log(`  Bidder:  ${bidder.address}`);
  log(`  Token:   ${TOKEN_ADDRESS} (${tokenSymbol})`);
  log(`  Auction: ${AUCTION_ADDRESS}`);
  separator();

  // --- STEP 0: Check balances ---
  log("STEP 0: Checking balances...");
  const sellerBalance = await token.balanceOf(seller.address);
  const bidderBalance = await provider.getBalance(bidder.address);

  log(`  Seller ${tokenSymbol}: ${ethers.utils.formatUnits(sellerBalance, tokenDecimals)}`);
  log(`  Bidder ETH: ${ethers.utils.formatEther(bidderBalance)}`);

  if (sellerBalance.lt(TOKEN_AMOUNT)) {
    console.error(
      `ERROR: Seller doesn't have enough ${tokenSymbol}. Need ${ethers.utils.formatUnits(TOKEN_AMOUNT, tokenDecimals)}`,
    );
    process.exit(1);
  }
  if (bidderBalance.lt(BID_AMOUNT)) {
    console.error(`ERROR: Bidder doesn't have enough ETH. Need ${ethers.utils.formatEther(BID_AMOUNT)}`);
    process.exit(1);
  }

  const bidderMinGas = ethers.utils.parseEther("0.001");
  if (bidderBalance.lt(BID_AMOUNT.add(bidderMinGas))) {
    console.error(
      `ERROR: Bidder needs ETH for gas too. Have ${ethers.utils.formatEther(bidderBalance)}, need ~${ethers.utils.formatEther(BID_AMOUNT.add(bidderMinGas))}`,
    );
    process.exit(1);
  }

  log("  Balances OK");
  separator();

  // --- STEP 0b: Auto-register stealth keys ---
  log("STEP 0b: Registering stealth keys...");
  for (const [label, address, privKey] of [
    ["Seller", seller.address, SELLER_KEY],
    ["Bidder", bidder.address, BIDDER_KEY],
  ] as [string, string, string][]) {
    // Derive spending and viewing private keys deterministically
    const spendingPrivKey = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("dark-auction-spending:" + privKey));
    const viewingPrivKey = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("dark-auction-viewing:" + privKey));
    // Get uncompressed public keys (0x04 + 128 hex chars)
    const spendingPublicKey = ethers.utils.computePublicKey(spendingPrivKey, false);
    const viewingPublicKey = ethers.utils.computePublicKey(viewingPrivKey, false);

    log(`  ${label} spending pubkey: ${spendingPublicKey.slice(0, 20)}...`);
    log(`  ${label} viewing pubkey:  ${viewingPublicKey.slice(0, 20)}...`);

    try {
      await apiPost("/api/stealth/register", {
        address,
        spendingPublicKey,
        viewingPublicKey,
      });
      log(`  ${label} stealth keys registered`);
    } catch (e: any) {
      // If already registered, that's fine
      if (e.message?.includes("already") || e.message?.includes("duplicate") || e.message?.includes("unique")) {
        log(`  ${label} stealth keys already registered (OK)`);
      } else {
        log(`  Warning: ${e.message}`);
      }
    }
  }
  separator();

  // --- STEP 1: Approve tokens ---
  log("STEP 1: Approving tokens...");
  const currentAllowance = await token.allowance(seller.address, AUCTION_ADDRESS);
  if (currentAllowance.gte(TOKEN_AMOUNT)) {
    log("  Already approved");
  } else {
    const approveTx = await token.connect(seller).approve(AUCTION_ADDRESS, TOKEN_AMOUNT);
    log(`  Tx: ${approveTx.hash}`);
    await approveTx.wait();
    log("  Approved");
  }
  separator();

  // --- STEP 2: Create auction ---
  log("STEP 2: Creating auction...");
  const nextIdBefore = await auction.nextAuctionId();
  log(`  Next auction ID will be: ${nextIdBefore}`);

  const createTx = await auction
    .connect(seller)
    .createAuction(TOKEN_ADDRESS, TOKEN_AMOUNT, MIN_BID, COMMIT_DURATION, REVEAL_DURATION);
  log(`  Tx: ${createTx.hash}`);
  await createTx.wait();
  log("  Auction created");

  const auctionId = nextIdBefore.toNumber();
  log(`  Auction ID: ${auctionId}`);
  separator();

  // --- STEP 3: Backend setup ---
  log("STEP 3: Setting up BitGo wallet via API...");
  let feeAddress = "";
  let baseAddress = "";
  try {
    const createRes = await apiPost("/api/auction/create", {
      auctionId,
      sellerAddress: seller.address,
    });
    log(`  BitGo Wallet ID: ${createRes.auction?.bitgoWalletId || "N/A"}`);
    log(`  Wallet Address: ${createRes.auction?.bitgoWalletAddress || "N/A"}`);
    feeAddress = createRes.auction?.feeAddress || "";
    baseAddress = createRes.auction?.baseAddress || "";
    log(`  Fee Address: ${feeAddress || "N/A"}`);
    log(`  Base Address: ${baseAddress || "N/A"}`);
  } catch (e: any) {
    log(`  Warning: ${e.message}`);
    log("  Continuing anyway (wallet might already exist)");
  }
  separator();

  // --- STEP 3b: Fund BitGo fee address + base address ---
  log("STEP 3b: Funding BitGo fee + base addresses for gas...");
  const FEE_FUND_AMOUNT = ethers.utils.parseEther("0.005");
  if (feeAddress) {
    const feeTx = await seller.sendTransaction({ to: feeAddress, value: FEE_FUND_AMOUNT });
    log(`  Fee address funded: ${feeTx.hash}`);
    await feeTx.wait();
  } else {
    log("  No fee address returned — skipping fee funding");
  }
  if (baseAddress) {
    const baseTx = await seller.sendTransaction({ to: baseAddress, value: FEE_FUND_AMOUNT });
    log(`  Base address funded: ${baseTx.hash}`);
    await baseTx.wait();
  } else {
    log("  No base address returned — skipping base funding");
  }
  log("  Gas addresses funded");
  separator();

  // --- STEP 4: Get deposit address ---
  log("STEP 4: Getting deposit address for bidder...");
  let depositAddress: string;
  try {
    const depositRes = await apiPost(`/api/auction/${auctionId}/deposit`, {
      bidderAddress: bidder.address,
    });
    depositAddress = depositRes.depositAddress;
    log(`  Deposit Address: ${depositAddress}`);
  } catch (e: any) {
    log(`  Error: ${e.message}`);
    log("  Will use auction's wallet address as fallback");
    depositAddress = "";
  }
  separator();

  // --- STEP 5: Auto ETH deposit ---
  log("STEP 5: Sending ETH deposit from bidder wallet...");
  if (!depositAddress) {
    console.error("ERROR: No deposit address available — cannot auto-deposit");
    process.exit(1);
  }
  const depositTx = await bidder.sendTransaction({
    to: depositAddress,
    value: BID_AMOUNT,
  });
  log(`  Tx: ${depositTx.hash}`);
  await depositTx.wait();
  log(`  Deposited ${ethers.utils.formatEther(BID_AMOUNT)} ETH to ${depositAddress}`);

  // Wait for BitGo to recognize the deposit (takes a few seconds for confirmations)
  log("  Waiting 15s for BitGo to process deposit...");
  await sleep(15000);

  const depositConfirm = await apiGet(`/api/auction/${auctionId}/status?bidder=${bidder.address}`);
  log(`  Deposit status: ${JSON.stringify(depositConfirm)}`);
  separator();

  // --- STEP 6: Commit bid ---
  log("STEP 6: Committing bid...");
  const salt = "0x" + crypto.randomBytes(32).toString("hex");
  const commitHash = ethers.utils.solidityKeccak256(["uint256", "bytes32"], [BID_AMOUNT, salt]);

  log(`  Salt: ${salt}`);
  log(`  Commit Hash: ${commitHash}`);
  log(`  Bid Amount: ${ethers.utils.formatEther(BID_AMOUNT)} ETH`);

  const commitTx = await auction.connect(bidder).commitBid(auctionId, commitHash);
  log(`  Tx: ${commitTx.hash}`);
  await commitTx.wait();
  log("  Committed");
  separator();

  // --- STEP 7: Wait for commit phase ---
  log(`STEP 7: Waiting ${COMMIT_DURATION + 5}s for commit phase to end...`);
  await sleep((COMMIT_DURATION + 5) * 1000);
  log("  Commit phase ended");
  separator();

  // --- STEP 8: Reveal bid ---
  log("STEP 8: Revealing bid...");
  const revealTx = await auction.connect(bidder).revealBid(auctionId, BID_AMOUNT, salt);
  log(`  Tx: ${revealTx.hash}`);
  await revealTx.wait();
  log("  Revealed");
  separator();

  // --- STEP 9: Wait for reveal phase ---
  log(`STEP 9: Waiting ${REVEAL_DURATION + 5}s for reveal phase to end...`);
  await sleep((REVEAL_DURATION + 5) * 1000);
  log("  Reveal phase ended");
  separator();

  // --- STEP 10: Verify auction state ---
  log("STEP 10: Verifying auction state...");
  const auctionData = await auction.getAuction(auctionId);
  log(`  Seller: ${auctionData.seller}`);
  log(`  Winner: ${auctionData.winner}`);
  log(`  Winning Bid: ${ethers.utils.formatEther(auctionData.winningBid)} ETH`);
  log(`  Settled: ${auctionData.settled}`);

  if (auctionData.winner === ethers.constants.AddressZero) {
    log("  ERROR: No winner determined! Cannot settle.");
    process.exit(1);
  }
  separator();

  // --- STEP 11: Check stealth keys ---
  log("STEP 11: Checking stealth key registration...");
  const stealthSeller = await apiGet(`/api/stealth/announcements?recipient=${seller.address}`);
  const stealthBidder = await apiGet(`/api/stealth/announcements?recipient=${bidder.address}`);
  log(`  Seller has announcements: ${stealthSeller.announcements?.length || 0}`);
  log(`  Bidder has announcements: ${stealthBidder.announcements?.length || 0}`);

  if (auctionData.winner.toLowerCase() === bidder.address.toLowerCase()) {
    log("  Bidder is the winner - they need stealth keys registered!");
  }
  separator();

  // --- STEP 12: Settle ---
  log("STEP 12: Settling auction via API...");
  let settleRes: any;
  try {
    settleRes = await apiPost(`/api/auction/${auctionId}/settle`, {});
  } catch (e: any) {
    const errText = e.message || String(e);
    log(`  Error during settle: ${errText}`);

    if (errText.includes("stealth keys")) {
      log("");
      log("  ACTION REQUIRED: Register stealth keys for winner and seller:");
      log("");
      log("  curl -X POST http://localhost:3000/api/stealth/register \\");
      log('    -H "Content-Type: application/json" \\');
      log(`    -d '{"address": "${bidder.address}", "spendingPublicKey": "0x04...", "viewingPublicKey": "0x04..."}'`);
      log("");
      log("  Then re-run settle:");
      log(`  curl -X POST http://localhost:3000/api/auction/${auctionId}/settle`);
    }
    process.exit(1);
  }

  log("");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                    AUCTION SETTLED!                        ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  log("");

  if (settleRes.settlement) {
    log("SETTLEMENT DETAILS:");
    log(`  Auction ID: ${settleRes.settlement.auctionId}`);
    log(`  Winner: ${settleRes.settlement.winner}`);
    log(`  Winning Amount: ${settleRes.settlement.winningAmount} wei`);
    log(`  Winner Stealth Address: ${settleRes.settlement.winnerStealthAddress}`);
    log(`  Seller Stealth Address: ${settleRes.settlement.sellerStealthAddress}`);
    log(`  On-chain Tx: ${settleRes.settlement.onChainTxHash}`);
    log(`  BitGo Tx: ${settleRes.settlement.bitgoTxId}`);
    log(`  Refunded Bidders: ${settleRes.settlement.refundedBidders}`);

    log("");
    log("LINKS:");
    log(`  Basescan: https://sepolia.basescan.org/tx/${settleRes.settlement.onChainTxHash}`);
    log(`  BitGo Portal: https://app.bitgo-test.com`);
  } else {
    log("  Full result:");
    console.log(JSON.stringify(settleRes, null, 2));
  }

  separator();
  log("TEST COMPLETE!");
}

main().catch(e => {
  console.error("\nFATAL ERROR:");
  console.error(e);
  process.exit(1);
});
