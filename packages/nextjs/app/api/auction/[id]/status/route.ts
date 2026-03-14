import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~~/db";
import { auctions, deposits } from "~~/db/schema";

/**
 * GET /api/auction/[id]/status
 *
 * Return auction details and deposit confirmation status.
 * Used by the frontend to poll whether bidder deposits have been confirmed.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auctionId = parseInt(id, 10);
    if (isNaN(auctionId)) {
      return NextResponse.json({ error: "Invalid auction ID" }, { status: 400 });
    }

    // Fetch auction
    const [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId));

    if (!auction) {
      return NextResponse.json({ error: "Auction not found" }, { status: 404 });
    }

    // Fetch all deposits for this auction
    const auctionDeposits = await db.select().from(deposits).where(eq(deposits.auctionId, auctionId));

    return NextResponse.json({
      auction: {
        id: auction.id,
        sellerAddress: auction.sellerAddress,
        ensName: auction.ensName,
        docCid: auction.docCid,
        createdAt: auction.createdAt,
      },
      deposits: auctionDeposits.map(d => ({
        bidderAddress: d.bidderAddress,
        depositAddress: d.bitgoDepositAddress,
        amountWei: d.amountWei,
        confirmed: d.confirmed,
      })),
    });
  } catch (error) {
    console.error("auction/[id]/status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
