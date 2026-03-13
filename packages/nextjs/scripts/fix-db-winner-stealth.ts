/**
 * Check and fix DB stealth announcements for Auction 2.
 */
import { stealthAnnouncements } from "../db/schema";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const CORRECT_WINNER_STEALTH = "0x23f6CFE16D078d881bD0FAd20049bA1475f2ca43";
const AUCTION_ID = 2;

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  // Show all announcements for auction 2
  const rows = await db.select().from(stealthAnnouncements).where(eq(stealthAnnouncements.auctionId, AUCTION_ID));

  console.log(`\nAll stealth announcements for auction ${AUCTION_ID}:`);
  console.log(JSON.stringify(rows, null, 2));

  // Show all announcements (all auctions) for context
  const all = await db.select().from(stealthAnnouncements);
  console.log(`\nAll stealth announcements (all auctions):`);
  console.log(JSON.stringify(all, null, 2));

  // Find any row that does NOT have the correct winner stealth
  const wrongRow = rows.find(
    r =>
      r.stealthAddress !== CORRECT_WINNER_STEALTH && r.stealthAddress !== "0xDC8bc5d7d93d019f2c6CdcE049A4c9820D90328e", // seller stealth
  );

  if (wrongRow) {
    console.log(`\nFound wrong winner stealth: ${wrongRow.stealthAddress} (id=${wrongRow.id})`);
    console.log(`Updating to correct: ${CORRECT_WINNER_STEALTH}`);

    await db
      .update(stealthAnnouncements)
      .set({ stealthAddress: CORRECT_WINNER_STEALTH })
      .where(eq(stealthAnnouncements.id, wrongRow.id));

    console.log("✅ Updated.");
  } else {
    console.log("\nAll auction 2 records look correct — no fix needed.");
  }
}

main().catch(console.error);
