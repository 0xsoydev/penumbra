import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { ethers } from "ethers";
import { db } from "~~/db";
import { auctions, deposits } from "~~/db/schema";
import { createDepositAddress } from "~~/services/penumbra/bitgo";
import { commitBidOnChain } from "~~/services/penumbra/contract";
import { computeNullifier, generateCommitHash, generateSalt } from "~~/services/penumbra/zkproof";

/**
 * POST /api/auction/[id]/deposit
 *
 * ZK Flow:
 *   1. Create a unique BitGo deposit address for the bidder
 *   2. Generate secret/nullifier pair for the bidder
 *   3. Compute commit hash from bid amount
 *   4. Relay commitBid(auctionId, nullifier, commitHash) on-chain
 *   5. Store all ZK fields in DB (bidder's address NEVER touches the contract)
 *
 * Body: { bidderAddress, bidAmountWei, secret? }
 *   - bidderAddress: for BitGo refund routing only
 *   - bidAmountWei: the bid amount in wei (stored off-chain only)
 *   - secret: optional — if provided, used as the secret; otherwise auto-generated
 *
 * Returns: { depositAddress, nullifier, commitHash }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auctionId = parseInt(id, 10);
    if (isNaN(auctionId)) {
      return NextResponse.json({ error: "Invalid auction ID" }, { status: 400 });
    }

    const body = await req.json();
    const { bidderAddress, bidAmountWei, secret: providedSecret } = body;

    if (!bidderAddress) {
      return NextResponse.json({ error: "Missing required field: bidderAddress" }, { status: 400 });
    }
    if (!bidAmountWei) {
      return NextResponse.json({ error: "Missing required field: bidAmountWei" }, { status: 400 });
    }

    // Fetch auction to get BitGo wallet ID
    const [auction] = await db.select().from(auctions).where(eq(auctions.id, auctionId));

    if (!auction) {
      return NextResponse.json({ error: "Auction not found" }, { status: 404 });
    }

    // Check if bidder already has a deposit for this auction
    const existing = await db.select().from(deposits).where(eq(deposits.auctionId, auctionId));
    const existingDeposit = existing.find(d => d.bidderAddress.toLowerCase() === bidderAddress.toLowerCase());

    if (existingDeposit && existingDeposit.committed) {
      return NextResponse.json(
        {
          error: "Bid already committed for this bidder",
          depositAddress: existingDeposit.bitgoDepositAddress,
          nullifier: existingDeposit.nullifier,
        },
        { status: 409 },
      );
    }

    // Generate ZK primitives
    const secret = providedSecret || ethers.BigNumber.from(ethers.utils.randomBytes(31)).toHexString();
    const nullifier = await computeNullifier(secret);
    const salt = generateSalt();
    const commitHash = generateCommitHash(bidAmountWei, salt, nullifier);

    // Create BitGo deposit address (or reuse existing)
    let depositAddress: string;
    if (existingDeposit) {
      depositAddress = existingDeposit.bitgoDepositAddress;
    } else {
      depositAddress = await createDepositAddress(auction.bitgoWalletId, bidderAddress);
    }

    // Relay commitBid on-chain (backend sends tx — bidder address NEVER on-chain)
    console.log(`Relaying commitBid for auction ${auctionId}, nullifier: ${nullifier}`);
    const receipt = await commitBidOnChain(auctionId, nullifier, commitHash);
    console.log(`commitBid tx confirmed: ${receipt.transactionHash}`);

    // Store in DB
    if (existingDeposit) {
      // Update existing deposit with ZK fields
      await db
        .update(deposits)
        .set({
          nullifier,
          secret,
          salt,
          commitHash,
          bidAmount: bidAmountWei,
          committed: true,
        })
        .where(eq(deposits.id, existingDeposit.id));
    } else {
      // Insert new deposit with ZK fields
      await db.insert(deposits).values({
        auctionId,
        bidderAddress: bidderAddress.toLowerCase(),
        bitgoDepositAddress: depositAddress,
        amountWei: "0", // updated by BitGo webhook when ETH arrives
        confirmed: false,
        nullifier,
        secret,
        salt,
        commitHash,
        bidAmount: bidAmountWei,
        committed: true,
      });
    }

    return NextResponse.json({
      success: true,
      depositAddress,
      auctionId,
      nullifier,
      commitHash,
      onChainTxHash: receipt.transactionHash,
      message: "Bid committed on-chain. Send ETH to the deposit address to back your bid.",
    });
  } catch (error) {
    console.error("auction/[id]/deposit error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
