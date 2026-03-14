/**
 * Find AuctionSettled event for Auction 2 on-chain.
 * Uses a narrow block range to avoid the public RPC 10,000 block limit.
 */
import * as dotenv from "dotenv";
import { ethers } from "ethers";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
const AUCTION_ADDRESS = "0xDFa35B4e287a91468e0308F8475ADf11E5e59A5e";
const TOKEN_ADDRESS = "0x5dfBd7e43D207F3C1c67e5d81a28593bEC0981E7";

const AUCTION_ABI = [
  "event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 winningBid)",
  "event BidCommitted(uint256 indexed auctionId, address indexed bidder, bytes32 commitment)",
  "event BidRevealed(uint256 indexed auctionId, address indexed bidder, uint256 amount)",
  "event AuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 tokenAmount, uint256 minBid, uint256 commitDeadline, uint256 revealDeadline)",
];

const TOKEN_ABI = ["event Transfer(address indexed from, address indexed to, uint256 value)"];

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  const auction = new ethers.Contract(AUCTION_ADDRESS, AUCTION_ABI, provider);
  const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, provider);

  const latestBlock = await provider.getBlockNumber();
  console.log(`\nLatest block: ${latestBlock}`);

  // Try increasingly narrow ranges around the known settlement area
  const ranges = [
    [38835000, 38836000],
    [38836000, 38837000],
    [38837000, 38838000],
    [38838000, 38840000],
    [38840000, 38845000],
  ];

  console.log("\n--- Searching for AuctionSettled events (auction 2) ---");
  for (const [from, to] of ranges) {
    if (from > latestBlock) break;
    const end = Math.min(to, latestBlock);
    try {
      const filter = auction.filters.AuctionSettled(2);
      const logs = await auction.queryFilter(filter, from, end);
      if (logs.length > 0) {
        for (const log of logs) {
          console.log(`\n✅ AuctionSettled (auctionId=2) found!`);
          console.log(`   TX Hash : ${log.transactionHash}`);
          console.log(`   Block   : ${log.blockNumber}`);
          console.log(`   Winner  : ${(log as any).args?.winner}`);
          console.log(`   Winning Bid: ${ethers.utils.formatEther((log as any).args?.winningBid)} ETH`);
        }
      } else {
        console.log(`  Blocks ${from}–${end}: no AuctionSettled for auction 2`);
      }
    } catch (e: any) {
      console.log(`  Blocks ${from}–${end}: ERROR — ${e.message}`);
    }
  }

  // Also search for all AuctionSettled events (any auction)
  console.log("\n--- Searching for ALL AuctionSettled events ---");
  for (const [from, to] of ranges) {
    if (from > latestBlock) break;
    const end = Math.min(to, latestBlock);
    try {
      const logs = await auction.queryFilter(auction.filters.AuctionSettled(), from, end);
      if (logs.length > 0) {
        for (const log of logs) {
          console.log(
            `  Block ${log.blockNumber}: AuctionSettled auction=${(log as any).args?.auctionId} tx=${log.transactionHash}`,
          );
        }
      }
    } catch (e: any) {
      console.log(`  Blocks ${from}–${end}: ERROR — ${e.message}`);
    }
  }

  // Also search PNBR Transfer events FROM the auction contract (settlement sends tokens)
  console.log("\n--- Searching PNBR Transfer FROM auction contract ---");
  for (const [from, to] of ranges) {
    if (from > latestBlock) break;
    const end = Math.min(to, latestBlock);
    try {
      const filter = token.filters.Transfer(AUCTION_ADDRESS, null);
      const logs = await token.queryFilter(filter, from, end);
      if (logs.length > 0) {
        for (const log of logs) {
          const args = (log as any).args;
          console.log(
            `  Block ${log.blockNumber}: Transfer ${ethers.utils.formatEther(args.value)} PNBR → ${args.to}  tx=${log.transactionHash}`,
          );
        }
      }
    } catch (e: any) {
      console.log(`  Blocks ${from}–${end}: ERROR — ${e.message}`);
    }
  }
}

main().catch(console.error);
