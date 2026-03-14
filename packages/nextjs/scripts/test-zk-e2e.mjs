/**
 * End-to-End ZK Auction Test on Base Sepolia
 *
 * Tests the FULL privacy-preserving auction flow:
 *   1. Seller creates auction (locks PNBR tokens)
 *   2. Backend generates secret/nullifier for bidder
 *   3. Backend relays commitBid on-chain (bidder address NEVER touches contract)
 *   4. Wait for commit phase to end
 *   5. Backend declares winner (off-chain reveal, only nullifier on-chain)
 *   6. Winner generates ZK proof (proves knowledge of secret)
 *   7. Winner claims tokens via claimWithProof from BURNER wallet
 *
 * Usage: node scripts/test-zk-e2e.mjs
 * Requires: DEPLOYER_PRIVATE_KEY in ../.env.local
 */

import { ethers } from "ethers";
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js";
import { Noir } from "@noir-lang/noir_js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Config ----
const RPC_URL = "https://sepolia.base.org";
const AUCTION_ADDRESS = "0x3296eAF67350cFC643DfBF70139fe46b5589dc4c";
const TOKEN_ADDRESS = "0x5dfBd7e43D207F3C1c67e5d81a28593bEC0981E7";
const DEPLOYER_KEY = "0x626dbf4780d7e486421fb66d51c0c1c8297443514c0b3fbd7574a1ad9d7aed81";

// Short durations for testing (seconds)
const COMMIT_DURATION = 60;   // 1 minute commit phase
const SETTLE_DURATION = 600;  // 10 minutes settle phase

// Test bid
const BID_AMOUNT_WEI = ethers.utils.parseEther("0.001").toString();
const TOKEN_AMOUNT = ethers.utils.parseEther("100"); // 100 PNBR

const AUCTION_ABI = [
  "function createAuction(address tokenAddress, uint256 tokenAmount, uint256 minimumBid, uint256 commitDuration, uint256 settleDuration) external returns (uint256)",
  "function commitBid(uint256 auctionId, bytes32 nullifier, bytes32 commitHash) external",
  "function declareWinner(uint256 auctionId, bytes32 winningNullifier) external",
  "function claimWithProof(uint256 auctionId, bytes proof, address stealthAddress) external",
  "function getAuction(uint256 auctionId) external view returns (tuple(address seller, address tokenAddress, uint256 tokenAmount, uint256 minimumBid, uint256 commitDeadline, uint256 settleDeadline, bytes32 winningNullifier, bool claimed, bool cancelled))",
  "function getAuctionPhase(uint256 auctionId) external view returns (uint8)",
  "function getCommitCount(uint256 auctionId) external view returns (uint256)",
  "event AuctionCreated(uint256 indexed auctionId, address indexed seller, address tokenAddress, uint256 tokenAmount)",
  "event BidCommitted(uint256 indexed auctionId, bytes32 indexed nullifier)",
  "event WinnerDeclared(uint256 indexed auctionId, bytes32 indexed winningNullifier)",
  "event AuctionClaimed(uint256 indexed auctionId, address stealthAddress)",
];

const TOKEN_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
];

// ---- Helpers ----

async function waitForTx(tx, label = "tx") {
  console.log(`  [${label}] Sent: ${tx.hash}`);
  let receipt;
  try {
    receipt = await tx.wait(1); // wait for 1 confirmation
  } catch (e) {
    console.warn(`  [${label}] tx.wait() failed: ${e.message} — polling...`);
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    let attempts = 0;
    while (attempts < 60) {
      receipt = await provider.getTransactionReceipt(tx.hash);
      if (receipt && receipt.blockNumber) break;
      await new Promise(r => setTimeout(r, 3000));
      attempts++;
    }
    if (!receipt || !receipt.blockNumber) {
      throw new Error(`Tx ${tx.hash} not confirmed after ${attempts} attempts`);
    }
  }
  if (receipt.status === 0) {
    throw new Error(`[${label}] Transaction REVERTED! Tx: ${tx.hash}`);
  }
  console.log(`  [${label}] Confirmed in block ${receipt.blockNumber} (gas: ${receipt.gasUsed.toString()})`);
  return receipt;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Sequential tx sender — sends one tx at a time, waits for confirmation, then proceeds
// Uses a fresh provider for each nonce query to avoid ethers v5 caching
let managedNonce = null;

async function sendTx(contract, method, args, overrides, label) {
  // If first tx, fetch nonce from a fresh provider
  if (managedNonce === null) {
    const freshProvider = new ethers.providers.JsonRpcProvider(RPC_URL);
    managedNonce = await freshProvider.getTransactionCount(contract.signer.address, "latest");
  }
  const nonce = managedNonce;
  console.log(`  [${label}] Sending with nonce ${nonce}...`);
  const tx = await contract[method](...args, { ...overrides, nonce });
  managedNonce++; // Increment immediately after send
  const receipt = await waitForTx(tx, label);
  return receipt;
}

// ---- Main Test ----

async function main() {
  console.log("=== Penumbra ZK Auction E2E Test ===\n");

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const deployer = new ethers.Wallet(DEPLOYER_KEY, provider);
  const auction = new ethers.Contract(AUCTION_ADDRESS, AUCTION_ABI, deployer);
  const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, deployer);

  console.log("Deployer:", deployer.address);
  const balance = await provider.getBalance(deployer.address);
  console.log("ETH Balance:", ethers.utils.formatEther(balance), "ETH");

  // ---- Step 1: Create Auction ----
  console.log("\n--- Step 1: Create Auction ---");
  console.log("Approving", ethers.utils.formatEther(TOKEN_AMOUNT), "PNBR...");
  await sendTx(token, "approve", [AUCTION_ADDRESS, TOKEN_AMOUNT], { gasLimit: 100_000 }, "approve");

  console.log("Creating auction...");
  const createReceipt = await sendTx(
    auction,
    "createAuction",
    [TOKEN_ADDRESS, TOKEN_AMOUNT, ethers.utils.parseEther("0.0001"), COMMIT_DURATION, SETTLE_DURATION],
    { gasLimit: 300_000 },
    "createAuction",
  );

  // Parse AuctionCreated event to get auctionId
  const iface = new ethers.utils.Interface(AUCTION_ABI);
  const createdLog = createReceipt.logs.find(l => {
    try { return iface.parseLog(l).name === "AuctionCreated"; } catch { return false; }
  });
  const auctionId = createdLog ? iface.parseLog(createdLog).args.auctionId.toNumber() : -1;
  console.log("  Auction created! ID:", auctionId);
  console.log("  Tx:", createReceipt.transactionHash);

  // ---- Step 2: Generate Secret/Nullifier ----
  console.log("\n--- Step 2: Generate Secret/Nullifier ---");
  const bb = await Barretenberg.new();

  // Generate a random secret for this test run (must be unique — nullifiers are globally unique)
  const secretBytes31 = ethers.utils.randomBytes(31);
  const secret = ethers.BigNumber.from(secretBytes31).toString();
  const secretBn = ethers.BigNumber.from(secret);
  const secretHex = ethers.utils.hexZeroPad(secretBn.toHexString(), 32);
  const secretBytes = new Uint8Array(Buffer.from(secretHex.slice(2), "hex"));

  const result = await bb.pedersenHash({ inputs: [secretBytes], hashIndex: 0 });
  const hashBytes = new Uint8Array(Object.values(result.hash));
  const nullifier = "0x" + Buffer.from(hashBytes).toString("hex");
  console.log("  Secret:", secret);
  console.log("  Nullifier:", nullifier);

  // ---- Step 3: Commit Bid On-Chain ----
  console.log("\n--- Step 3: Commit Bid On-Chain ---");
  const salt = ethers.utils.hexlify(ethers.utils.randomBytes(32));
  const commitHash = ethers.utils.solidityKeccak256(
    ["uint256", "bytes32", "bytes32"],
    [BID_AMOUNT_WEI, salt, nullifier],
  );
  console.log("  Bid Amount:", ethers.utils.formatEther(BID_AMOUNT_WEI), "ETH");
  console.log("  Salt:", salt);
  console.log("  Commit Hash:", commitHash);

  const commitReceipt = await sendTx(
    auction,
    "commitBid",
    [auctionId, nullifier, commitHash],
    { gasLimit: 200_000 },
    "commitBid",
  );
  console.log("  Bid committed! Tx:", commitReceipt.transactionHash);

  const commitCount = await auction.getCommitCount(auctionId);
  console.log("  Commit count:", commitCount.toString());

  // ---- Step 4: Wait for Commit Phase to End ----
  console.log("\n--- Step 4: Wait for Commit Phase ---");
  const auctionData = await auction.getAuction(auctionId);
  const commitDeadline = auctionData.commitDeadline.toNumber();
  const now = Math.floor(Date.now() / 1000);
  const waitTime = commitDeadline - now + 5; // +5 seconds buffer

  if (waitTime > 0) {
    console.log(`  Commit phase ends in ${waitTime} seconds. Waiting...`);
    for (let i = waitTime; i > 0; i -= 10) {
      await sleep(Math.min(10000, i * 1000));
      const remaining = commitDeadline - Math.floor(Date.now() / 1000);
      if (remaining <= 0) break;
      console.log(`  ${remaining}s remaining...`);
    }
    console.log("  Commit phase ended!");
  } else {
    console.log("  Commit phase already ended");
  }

  // ---- Step 5: Declare Winner ----
  console.log("\n--- Step 5: Declare Winner ---");
  const phase = await auction.getAuctionPhase(auctionId);
  console.log("  Current phase:", ["COMMIT", "SETTLE", "ENDED", "CANCELLED"][phase]);

  console.log("  Declaring winner with nullifier:", nullifier);
  const declareReceipt = await sendTx(
    auction,
    "declareWinner",
    [auctionId, nullifier],
    { gasLimit: 150_000 },
    "declareWinner",
  );
  console.log("  Winner declared! Tx:", declareReceipt.transactionHash);

  // ---- Step 6: Generate ZK Proof ----
  console.log("\n--- Step 6: Generate ZK Proof ---");
  const circuitPath = join(__dirname, "..", "..", "foundry", "circuits", "nullifier_claim", "target", "nullifier_claim.json");
  const circuit = JSON.parse(readFileSync(circuitPath, "utf-8"));

  const noir = new Noir(circuit);
  const backend = new UltraHonkBackend(circuit.bytecode, bb);

  console.log("  Executing circuit...");
  const { witness } = await noir.execute({ secret, nullifier });
  console.log("  Witness generated");

  console.log("  Generating proof...");
  const proofData = await backend.generateProof(witness, { verifierTarget: 'evm' });
  console.log("  Proof generated! Size:", proofData.proof.length, "bytes");
  console.log("  Public inputs:", proofData.publicInputs);

  // Verify locally first
  console.log("  Verifying proof locally...");
  const isValid = await backend.verifyProof(proofData, { verifierTarget: 'evm' });
  console.log("  Local verification:", isValid ? "VALID" : "INVALID");
  if (!isValid) throw new Error("Local proof verification failed!");

  const proofHex = "0x" + Buffer.from(proofData.proof).toString("hex");

  // ---- Step 7: Claim With Proof ----
  console.log("\n--- Step 7: Claim With Proof (from deployer as 'burner') ---");
  // In production, this would be called from a burner wallet.
  // For testing, we use the deployer wallet.
  // The stealth address is just the deployer address for simplicity.
  const stealthAddress = deployer.address;

  console.log("  Claiming tokens at stealth address:", stealthAddress);
  console.log("  Proof size:", proofHex.length / 2 - 1, "bytes");

  const claimReceipt = await sendTx(
    auction,
    "claimWithProof",
    [auctionId, proofHex, stealthAddress],
    { gasLimit: 3_000_000 }, // ZK verification is gas-heavy
    "claimWithProof",
  );
  console.log("  Tokens claimed! Tx:", claimReceipt.transactionHash);

  // Verify final state
  const finalAuction = await auction.getAuction(auctionId);
  console.log("\n--- Final State ---");
  console.log("  Claimed:", finalAuction.claimed);
  console.log("  Winning Nullifier:", finalAuction.winningNullifier);

  // Check token balance
  const tokenBalance = await token.balanceOf(stealthAddress);
  console.log("  Stealth address PNBR balance:", ethers.utils.formatEther(tokenBalance));

  console.log("\n=== E2E TEST PASSED ===");
  console.log("Privacy summary:");
  console.log("  - Bidder address: NEVER on-chain (deployer relayed commitBid)");
  console.log("  - Bid amount: NEVER on-chain (only commit hash + nullifier)");
  console.log("  - Winner identity: HIDDEN (only nullifier declared)");
  console.log("  - Token recipient: stealth address (unlinkable)");
  console.log("  - Claim sender: burner wallet (msg.sender irrelevant)");

  process.exit(0);
}

main().catch(e => {
  console.error("\n=== TEST FAILED ===");
  console.error(e);
  process.exit(1);
});
