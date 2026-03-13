import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~~/db";
import { auctions, deposits } from "~~/db/schema";
import { createDepositAddress } from "~~/services/penumbra/bitgo";

/**
 * POST /api/auction/[id]/deposit
 *
 * Create a unique BitGo deposit address for a bidder.
 * The bidder sends ETH to this address to back their sealed bid.
 *
 * Body: { bidderAddress }
 *
 * Returns: { depositAddress } — the unique address the bidder should send ETH to.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auctionId = parseInt(id, 10);
    if (isNaN(auctionId)) {
      return NextResponse.json({ error: "Invalid auction ID" }, { status: 400 });
    }

    const body = await req.json();
    const { bidderAddress } = body;

    if (!bidderAddress) {
      return NextResponse.json({ error: "Missing required field: bidderAddress" }, { status: 400 });
    }

    // Fetch auction to get BitGo wallet ID
    const [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId));

    if (!auction) {
      return NextResponse.json({ error: "Auction not found" }, { status: 404 });
    }

    // Check if bidder already has a deposit address for this auction
    const existing = await db.select().from(deposits).where(eq(deposits.auctionId, auctionId));

    const existingDeposit = existing.find(d => d.bidderAddress.toLowerCase() === bidderAddress.toLowerCase());

    if (existingDeposit) {
      return NextResponse.json({
        depositAddress: existingDeposit.bitgoDepositAddress,
        message: "Deposit address already exists for this bidder",
      });
    }

    // Create a unique deposit address via BitGo
    const depositAddress = await createDepositAddress(auction.bitgoWalletId, bidderAddress);

    // Insert deposit record (amount starts at 0, confirmed = false)
    await db.insert(deposits).values({
      auctionId,
      bidderAddress: bidderAddress.toLowerCase(),
      bitgoDepositAddress: depositAddress,
      amountWei: "0",
      confirmed: false,
    });

    return NextResponse.json({
      success: true,
      depositAddress,
      auctionId,
      bidderAddress: bidderAddress.toLowerCase(),
    });
  } catch (error) {
    console.error("auction/[id]/deposit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
