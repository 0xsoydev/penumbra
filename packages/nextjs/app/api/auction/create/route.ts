import { NextRequest, NextResponse } from "next/server";
import { db } from "~~/db";
import { auctions } from "~~/db/schema";
import { createAuctionWallet } from "~~/services/penumbra/bitgo";

/**
 * POST /api/auction/create
 *
 * Create a new auction:
 *   1. Create a BitGo wallet to hold bidder ETH deposits
 *   2. Insert auction record into DB
 *
 * Body: { auctionId, sellerAddress, ensName?, docCid? }
 *
 * Note: The on-chain auction is created by the seller directly via the contract.
 * This endpoint sets up the off-chain infrastructure (BitGo wallet + DB row).
 * The auctionId must match the on-chain auction ID.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { auctionId, sellerAddress, ensName, docCid } = body;

    if (!auctionId || !sellerAddress) {
      return NextResponse.json({ error: "Missing required fields: auctionId, sellerAddress" }, { status: 400 });
    }

    const id = parseInt(auctionId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "auctionId must be a number" }, { status: 400 });
    }

    // 1. Create BitGo wallet for this auction
    const { walletId, walletAddress } = await createAuctionWallet(id);

    // 2. Insert auction record
    await db.insert(auctions).values({
      id,
      sellerAddress: sellerAddress.toLowerCase(),
      bitgoWalletId: walletId,
      bitgoWalletAddress: walletAddress,
      ensName: ensName || null,
      docCid: docCid || null,
    });

    return NextResponse.json({
      success: true,
      auction: {
        id,
        sellerAddress: sellerAddress.toLowerCase(),
        bitgoWalletId: walletId,
        bitgoWalletAddress: walletAddress,
        ensName: ensName || null,
        docCid: docCid || null,
      },
    });
  } catch (error) {
    console.error("auction/create error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
