#!/usr/bin/env node
/**
 * Checks the number parser and the built dataset.
 *
 *   node src/test.mjs
 *
 * Most assertions here exist because that exact thing was wrong once. Read it as a list of the ways
 * this quietly breaks.
 */
import { readFileSync, readdirSync } from "node:fs";
import { firstNumber } from "./build.mjs";
import { isoCode } from "./countries.mjs";

let pass = 0, fail = 0;
const ok = (what, condition, detail = "") => {
  if (condition) { pass++; return; }
  fail++;
  console.log(`  FAIL: ${what}${detail ? `\n        ${detail}` : ""}`);
};

console.log("\n— Parsing a cell —");
ok("plain number", firstNumber("112") === "112");
ok("spaces are kept", firstNumber("116 123") === "116 123");
ok("takes the first alternative", firstNumber("112 or 999") === "112");
ok("handles 'and'", firstNumber("911 and 171") === "911");
ok("keeps the leading paren", firstNumber("(784) 456-1044") === "(784) 456-1044",
   "without it the output reads '784) 456-1044', which dials fine but looks broken");
ok("short codes are valid", firstNumber("988") === "988");
ok("three-digit zeros", firstNumber("000") === "000");
ok("star codes are valid", firstNumber("*4141") === "*4141");
ok("number plus instructions", firstNumber("171 option 6") === "171");
ok("no number at all", firstNumber("depends on town/city") === null);
ok("empty cell", firstNumber("") === null);
ok("absurdly long is rejected", firstNumber("1".repeat(30)) === null);

console.log("\n— Country codes —");
ok("France is FR, not FX", isoCode("France") === "FR",
   "Intl.of('FX') also returns 'France' and overwrites FR when you loop AA..ZZ");
ok("United Kingdom is GB, not UK", isoCode("United Kingdom") === "GB");
ok("Republic of Ireland is IE", isoCode("Republic of Ireland") === "IE");
ok("'and' vs '&'", isoCode("Antigua and Barbuda") === "AG");
ok("'Saint' vs 'St.'", isoCode("Saint Vincent and the Grenadines") === "VC");
ok("accents are ignored", isoCode("Åland") === "AX");
ok("unknown returns null", isoCode("Atlantis") === null);

console.log("\n— The built dataset —");
const all = JSON.parse(readFileSync("data/all.json", "utf8"));
const byCode = new Map(all.data.map((c) => [c.country, c]));

ok("a realistic number of countries", all.data.length > 200, `got ${all.data.length}`);
ok("every code is two uppercase letters", all.data.every((c) => /^[A-Z]{2}$/.test(c.country)));
ok("no historic or reserved codes", !["FX", "UK", "EU", "SU", "YU", "AN"].some((c) => byCode.has(c)),
   "these resolve in Intl but no device ever reports them");
ok("codes are unique", new Set(all.data.map((c) => c.country)).size === all.data.length);
ok("every row has an emergency number", all.data.every((c) => c.emergency?.number));
ok("every emergency number has a digit", all.data.every((c) => /\d/.test(c.emergency.number)));
ok("crisis is a number or null",
   all.data.every((c) => c.crisis === null || /\d/.test(c.crisis.number)));
ok("every country has a region", all.data.every((c) => c.region));

// The two the sources must never get wrong: both are published by their own governments.
ok("Spain: 112 and 024",
   byCode.get("ES")?.emergency.number === "112" && byCode.get("ES")?.crisis.number === "024");
ok("United States: 911 and 988",
   byCode.get("US")?.emergency.number === "911" && byCode.get("US")?.crisis.number === "988");
ok("Spain's crisis line is not 717", byCode.get("ES")?.crisis.number !== "717",
   "a widely used pre-scraped dataset returns 717 here, which dials nowhere");

ok("France is present", byCode.has("FR"));
ok("United Kingdom is present", byCode.has("GB"));
ok("Ireland is present", byCode.has("IE"));
ok("no stray closing paren", all.data.every((c) => {
  const n = c.crisis?.number ?? "";
  return !n.includes(")") || n.includes("(");
}));
ok("notes never just repeat the number", all.data.every((c) =>
  !c.emergency.note || c.emergency.note.replace(/\s/g, "") !== c.emergency.number.replace(/\s/g, "")));

console.log("\n— The files on disk —");
const files = readdirSync("data/countries").filter((f) => f.endsWith(".json"));
ok("one file per country", files.length === all.data.length, `${files.length} files vs ${all.data.length} rows`);
ok("every file is valid JSON with a matching code", files.every((f) => {
  const c = JSON.parse(readFileSync(`data/countries/${f}`, "utf8"));
  return c.country === f.replace(".json", "");
}));
const regions = readdirSync("data/regions").filter((f) => f.endsWith(".json"));
ok("regions add up to every country",
   regions.reduce((n, f) => n + JSON.parse(readFileSync(`data/regions/${f}`, "utf8")).data.length, 0) === all.data.length);

console.log(fail === 0 ? `\n${pass} passed, 0 failed` : `\n${pass} passed, ${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
