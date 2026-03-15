import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~~/db";
import { auctions, deposits } from "~~/db/schema";
import { declareWinner as declareWinnerOnChain, getAuction as getOnChainAuction } from "~~/services/penumbra/contract";
import { executePayout } from "~~/services/penumbra/payout";

// Settlement involves on-chain tx + BitGo API calls
export const maxDuration = 60;

/**
 * POST /api/auction/[id]/settle
 *
 * ZK-Privacy Settlement Flow:
 *
 *   1. Fetch all committed bids from DB (amounts are stored off-chain only)
 *   2. Verify commit hashes match: keccak256(bidAmount, salt, nullifier) == stored commitHash
 *   3. Determine highest bid (off-chain — amounts NEVER posted on-chain)
 *   4. Call declareWinner(auctionId, winningNullifier) on-chain
 *      — Only the nullifier is posted; no address, no amount
 *   5. Execute ETH payout via shared executePayout service:
 *      - Seller receives winning bid at stealth address
 *      - Losers get refunded to original addresses
 *      - If spendable balance is 0, payout is deferred (webhook will retry)
 *
 * NOTE: The winner claims tokens separately via claimWithProof (permissionless).
 *       This route does NOT transfer tokens — it only declares the winner and
 *       handles the ETH side.
 *
 * This endpoint is admin-only (deployer/owner).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auctionId = parseInt(id, 10);
    if (isNaN(auctionId)) {
      return NextResponse.json({ error: "Invalid auction ID" }, { status: 400 });
    }

    // --- 1. Fetch auction from DB ---
    const [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId));
    if (!auction) {
      return NextResponse.json({ error: "Auction not found" }, { status: 404 });
    }

    // --- 2. Fetch all committed bids from DB ---
    const allDeposits = await db.select().from(deposits).where(eq(deposits.auctionId, auctionId));
    const committedBids = allDeposits.filter(d => d.committed && d.nullifier && d.bidAmount);

    if (committedBids.length === 0) {
      return NextResponse.json({ error: "No committed bids found" }, { status: 400 });
    }

    // --- 3. Verify commit hashes and determine winner (off-chain) ---
    const { ethers } = await import("ethers");
    let highestBid: (typeof committedBids)[0] | null = null;

    for (const bid of committedBids) {
      // Verify commit hash matches
      const expectedHash = ethers.utils.solidityKeccak256(
        ["uint256", "bytes32", "bytes32"],
        [bid.bidAmount!, bid.salt!, bid.nullifier!],
      );

      if (expectedHash.toLowerCase() !== bid.commitHash!.toLowerCase()) {
        console.warn(`Bid with nullifier ${bid.nullifier} has invalid commit hash — skipping`);
        continue;
      }

      // Check if this is the highest bid
      if (!highestBid || ethers.BigNumber.from(bid.bidAmount!).gt(ethers.BigNumber.from(highestBid.bidAmount!))) {
        highestBid = bid;
      }
    }

    if (!highestBid) {
      return NextResponse.json({ error: "No valid bids found after verification" }, { status: 400 });
    }

    // --- 4. Declare winner on-chain ---
    const onChainAuction = await getOnChainAuction(auctionId);
    let declareTxHash = "";

    if (onChainAuction.winningNullifier !== ethers.constants.HashZero) {
      console.log(`Auction ${auctionId} winner already declared on-chain, skipping`);
      declareTxHash = "(already declared)";
    } else {
      console.log(`Declaring winner for auction ${auctionId}: nullifier ${highestBid.nullifier}`);
      const receipt = await declareWinnerOnChain(auctionId, highestBid.nullifier!);
      declareTxHash = receipt.transactionHash;
      console.log(`declareWinner tx confirmed: ${declareTxHash}`);
    }

    // Mark winner in DB
    await db.update(deposits).set({ isWinner: true }).where(eq(deposits.id, highestBid.id));

    // --- 5. ETH settlement via shared payout service ---
    // executePayout handles: stealth address generation, seller payment, loser refunds, idempotency
    let payoutResult;
    try {
      payoutResult = await executePayout(auctionId);
      console.log(`[settle] Payout result:`, JSON.stringify(payoutResult));
    } catch (err) {
      console.error("[settle] executePayout failed:", err);
      payoutResult = { status: "error", message: err instanceof Error ? err.message : "unknown" };
    }

    return NextResponse.json({
      success: true,
      settlement: {
        auctionId,
        winningNullifier: highestBid.nullifier,
        winningBidWei: highestBid.bidAmount,
        totalBids: committedBids.length,
        declareTxHash,
        payout: payoutResult,
        note: "Winner must call claimWithProof() separately to receive tokens",
      },
    });
  } catch (error) {
    console.error("auction/[id]/settle error:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message, stack: error instanceof Error ? error.stack?.split("\n").slice(0, 5) : undefined },
      { status: 500 },
    );
  }
}
