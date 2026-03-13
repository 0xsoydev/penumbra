/**
 * Decode the settle TX and get full details for the money flow report.
 */
import * as dotenv from "dotenv";
import { ethers } from "ethers";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const TOKEN_ADDRESS = "0x5dfBd7e43D207F3C1c67e5d81a28593bEC0981E7";

const SETTLE_TX = "0xf71de4250d7aaab771befc22eeb5ca5c6360f11f0ec3382aca22dedf64c3849c";
const BITGO_TX = "0xae9d6f9804b65ba61a6ea3a4794d7ae57558bc9bcdc18f678d50bb0305ee0c4a";
const BID_COMMIT_TX = "0x9970df8196f79bf606f0c156c04edba264b606444e03f00c655a8d05dac344a4";
const BID_REVEAL_TX = "0x90ffdd87ec03bfe72955d4bf0eb737e2153eeae6932f777bf69fac19ca427106";
const BIDDER_DEPOSIT_TX = "0x17eb30b173e2cb49189cf2cc934ec25e0e1bc94e28c1c7f42515fcd4ab087fcc";

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

  console.log("\n=== AUCTION 2 — FULL MONEY FLOW VERIFICATION ===\n");

  // Get settle TX details
  const settleTx = await provider.getTransaction(SETTLE_TX);
  const settleReceipt = await provider.getTransactionReceipt(SETTLE_TX);
  const settleBlock = await provider.getBlock(settleReceipt.blockNumber);
  console.log("ON-CHAIN SETTLE (PNBR → winner stealth):");
  console.log(`  TX Hash    : ${SETTLE_TX}`);
  console.log(`  Block      : ${settleReceipt.blockNumber}`);
  console.log(`  Timestamp  : ${new Date(settleBlock.timestamp * 1000).toISOString()}`);
  console.log(`  From       : ${settleTx.from}  (PenumbraAuction contract caller)`);
  console.log(`  To         : ${settleTx.to}`);
  console.log(`  Gas Used   : ${settleReceipt.gasUsed.toString()}`);

  // BitGo TX
  const bitgoTx = await provider.getTransaction(BITGO_TX);
  const bitgoReceipt = await provider.getTransactionReceipt(BITGO_TX);
  const bitgoBlock = await provider.getBlock(bitgoReceipt.blockNumber);
  console.log("\nBITGO ETH TRANSFER (ETH → seller stealth):");
  console.log(`  TX Hash    : ${BITGO_TX}`);
  console.log(`  Block      : ${bitgoReceipt.blockNumber}`);
  console.log(`  Timestamp  : ${new Date(bitgoBlock.timestamp * 1000).toISOString()}`);
  console.log(`  From       : ${bitgoTx.from}`);
  console.log(`  To         : ${bitgoTx.to}`);
  console.log(`  Value      : ${ethers.utils.formatEther(bitgoTx.value)} ETH`);

  // Bidder deposit
  const depositTx = await provider.getTransaction(BIDDER_DEPOSIT_TX);
  const depositReceipt = await provider.getTransactionReceipt(BIDDER_DEPOSIT_TX);
  const depositBlock = await provider.getBlock(depositReceipt.blockNumber);
  console.log("\nBIDDER DEPOSIT (ETH → BitGo deposit address):");
  console.log(`  TX Hash    : ${BIDDER_DEPOSIT_TX}`);
  console.log(`  Block      : ${depositReceipt.blockNumber}`);
  console.log(`  Timestamp  : ${new Date(depositBlock.timestamp * 1000).toISOString()}`);
  console.log(`  From       : ${depositTx.from}`);
  console.log(`  To         : ${depositTx.to}`);
  console.log(`  Value      : ${ethers.utils.formatEther(depositTx.value)} ETH`);

  // Bid commit
  const commitTx = await provider.getTransaction(BID_COMMIT_TX);
  const commitReceipt = await provider.getTransactionReceipt(BID_COMMIT_TX);
  const commitBlock = await provider.getBlock(commitReceipt.blockNumber);
  console.log("\nBID COMMIT:");
  console.log(`  TX Hash    : ${BID_COMMIT_TX}`);
  console.log(`  Block      : ${commitReceipt.blockNumber}`);
  console.log(`  Timestamp  : ${new Date(commitBlock.timestamp * 1000).toISOString()}`);
  console.log(`  From       : ${commitTx.from}  (bidder)`);

  // Bid reveal
  const revealTx = await provider.getTransaction(BID_REVEAL_TX);
  const revealReceipt = await provider.getTransactionReceipt(BID_REVEAL_TX);
  const revealBlock = await provider.getBlock(revealReceipt.blockNumber);
  console.log("\nBID REVEAL:");
  console.log(`  TX Hash    : ${BID_REVEAL_TX}`);
  console.log(`  Block      : ${revealReceipt.blockNumber}`);
  console.log(`  Timestamp  : ${new Date(revealBlock.timestamp * 1000).toISOString()}`);
  console.log(`  From       : ${revealTx.from}  (bidder)`);

  // Current balances
  const TOKEN_ABI = ["function balanceOf(address) view returns (uint256)"];
  const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, provider);

  const winnerStealthBal = await token.balanceOf("0x23f6CFE16D078d881bD0FAd20049bA1475f2ca43");
  const sellerStealthBal = await provider.getBalance("0xDC8bc5d7d93d019f2c6CdcE049A4c9820D90328e");

  console.log("\n=== CURRENT BALANCES ===");
  console.log(`Winner stealth (0x23f6CF...): ${ethers.utils.formatEther(winnerStealthBal)} PNBR`);
  console.log(`Seller stealth (0xDC8bc5...): ${ethers.utils.formatEther(sellerStealthBal)} ETH`);
}

main().catch(console.error);
