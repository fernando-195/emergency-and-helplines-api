#!/usr/bin/env node
/**
 * Builds the dataset: emergency numbers and suicide crisis lines, per country, in one JSON.
 *
 *   node src/build.mjs
 *
 * Sources, both read straight from the Wikipedia API. Nothing else is called, and no third-party
 * scrape sits in between:
 *
 *   - List of emergency telephone numbers   → police / ambulance / fire per country
 *   - List of suicide crisis lines          → the national crisis line
 *
 * Both are rendered as real HTML tables, one cell per number. That matters. The popular pre-scraped
 * datasets parse the *prose* on the same pages with regular expressions, and prose loses: for Spain
 * one of them returns `717`, a fragment of the Teléfono de la Esperanza number (717 003 717) that
 * dials nowhere, and misses `024`, the official national line, entirely.
 *
 * Output:
 *   data/all.json              every country
 *   data/countries/XX.json     one file per ISO 3166-1 alpha-2 code
 *   data/regions/<region>.json one file per world region
 *   data/meta.json             source revisions, counts, build date
 */
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { isoCode, displayName, normalise, NO_ISO_CODE } from "./countries.mjs";

const WIKI_API = "https://en.wikipedia.org/w/api.php";
const PAGE_EMERGENCY = "List_of_emergency_telephone_numbers";
const PAGE_CRISIS = "List_of_suicide_crisis_lines";
const UA = "emergency-and-helplines-api (+https://github.com/fernando-195/emergency-and-helplines-api)";

// ─── Reading the sources ───────────────────────────────────────────────────────────────────────

async function wikipediaPage(title) {
  const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(title)}&format=json&prop=text|revid&formatversion=2`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`wikipedia ${title}: HTTP ${res.status}`);
  const body = await res.json();
  if (!body?.parse?.text) throw new Error(`wikipedia ${title}: no content`);
  return { html: body.parse.text, revision: body.parse.revid ?? null };
}

/** Strip markup, drop reference markers like `[193]`, collapse whitespace. */
const plain = (html) => html
  .replace(/<sup[\s\S]*?<\/sup>/g, "")
  .replace(/<style[\s\S]*?<\/style>/g, "")
  .replace(/<br\s*\/?>/gi, " ; ")
  .replace(/<[^>]+>/g, "")
  .replace(/&#91;[\s\S]*?&#93;/g, "")
  .replace(/&amp;/g, "&")
  .replace(/&nbsp;|&#160;|&#8194;/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Every table row on a page, with the section heading it sits under.
 *
 * The heading is what gives us regions for free: the crisis-lines page is organised as Africa,
 * Caribbean, Central America, North America, South America, Asia, Europe, Oceania. Walking the
 * document in order and remembering the last heading is enough, and it means the regions stay
 * correct if Wikipedia reorganises them.
 */
function tableRows(html) {
  const rows = [];
  let section = null;
  // Headings and tables, in document order.
  const chunks = [...html.matchAll(/<h[23][^>]*>[\s\S]*?<\/h[23]>|<table[^>]*wikitable[\s\S]*?<\/table>/g)];
  for (const [chunk] of chunks) {
    if (chunk.startsWith("<h")) { section = plain(chunk) || section; continue; }
    for (const tr of chunk.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...tr[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)]
        .map((m) => ({ attrs: m[1], text: plain(m[2]) }));
      if (cells.length < 2) continue;
      const country = /<a[^>]*title="([^"]+)"/.exec(tr[1])?.[1];
      if (country) rows.push({ country, cells, section });
    }
  }
  return rows;
}

// ─── Cleaning a number ─────────────────────────────────────────────────────────────────────────

/**
 * The first dialable number in a cell, or `null`.
 *
 * Cells say things like `112 or 999`, `911 and 171` or `171 option 6`. We take the **first** one,
 * which is the one the page itself puts first, and keep the whole cell as a note so nothing is lost:
 * `171 option 6` dials 171 and the note still tells you about the option.
 *
 * Short numbers are normal here (988, 000, 119, 116 123), so there is no minimum length. `*4141`
 * (Chile) and `#123` are real and dialable. The leading parenthesis of `(784) 456-1044` is included
 * on purpose: without it the output reads `784) 456-1044`, which dials fine but looks broken on
 * screen, and about ten Caribbean countries are written that way.
 */
export function firstNumber(cell) {
  if (!cell) return null;
  const firstAlternative = cell.split(/\s+(?:or|and|\/|;|,)\s+/i)[0];
  const m = /[*#(]?[\d(][\d\s().-]{1,17}/.exec(firstAlternative);
  if (!m) return null;
  let out = m[0].trim().replace(/[.\-\s]+$/, "");
  if (!out.includes("(")) out = out.replace(/\)/g, "").trim();     // stray ")" from a mid-cell cut
  if (!/\d/.test(out)) return null;
  return out.replace(/\D/g, "").length <= 15 ? out : null;
}

/** Keep the source text as a note only when it says more than the number itself. */
const noteFor = (cell, number) =>
  cell.replace(/\s/g, "") === number.replace(/\s/g, "") ? null : cell;

// ─── Build ─────────────────────────────────────────────────────────────────────────────────────

const emergencyPage = await wikipediaPage(PAGE_EMERGENCY);
const crisisPage = await wikipediaPage(PAGE_CRISIS);

const emergency = new Map();
const regionOf = new Map();
for (const { country, cells, section } of tableRows(emergencyPage.html)) {
  // The emergency page is organised by region too, and it covers the ~46 countries that have no
  // crisis line at all. Without this they landed in "other" and lost their continent, which makes
  // the per-region files wrong exactly where coverage is already thinnest.
  if (section) regionOf.set(country, section);
  // Columns are police | ambulance | fire. Countries with one unified number use a colspan cell.
  // When they are separate we prefer the AMBULANCE: that is the relevant service for self-harm or
  // overdose, which is what most callers of this dataset are building for. Police is the fallback.
  const body = cells.slice(1, 4);
  const unified = body.find((c) => /colspan="3"/.test(c.attrs));
  const cell = unified?.text || body[1]?.text || body[0]?.text || "";
  const number = firstNumber(cell);
  if (number) emergency.set(country, { number, note: noteFor(cell, number) });
}

const crisis = new Map();
for (const { country, cells, section } of tableRows(crisisPage.html)) {
  // The crisis page wins: its sections are the finer grouping (it splits the Americas).
  if (section) regionOf.set(country, section);
  const cell = cells[1]?.text ?? "";
  const number = firstNumber(cell);
  if (number) crisis.set(country, { number, note: noteFor(cell, number) });
}

const countries = [];
const unmapped = [];

for (const name of new Set([...emergency.keys(), ...crisis.keys()])) {
  const code = isoCode(name);
  if (!code) {
    if (!NO_ISO_CODE.has(normalise(name))) unmapped.push(name);
    continue;
  }
  const e = emergency.get(name);
  const c = crisis.get(name);

  /*
   No emergency number, no row. That half cannot be replaced with anything honest.

   A missing crisis line is a different thing entirely: several dozen countries genuinely have no
   national one, and dropping those rows would also throw away an emergency number we do have. So
   `crisis` is nullable and `emergency` is not.
  */
  if (!e) continue;

  countries.push({
    country: code,
    name: displayName(code),
    region: regionOf.get(name) ?? null,
    emergency: { number: e.number, note: e.note },
    crisis: c ? { number: c.number, note: c.note } : null,
  });
}

countries.sort((a, b) => a.country.localeCompare(b.country));

const byRegion = {};
for (const c of countries) {
  const key = c.region ? slug(c.region) : "other";
  (byRegion[key] ??= []).push(c);
}

const withCrisis = countries.filter((c) => c.crisis).length;
const meta = {
  generatedAt: new Date().toISOString().slice(0, 10),
  countries: countries.length,
  withCrisisLine: withCrisis,
  withoutCrisisLine: countries.length - withCrisis,
  regions: Object.fromEntries(Object.entries(byRegion).map(([k, v]) => [k, v.length])),
  sources: {
    emergency: { page: PAGE_EMERGENCY, revision: emergencyPage.revision, url: `https://en.wikipedia.org/wiki/${PAGE_EMERGENCY}` },
    crisis: { page: PAGE_CRISIS, revision: crisisPage.revision, url: `https://en.wikipedia.org/wiki/${PAGE_CRISIS}` },
    license: "Wikipedia text is CC BY-SA 4.0",
  },
  disclaimer:
    "Compiled from Wikipedia and provided as guidance, not as verified official data. Numbers " +
    "change. Verify against the official body of each country before relying on this where a " +
    "wrong number causes harm.",
};

rmSync("data", { recursive: true, force: true });
mkdirSync("data/countries", { recursive: true });
mkdirSync("data/regions", { recursive: true });

writeFileSync("data/meta.json", JSON.stringify(meta, null, 2) + "\n");
writeFileSync("data/all.json", JSON.stringify({ ...meta, data: countries }, null, 2) + "\n");
for (const c of countries) {
  writeFileSync(`data/countries/${c.country}.json`, JSON.stringify(c, null, 2) + "\n");
}
for (const [key, list] of Object.entries(byRegion)) {
  writeFileSync(`data/regions/${key}.json`, JSON.stringify({
    region: list[0].region ?? "Other",
    countries: list.length,
    generatedAt: meta.generatedAt,
    data: list,
  }, null, 2) + "\n");
}

console.log(`countries:        ${countries.length}`);
console.log(`with crisis line: ${withCrisis}`);
console.log(`regions:          ${Object.keys(byRegion).join(", ")}`);
if (unmapped.length) {
  console.log(`\nUnmapped country names (add them to src/countries.mjs):`);
  unmapped.forEach((n) => console.log(`  ${n}`));
}
