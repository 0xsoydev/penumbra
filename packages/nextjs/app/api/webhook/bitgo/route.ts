import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~~/db";
import { deposits } from "~~/db/schema";

/**
 * POST /api/webhook/bitgo
 *
 * BitGo webhook endpoint — called when a deposit is confirmed.
 * Updates the deposit record with the confirmed amount.
 *
 * BitGo webhook payload (transfer type):
 * {
 *   type: "transfer",
 *   wallet: "walletId",
 *   hash: "txHash",
 *   transfer: { ... entries with value, address, etc. }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Basic validation
    if (!body.type || !body.wallet || !body.hash) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    // We only care about incoming transfer webhooks
    if (body.type !== "transfer") {
      return NextResponse.json({ ok: true, message: "Ignored non-transfer webhook" });
    }

    // Extract transfer entries — look for incoming deposits
    const entries = body.transfer?.entries || [];
    for (const entry of entries) {
      // Positive value = incoming transfer
      if (entry.value > 0 && entry.address) {
        const depositAddress = entry.address.toLowerCase();
        const amountWei = String(entry.value);

        // Find matching deposit record by deposit address
        const [deposit] = await db.select().from(deposits).where(eq(deposits.bitgoDepositAddress, depositAddress));

        if (deposit) {
          // Update with confirmed amount
          await db
            .update(deposits)
            .set({
              amountWei,
              confirmed: true,
            })
            .where(eq(deposits.id, deposit.id));

          console.log(
            `Deposit confirmed: auction=${deposit.auctionId} bidder=${deposit.bidderAddress} amount=${amountWei}`,
          );
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("webhook/bitgo error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
