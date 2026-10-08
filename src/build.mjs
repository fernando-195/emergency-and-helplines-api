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
/**
 * The country a row is about, taken from its first link.
 *
 * Normally the link's `title` (the article it points at) IS the country, and it is the better of
 * the two: it carries the canonical spelling. The visible text drifts (`Turkiye` for Turkey,
 * `Sao Tome and Principe` without its accents) and on navbox rows it is junk like `v`. It is also
 * the join key between the two Wikipedia pages, so swapping it for the text would split a country
 * in half: the emergency page would file Turkey under `Turkey` and the crisis page under
 * `Turkiye`, and the merge would emit TR twice, each missing the other's number.
 *
 * The exception is a territory whose article link points at its parent country:
 *
 *   <a title="Australia">Cocos (Keeling) Islands</a>
 *
 * Read by title, that row is Australia, so the Cocos Islands vanished from the dataset and their
 * 000 was written over Australia's. Both say 000, which is why nothing looked wrong.
 *
 * So the text only wins when both resolve to a country AND they are different countries, which is
 * the pathology itself and nothing else: measured over both pages today, that is one row out of
 * 475. Where the two spellings mean the same country the title stays, and the join key with it.
 */
function nombreDeLaFila(fila) {
  const m = /<a[^>]*title="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(fila);
  if (!m) return /<a[^>]*title="([^"]+)"/.exec(fila)?.[1];
  const titulo = m[1];
  const texto = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const porTitulo = isoCode(titulo);
  const porTexto = texto ? isoCode(texto) : null;
  return porTexto && porTitulo && porTexto !== porTitulo ? texto : titulo;
}

function tableRows(html) {
  const rows = [];
  let section = null;
  // Headings and tables, in document order.
  const chunks = [...html.matchAll(/<h[23][^>]*>[\s\S]*?<\/h[23]>|<table[^>]*wikitable[\s\S]*?<\/table>/g)];
  for (const [chunk] of chunks) {
    if (chunk.startsWith("<h")) { section = plain(chunk) || section; continue; }
    /*
     `<tr[^>]*>` and not `<tr>`: Wikipedia puts attributes on rows whenever an editor touches the
     styling (`<tr style="vertical-align: top;">`), and a row that gets one used to vanish from the
     dataset without a word. That is how the United States lost its 988 line: one row out of 227
     picked up a style attribute. On 1 Oct 2026 the page had them on every row and the build came
     out with `with crisis line: 0`, which failed the test and killed two monthly refreshes in a
     row. A country that disappears should never be a silent event, so this stays permissive.
    */
    for (const tr of chunk.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...tr[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)]
        .map((m) => ({ attrs: m[1], text: plain(m[2]) }));
      if (cells.length < 2) continue;
      const country = nombreDeLaFila(tr[1]);
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
  /*
   An UNMATCHED "(" opens an annotation, not part of the number, so the number ends there. What
   separates the two is whether the bracket closes, not where it sits: `8 (017) 311-00-99` closes
   and is Belarus dialling out, `171 (Press 6` never closes because the regex above stopped at the
   letter. Cutting on position instead of on closure turned Belarus, Russia and Turkmenistan into
   the single digit `8`, which is why this is written the long way. Wikipedia reworded a dozen cells from `171 option 6` to `171 (Press 6)` and the
   number came out as `171 (`: a dialable string with a bracket glued to it, in a dataset whose
   whole job is numbers people dial in an emergency. Measured on both pages today it also produced
   `119 (`, `113 (`, `16000 (`, `000 (`, `911 (` and `0800 58 58 58 (5`.

   The leading parenthesis stays untouched: `(784) 456-1044` is how about ten Caribbean countries
   write their line, and cutting there would leave them with a single digit.
  */
  for (let i = out.indexOf("("); i !== -1; i = out.indexOf("(", i + 1)) {
    if (out.indexOf(")", i) === -1) { out = out.slice(0, i).replace(/[.\-\s]+$/, ""); break; }
  }
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

/**
 * Numbers pinned against the source, with the reason and the date it was decided.
 *
 * A pin is a claim that we know better than Wikipedia, and it is the kind of claim that goes stale
 * in silence: if Samaritans ever changed their number, this would keep serving the old one for
 * years and the build would stay green. So it is kept to the smallest possible list, every entry
 * carries why and when, and every run PRINTS what it overrode and what the page actually said.
 * Reading the log is how you find out the pin has drifted.
 */
const PINNED = {
  GB: {
    crisis: { number: "116 123", note: null },
    why: "On 8 Oct 2026 Wikipedia moved CALM (0800 58 58 58) ahead of Samaritans. Both are real "
      + "UK lines, but CALM answers 5pm to midnight and 116 123 is free and answered around the "
      + "clock. This dataset is read by people looking for a number at any hour, so the 24h line "
      + "is the one that belongs in the field. Revisit if Samaritans stops being 24h.",
  },
};

for (const c of countries) {
  const pin = PINNED[c.country]?.crisis;
  if (!pin) continue;
  const said = c.crisis?.number ?? "nothing";
  c.crisis = { ...pin };
  if (said !== pin.number) console.log(`pinned ${c.country} crisis to ${pin.number} (the page says ${said})`);
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
