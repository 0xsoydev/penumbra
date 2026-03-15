import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~~/db";
import { auctions, deposits } from "~~/db/schema";
import { getTransfer, verifyWebhook } from "~~/services/penumbra/bitgo";
import { executePayout } from "~~/services/penumbra/payout";

const BITGO_WEBHOOK_SECRET = process.env.BITGO_WEBHOOK_SECRET || "";

/**
 * POST /api/webhooks/bitgo
 *
 * BitGo fires this webhook when a transfer is confirmed on a monitored wallet.
 * Flow:
 *   1. Verify webhook authenticity (shared secret header)
 *   2. Parse body: { type, wallet, hash }
 *   3. Only process type === "transfer"
 *   4. Look up auction by bitgoWalletId
 *   5. Fetch transfer details from BitGo to get entries
 *   6. For each incoming entry: match to deposit by address, update confirmed + amountWei
 *   7. If a winner has been declared, attempt executePayout (idempotent)
 *   8. Return 200 immediately (BitGo retries on non-2xx)
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verify webhook secret (if configured)
    if (BITGO_WEBHOOK_SECRET) {
      const authHeader = req.headers.get("x-bitgo-webhook-secret") || req.headers.get("authorization") || "";
      // BitGo test env may send the secret in different headers — check both
      const tokenFromBearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
      if (tokenFromBearer !== BITGO_WEBHOOK_SECRET) {
        console.warn("[webhook] Invalid webhook secret — rejecting");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // 2. Parse body
    const body = await req.json();
    console.log("[webhook] Received BitGo webhook:", JSON.stringify(body));

    // Basic structure validation
    if (!verifyWebhook(body)) {
      console.warn("[webhook] Malformed webhook payload — missing required fields");
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const {
      type,
      wallet: walletId,
      hash: transferId,
    } = body as {
      type: string;
      wallet: string;
      hash: string;
    };

    // 3. Only process transfer webhooks
    if (type !== "transfer") {
      console.log(`[webhook] Ignoring non-transfer webhook type: ${type}`);
      return NextResponse.json({ ok: true, skipped: true, reason: `type=${type}` });
    }

    // 4. Look up auction by BitGo wallet ID
    const [auction] = await db.select().from(auctions).where(eq(auctions.bitgoWalletId, walletId));

    if (!auction) {
      console.warn(`[webhook] No auction found for wallet ${walletId} — ignoring`);
      return NextResponse.json({ ok: true, skipped: true, reason: "unknown_wallet" });
    }

    const auctionId = auction.id;
    console.log(`[webhook] Matched wallet ${walletId} to auction ${auctionId}`);

    // 5. Fetch transfer details from BitGo
    let transfer;
    try {
      transfer = await getTransfer(walletId, transferId);
    } catch (err) {
      console.error(`[webhook] Failed to fetch transfer ${transferId}:`, err);
      // Return 200 anyway — we'll catch it on the next webhook or manual settle
      return NextResponse.json({ ok: true, error: "transfer_fetch_failed" });
    }

    console.log(`[webhook] Transfer ${transferId} state=${transfer.state}, entries=${transfer.entries.length}`);

    // 6. Process incoming entries — match to deposit addresses
    const auctionDeposits = await db.select().from(deposits).where(eq(deposits.auctionId, auctionId));

    let updatedCount = 0;

    for (const entry of transfer.entries) {
      // Positive value = incoming ETH to the wallet
      const valueWei = BigInt(entry.valueString || "0");
      if (valueWei <= 0n) continue;

      // Match entry address to a deposit address (case-insensitive)
      const matchingDeposit = auctionDeposits.find(
        d => d.bitgoDepositAddress.toLowerCase() === entry.address.toLowerCase(),
      );

      if (!matchingDeposit) {
        console.log(`[webhook] No matching deposit for address ${entry.address} — could be fee/base address`);
        continue;
      }

      // Update deposit as confirmed with actual amount
      await db
        .update(deposits)
        .set({
          confirmed: true,
          amountWei: valueWei.toString(),
        })
        .where(eq(deposits.id, matchingDeposit.id));

      updatedCount++;
      console.log(
        `[webhook] Confirmed deposit ${matchingDeposit.id}: bidder=${matchingDeposit.bidderAddress}, amount=${valueWei.toString()} wei`,
      );
    }

    console.log(`[webhook] Updated ${updatedCount} deposits for auction ${auctionId}`);

    // 7. Check if winner has been declared — if so, attempt payout
    // Re-fetch deposits to get updated state
    const updatedDeposits = await db.select().from(deposits).where(eq(deposits.auctionId, auctionId));

    const hasWinner = updatedDeposits.some(d => d.isWinner);

    let payoutResult = null;
    if (hasWinner) {
      console.log(`[webhook] Auction ${auctionId} has a declared winner — attempting payout`);
      try {
        payoutResult = await executePayout(auctionId);
        console.log(`[webhook] Payout result for auction ${auctionId}:`, JSON.stringify(payoutResult));
      } catch (err) {
        // Don't fail the webhook — payout can be retried
        console.error(`[webhook] Payout attempt failed for auction ${auctionId}:`, err);
        payoutResult = { status: "error", message: err instanceof Error ? err.message : "unknown" };
      }
    } else {
      console.log(`[webhook] Auction ${auctionId}: no winner declared yet — deposits confirmed, payout deferred`);
    }

    // 8. Return 200 immediately
    return NextResponse.json({
      ok: true,
      auctionId,
      depositsUpdated: updatedCount,
      payoutResult,
    });
  } catch (error) {
    console.error("[webhook] Unhandled error:", error);
    // Return 200 to prevent BitGo retries on unexpected errors
    // (we log the error for debugging)
    return NextResponse.json({ ok: true, error: "internal_error_logged" });
  }
}
