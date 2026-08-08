#!/usr/bin/env node
/**
 * Look up one country or one region, without downloading the whole dataset.
 *
 *   npx emergency-and-helplines ES          # by ISO 3166-1 alpha-2 code
 *   npx emergency-and-helplines Spain       # by name
 *   npx emergency-and-helplines europe      # a whole region
 *   npx emergency-and-helplines ES --json   # raw JSON, for piping
 *   npx emergency-and-helplines --list      # every country, one per line
 *
 * Reads the committed JSON files, so it works offline once the package is installed and never hits
 * the network.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isoCode } from "./countries.mjs";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const args = process.argv.slice(2);
const wantsJson = args.includes("--json");
const query = args.find((a) => !a.startsWith("-"));

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const regionSlugs = () => readdirSync(join(DATA, "regions")).map((f) => f.replace(".json", ""));

function show(country) {
  if (wantsJson) { console.log(JSON.stringify(country, null, 2)); return; }
  const line = (label, r) => {
    if (!r) return `${label.padEnd(12)} none listed`;
    return `${label.padEnd(12)} ${r.number}${r.note ? `   (${r.note})` : ""}`;
  };
  console.log(`\n${country.name} (${country.country}) · ${country.region}`);
  console.log(line("emergency", country.emergency));
  console.log(line("crisis", country.crisis));
}

if (!query || args.includes("--help") || args.includes("-h")) {
  const meta = read(join(DATA, "meta.json"));
  console.log(`
emergency-and-helplines · ${meta.countries} countries · built ${meta.generatedAt}

  npx emergency-and-helplines ES         one country, by ISO code
  npx emergency-and-helplines Spain      one country, by name
  npx emergency-and-helplines europe     one region
  npx emergency-and-helplines --list     every country
  --json                                 raw JSON output

Regions: ${regionSlugs().join(", ")}

${meta.disclaimer}
`);
  process.exit(0);
}

if (args.includes("--list")) {
  const all = read(join(DATA, "all.json"));
  for (const c of all.data) {
    console.log(`${c.country}  ${c.name.padEnd(34)} ${String(c.emergency.number).padEnd(16)} ${c.crisis?.number ?? "-"}`);
  }
  process.exit(0);
}

// A region?
const asRegion = query.toLowerCase().replace(/\s+/g, "-");
if (regionSlugs().includes(asRegion)) {
  const region = read(join(DATA, "regions", `${asRegion}.json`));
  if (wantsJson) { console.log(JSON.stringify(region, null, 2)); process.exit(0); }
  console.log(`\n${region.region} · ${region.countries} countries\n`);
  for (const c of region.data) {
    console.log(`${c.country}  ${c.name.padEnd(34)} ${String(c.emergency.number).padEnd(16)} ${c.crisis?.number ?? "-"}`);
  }
  process.exit(0);
}

// A country, by code or by name.
const code = /^[A-Za-z]{2}$/.test(query) ? query.toUpperCase() : isoCode(query);
const file = code && join(DATA, "countries", `${code}.json`);
if (!file || !existsSync(file)) {
  console.error(`No data for "${query}". Try a two-letter code (ES), a country name (Spain) or a region (europe).`);
  process.exit(1);
}
show(read(file));
