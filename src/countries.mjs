/**
 * Country name → ISO 3166-1 alpha-2, the way phones actually report it.
 *
 * This file exists because of one bug that cost a lot of time and is completely invisible when you
 * look at the output.
 *
 * ## The FX / UK trap
 *
 * The obvious way to build a name → code map is to loop over every AA…ZZ pair and ask
 * `Intl.DisplayNames` what it is called. That works, and it quietly poisons two of the biggest
 * markets in the world:
 *
 *   Intl.DisplayNames(['en'], {type:'region'}).of('FX')  // → "France"           (metropolitan France, historic)
 *   Intl.DisplayNames(['en'], {type:'region'}).of('UK')  // → "United Kingdom"   (not an ISO code at all)
 *
 * Because the loop runs alphabetically, `FX` overwrites `FR` and `UK` overwrites `GB`. Your dataset
 * ends up with rows keyed `FX` and `UK` — codes that **no phone, browser or `Locale` API will ever
 * send you**. France and the United Kingdom are right there in the file, and they never match.
 *
 * So: exceptional and historic codes are skipped, first match wins, and the hand-written alias table
 * always beats `Intl`.
 */

/**
 * Codes `Intl` happily resolves but that are not ISO 3166-1 alpha-2 country codes you will ever
 * receive from a device. Historic (SU, YU, ZR…), exceptional reservations (UK, EU, EZ, QO) and
 * transitional ones.
 */
const NOT_REAL_ALPHA2 = new Set([
  "FX", "UK", "EU", "EZ", "QO", "SU", "AN", "CS", "YU", "ZR", "BU", "DD", "NT", "TP", "WK",
]);

/**
 * Normalise a country name for comparison.
 *
 * `Intl` writes "Antigua & Barbuda" and "St. Vincent & Grenadines"; Wikipedia writes
 * "Antigua and Barbuda" and "Saint Vincent and the Grenadines". Without this, every island nation
 * with a compound name silently disappears from the dataset.
 */
export const normalise = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*&\s*/g, " and ")
    .replace(/\bst\.?\s/g, "saint ")
    .replace(/[.,'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const byName = new Map();
for (let a = 65; a <= 90; a++) {
  for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a) + String.fromCharCode(b);
    if (NOT_REAL_ALPHA2.has(code)) continue;
    try {
      const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
      // First match wins, so a later alias can never overwrite a canonical code.
      if (name && name !== code && !byName.has(normalise(name))) byName.set(normalise(name), code);
    } catch { /* not a valid region subtag */ }
  }
}

/**
 * Names Wikipedia uses that `Intl` spells differently, plus the ones it has no name for.
 *
 * Everything here was found by reading the "unmapped" list the build prints. If you add a source
 * and something goes missing, that list is where it will be.
 */
const ALIASES = {
  "united states": "US", "the united states": "US",
  "korea": "KR", "south korea": "KR", "north korea": "KP",
  "russia": "RU", "vietnam": "VN", "czech republic": "CZ", "czechia": "CZ",
  "turkey": "TR", "turkiye": "TR",
  // The four nations report GB, not their own code.
  "england": "GB", "scotland": "GB", "wales": "GB", "northern ireland": "GB",
  "united kingdom": "GB", "great britain": "GB",
  "republic of ireland": "IE",
  "france": "FR",
  "the bahamas": "BS", "the gambia": "GM", "the netherlands": "NL", "netherlands": "NL",
  "ivory coast": "CI", "cape verde": "CV", "east timor": "TL", "swaziland": "SZ",
  "burma": "MM", "myanmar": "MM",
  "macedonia": "MK", "north macedonia": "MK",
  "syria": "SY", "iran": "IR", "laos": "LA", "moldova": "MD", "brunei": "BN",
  "bolivia": "BO", "venezuela": "VE", "tanzania": "TZ", "vatican city": "VA",
  "democratic republic of the congo": "CD", "republic of the congo": "CG",
  "palestine": "PS",
  "georgia (country)": "GE",
  "hong kong": "HK", "macau": "MO", "macao": "MO",
  "aland": "AX",
  "federated states of micronesia": "FM",
  "svalbard": "SJ",
  "collectivity of saint martin": "MF",
  "saint vincent and the grenadines": "VC",
  "united states virgin islands": "VI",
  "south georgia and the south sandwich islands": "GS",
};

/**
 * Places that appear in the sources but have **no ISO 3166-1 alpha-2 code**, so no device will ever
 * report them. Listed explicitly so they show up as "known and skipped" instead of "mysteriously
 * missing".
 */
export const NO_ISO_CODE = new Set([
  "abkhazia", "south ossetia", "transnistria", "northern cyprus",
  "akrotiri and dhekelia", "quebec",
]);

/** ISO 3166-1 alpha-2 for a country name, or `null`. Aliases win over `Intl`. */
export function isoCode(countryName) {
  const key = normalise(countryName);
  return ALIASES[key] ?? byName.get(key) ?? null;
}

/** English display name for a code, for humans reading the JSON. */
export function displayName(code) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
