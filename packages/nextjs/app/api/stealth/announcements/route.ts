import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~~/db";
import { stealthAnnouncements } from "~~/db/schema";

/**
 * GET /api/stealth/announcements?address=0x...
 *
 * Return stealth announcements for a given recipient address.
 * The frontend uses these to scan for payments directed at the user.
 *
 * Query params: address (required)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");

    if (!address) {
      return NextResponse.json({ error: "Missing required query param: address" }, { status: 400 });
    }

    const announcements = await db
      .select()
      .from(stealthAnnouncements)
      .where(eq(stealthAnnouncements.recipientAddress, address.toLowerCase()));

    return NextResponse.json({ announcements });
  } catch (error) {
    console.error("stealth/announcements error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
