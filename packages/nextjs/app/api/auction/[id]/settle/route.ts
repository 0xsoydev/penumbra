import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~~/db";
import { auctions, deposits, stealthAnnouncements, stealthKeys } from "~~/db/schema";
import { sendMany } from "~~/services/penumbra/bitgo";
import { determineWinner, settle as settleOnChain } from "~~/services/penumbra/contract";
import { generateStealthAddress } from "~~/services/penumbra/umbra";

/**
 * POST /api/auction/[id]/settle
 *
 * The most complex route — orchestrates the full settlement:
 *
 *   1. Read on-chain state to determine the winner (highest revealed bid)
 *   2. Look up stealth keys for winner + seller from DB
 *   3. Generate Umbra stealth addresses for:
 *      - Winner (receives the ERC-20 tokens)
 *      - Seller (receives the winning ETH bid)
 *   4. Call contract.settle() on-chain — transfers ERC-20 to winner's stealth address
 *   5. Call BitGo sendMany() — sends winner's ETH to seller's stealth address,
 *      refunds all losing bidders to their original addresses
 *   6. Store stealth announcements in DB so recipients can scan for payments
 *
 * This endpoint is admin-only (called by deployer/owner).
 * In a production system you'd add auth — for the hackathon, we trust the caller.
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

    // --- 2. Determine winner from on-chain state ---
    const result = await determineWinner(auctionId);
    if (!result) {
      return NextResponse.json({ error: "No valid revealed bids — cannot settle" }, { status: 400 });
    }
    const { winner: winnerAddress, amount: winningAmount } = result;

    // --- 3. Look up stealth keys for winner + seller ---
    const [winnerKeys] = await db
      .select()
      .from(stealthKeys)
      .where(eq(stealthKeys.address, winnerAddress.toLowerCase()));

    const [sellerKeys] = await db
      .select()
      .from(stealthKeys)
      .where(eq(stealthKeys.address, auction.sellerAddress.toLowerCase()));

    if (!winnerKeys) {
      return NextResponse.json({ error: `Winner ${winnerAddress} has not registered stealth keys` }, { status: 400 });
    }
    if (!sellerKeys) {
      return NextResponse.json(
        { error: `Seller ${auction.sellerAddress} has not registered stealth keys` },
        { status: 400 },
      );
    }

    // --- 4. Generate stealth addresses ---
    const winnerStealth = generateStealthAddress(winnerKeys.spendingPublicKey, winnerKeys.viewingPublicKey);

    const sellerStealth = generateStealthAddress(sellerKeys.spendingPublicKey, sellerKeys.viewingPublicKey);

    // --- 5. On-chain settlement: transfer ERC-20 to winner's stealth address ---
    const settleTxReceipt = await settleOnChain(auctionId, winnerStealth.stealthAddress);

    // --- 6. BitGo settlement: send ETH from auction wallet ---
    // Build recipient list: seller gets the winning bid, losers get refunded
    const allDeposits = await db.select().from(deposits).where(eq(deposits.auctionId, auctionId));

    const bitgoRecipients: { address: string; amount: string }[] = [];

    // Seller receives the winning bid amount at their stealth address
    bitgoRecipients.push({
      address: sellerStealth.stealthAddress,
      amount: winningAmount.toString(),
    });

    // Losers get refunded to their original addresses
    for (const deposit of allDeposits) {
      if (
        deposit.bidderAddress.toLowerCase() !== winnerAddress.toLowerCase() &&
        deposit.confirmed &&
        deposit.amountWei !== "0"
      ) {
        bitgoRecipients.push({
          address: deposit.bidderAddress, // refund to original address (not stealth)
          amount: deposit.amountWei,
        });
      }
    }

    let bitgoTxId = "";
    if (bitgoRecipients.length > 0) {
      bitgoTxId = await sendMany(auction.bitgoWalletId, bitgoRecipients);
    }

    // --- 7. Store stealth announcements for recipient scanning ---
    await db.insert(stealthAnnouncements).values([
      {
        recipientAddress: winnerAddress.toLowerCase(),
        ephemeralPublicKey: winnerStealth.ephemeralPublicKey,
        stealthAddress: winnerStealth.stealthAddress,
        auctionId,
      },
      {
        recipientAddress: auction.sellerAddress.toLowerCase(),
        ephemeralPublicKey: sellerStealth.ephemeralPublicKey,
        stealthAddress: sellerStealth.stealthAddress,
        auctionId,
      },
    ]);

    return NextResponse.json({
      success: true,
      settlement: {
        auctionId,
        winner: winnerAddress,
        winningAmount: winningAmount.toString(),
        winnerStealthAddress: winnerStealth.stealthAddress,
        sellerStealthAddress: sellerStealth.stealthAddress,
        onChainTxHash: settleTxReceipt.transactionHash,
        bitgoTxId,
        refundedBidders: bitgoRecipients.length - 1, // exclude seller
      },
    });
  } catch (error) {
    console.error("auction/[id]/settle error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
