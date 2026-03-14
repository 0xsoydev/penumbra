import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~~/db";
import { auctions, deposits } from "~~/db/schema";
import { getAuctionPhase, getCommitCount, getAuction as getOnChainAuction } from "~~/services/penumbra/contract";

/**
 * GET /api/auction/[id]/status
 *
 * Return auction details including on-chain phase, bid count,
 * and deposit confirmation status. Privacy-preserving — does NOT
 * expose bidder addresses or bid amounts to the caller.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auctionId = parseInt(id, 10);
    if (isNaN(auctionId)) {
      return NextResponse.json({ error: "Invalid auction ID" }, { status: 400 });
    }

    // Fetch auction from DB
    const [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId));

    if (!auction) {
      return NextResponse.json({ error: "Auction not found" }, { status: 404 });
    }

    // Fetch on-chain state
    let onChain;
    let phase;
    let bidCount;
    try {
      [onChain, phase, bidCount] = await Promise.all([
        getOnChainAuction(auctionId),
        getAuctionPhase(auctionId),
        getCommitCount(auctionId),
      ]);
    } catch (err) {
      console.warn("Failed to fetch on-chain data:", err);
      onChain = null;
      phase = null;
      bidCount = null;
    }

    // Fetch deposits (privacy-safe summary — no addresses exposed)
    const auctionDeposits = await db.select().from(deposits).where(eq(deposits.auctionId, auctionId));

    const phaseNames = ["COMMIT", "SETTLE", "ENDED", "CANCELLED"];

    return NextResponse.json({
      auction: {
        id: auction.id,
        sellerAddress: auction.sellerAddress,
        ensName: auction.ensName,
        docCid: auction.docCid,
        createdAt: auction.createdAt,
      },
      onChain: onChain
        ? {
            phase: phase !== null ? phaseNames[phase] || "UNKNOWN" : "UNKNOWN",
            commitDeadline: onChain.commitDeadline?.toString(),
            settleDeadline: onChain.settleDeadline?.toString(),
            winnerDeclared:
              onChain.winningNullifier !== "0x0000000000000000000000000000000000000000000000000000000000000000",
            claimed: onChain.claimed,
            cancelled: onChain.cancelled,
            bidCount,
          }
        : null,
      deposits: {
        total: auctionDeposits.length,
        committed: auctionDeposits.filter(d => d.committed).length,
        confirmed: auctionDeposits.filter(d => d.confirmed).length,
        // Only show deposit status for the caller (if they provide their address)
        // We don't expose other bidders' info
      },
    });
  } catch (error) {
    console.error("auction/[id]/status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
