// Wait for an early-started builder to finish: polls web/.build/<key>.report.json.
// usage: node scripts/wait-for.mjs <key>   (waits up to 9 minutes per call; re-run on STILL_WAITING)
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const key = process.argv[2];
const file = fileURLToPath(new URL(`../.build/${key}.report.json`, import.meta.url));
const until = Date.now() + 9 * 60_000;
while (Date.now() < until) {
  if (existsSync(file)) {
    console.log(readFileSync(file, "utf8"));
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
console.log(`STILL_WAITING for ${key} — run the same command again.`);
process.exit(3);
