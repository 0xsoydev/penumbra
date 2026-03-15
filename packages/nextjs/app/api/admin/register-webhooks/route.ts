import { NextRequest, NextResponse } from "next/server";
import { db } from "~~/db";
import { auctions } from "~~/db/schema";
import { listWebhooks, registerWebhook } from "~~/services/penumbra/bitgo";

const ADMIN_SECRET = process.env.ADMIN_SECRET || "";

/**
 * POST /api/admin/register-webhooks
 *
 * Backfill webhook registration for all existing auctions.
 * Auctions created before webhook support was added won't have webhooks.
 * This endpoint registers webhooks on all wallets that don't have one yet.
 *
 * Headers: { Authorization: "Bearer <ADMIN_SECRET>" }
 * Body: { webhookUrl?: string } — optional override, defaults to NEXT_PUBLIC_APP_URL
 */
export async function POST(req: NextRequest) {
  try {
    // Auth check
    if (!ADMIN_SECRET) {
      return NextResponse.json({ error: "ADMIN_SECRET not configured" }, { status: 500 });
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (token !== ADMIN_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Determine webhook URL
    const body = await req.json().catch(() => ({}));
    const appUrl = (body as Record<string, string>).webhookUrl || process.env.NEXT_PUBLIC_APP_URL;

    if (!appUrl) {
      return NextResponse.json(
        { error: "No webhook URL: set NEXT_PUBLIC_APP_URL or pass webhookUrl in body" },
        { status: 400 },
      );
    }

    const webhookUrl = `${appUrl}/api/webhooks/bitgo`;

    // Fetch all auctions
    const allAuctions = await db.select().from(auctions);

    const results: Array<{
      auctionId: number;
      walletId: string;
      status: "registered" | "already_exists" | "error";
      message?: string;
    }> = [];

    for (const auction of allAuctions) {
      try {
        // Check existing webhooks
        const existing = (await listWebhooks(auction.bitgoWalletId)) as Array<{ url?: string; type?: string }>;
        const alreadyRegistered = existing.some(w => w.url === webhookUrl && w.type === "transfer");

        if (alreadyRegistered) {
          results.push({
            auctionId: auction.id,
            walletId: auction.bitgoWalletId,
            status: "already_exists",
          });
          continue;
        }

        await registerWebhook(auction.bitgoWalletId, webhookUrl);
        results.push({
          auctionId: auction.id,
          walletId: auction.bitgoWalletId,
          status: "registered",
        });
      } catch (err) {
        results.push({
          auctionId: auction.id,
          walletId: auction.bitgoWalletId,
          status: "error",
          message: err instanceof Error ? err.message : "unknown",
        });
      }
    }

    const registered = results.filter(r => r.status === "registered").length;
    const skipped = results.filter(r => r.status === "already_exists").length;
    const errors = results.filter(r => r.status === "error").length;

    return NextResponse.json({
      success: true,
      webhookUrl,
      summary: { total: allAuctions.length, registered, skipped, errors },
      results,
    });
  } catch (error) {
    console.error("admin/register-webhooks error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
