import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { db } from "~~/db";
import { auctions } from "~~/db/schema";
import { isEnsVerified } from "~~/services/ens/verify";
import { createAuctionWallet } from "~~/services/penumbra/bitgo";

/**
 * POST /api/auction/create
 *
 * Create a new auction:
 *   1. Create a BitGo wallet to hold bidder ETH deposits
 *   2. Automatically check if seller has an ENS primary name (reverse resolution)
 *   3. Insert auction record into DB
 *
 * Body: { auctionId, sellerAddress, docCid? }
 *
 * Note: The on-chain auction is created by the seller directly via the contract.
 * This endpoint sets up the off-chain infrastructure (BitGo wallet + DB row).
 * The auctionId must match the on-chain auction ID.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { auctionId, sellerAddress, docCid } = body;

    if (auctionId === undefined || auctionId === null || !sellerAddress) {
      return NextResponse.json({ error: "Missing required fields: auctionId, sellerAddress" }, { status: 400 });
    }

    if (!isAddress(sellerAddress)) {
      return NextResponse.json({ error: "Invalid sellerAddress" }, { status: 400 });
    }

    const checksummedAddress = getAddress(sellerAddress);

    const id = parseInt(auctionId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "auctionId must be a number" }, { status: 400 });
    }

    // 1. Create BitGo wallet for this auction
    const { walletId, walletAddress, feeAddress, baseAddress } = await createAuctionWallet(id);

    // 2. Auto-verify ENS via reverse resolution (address → name)
    const ensVerified = await isEnsVerified(checksummedAddress);

    // 3. Insert auction record
    await db.insert(auctions).values({
      id,
      sellerAddress: checksummedAddress.toLowerCase(),
      bitgoWalletId: walletId,
      bitgoWalletAddress: walletAddress,
      ensVerified,
      docCid: docCid ?? null,
    });

    return NextResponse.json({
      success: true,
      auction: {
        id,
        sellerAddress: checksummedAddress.toLowerCase(),
        bitgoWalletId: walletId,
        bitgoWalletAddress: walletAddress,
        feeAddress,
        baseAddress,
        ensVerified,
        docCid: docCid ?? null,
      },
    });
  } catch (error) {
    console.error("auction/create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
