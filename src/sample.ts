import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildDiscordPayload } from "./discord.js";
import { normalizeListing } from "./provider.js";
import { scoreListings } from "./scoring.js";
import type { RawListing } from "./types.js";

const fixturePath = resolve("fixtures/sample-listings.json");
const rawListings = JSON.parse(readFileSync(fixturePath, "utf8")) as RawListing[];
const listings = rawListings.map(normalizeListing).filter((item) => item !== null);
const deals = scoreListings(listings, []);
const alertable = deals.filter((deal) => deal.shouldAlert);

console.log(`sample listings=${listings.length} scored=${deals.length} alertable=${alertable.length}`);

for (const deal of alertable) {
  console.log(JSON.stringify(buildDiscordPayload(deal), null, 2));
}
