import { db } from "../api/queries/connection";
import { sessions } from "./schema";

async function seed() {
  console.log("Seeding database...");

  // Add sample session for testing
  await db.insert(sessions).values({
    sessionId: "sc_demo_session",
    pageTitle: "Demo Page",
    pageUrl: "https://example.com",
    status: "disconnected",
    peerCount: 0,
    avgLatency: 0,
  });

  console.log("Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
