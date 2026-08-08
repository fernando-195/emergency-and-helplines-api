<div align="center">

```
    ███████╗ ██████╗ ███████╗     ██╗ ███████╗ ██████╗ ███╗   ██╗
    ██╔════╝██╔═══██╗██╔════╝    ██╔╝ ██╔════╝██╔═══██╗████╗  ██║
    ███████╗██║   ██║███████╗   ██╔╝  ███████╗██║   ██║██╔██╗ ██║
    ╚════██║██║   ██║╚════██║  ██╔╝   ╚════██║██║   ██║██║╚██╗██║
    ███████║╚██████╔╝███████║ ██╔╝    ███████║╚██████╔╝██║ ╚████║
    ╚══════╝ ╚═════╝ ╚══════╝ ╚═╝     ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝

         ┌───────────────────────────────────────────────┐
         │  ☎  emergency numbers  +  ☎  crisis lines     │
         │     245 countries · one JSON · no API key     │
         └───────────────────────────────────────────────┘
```

# Emergency Numbers & Suicide Helplines API

**A free JSON API and open dataset of emergency phone numbers and suicide crisis lines for 245 countries.**<br>
Query one country, one region, or grab everything. No key. No rate limit. No sign-up.

[![Refresh dataset](https://github.com/fernando-195/emergency-and-helplines-api/actions/workflows/refresh.yml/badge.svg)](https://github.com/fernando-195/emergency-and-helplines-api/actions/workflows/refresh.yml)
[![License: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](LICENSE)
[![Data: CC BY-SA](https://img.shields.io/badge/data-CC%20BY--SA%204.0-blue.svg)](https://creativecommons.org/licenses/by-sa/4.0/)
[![API key](https://img.shields.io/badge/API%20key-not%20required-brightgreen)](#-quick-start)
[![Countries](https://img.shields.io/badge/countries-245-brightgreen)](data/all.json)
[![Crisis lines](https://img.shields.io/badge/crisis%20lines-199-brightgreen)](data/all.json)

</div>

---

```bash
curl https://cdn.jsdelivr.net/gh/fernando-195/emergency-and-helplines-api@main/data/countries/ES.json
```

```json
{
  "country": "ES",
  "name": "Spain",
  "region": "Europe",
  "emergency": { "number": "112", "note": null },
  "crisis":    { "number": "024", "note": null }
}
```

That is the whole API. Static JSON on a CDN, one file per country.

---

## 🤔 Why this exists

If you build anything that might be open when someone is having a bad night — a wellness app, a chatbot, a support desk, a travel or dating app — sooner or later you need two phone numbers for the user's country:

- **Who to call in an emergency.**
- **Who to call when someone is thinking about suicide.**

Those are two different lists, and until now neither was usable as-is:

```
   emergency-number datasets  ──►  no crisis lines
   crisis-line directories    ──►  websites, not data (and the APIs charge)
   pre-scraped GitHub dumps   ──►  regex over prose, and it shows
```

That last one deserves a number. A widely used scraped dataset returns **`717`** for Spain. That is a fragment of the Teléfono de la Esperanza number (`717 003 717`), it dials nowhere, and it misses **`024`** — Spain's official national line, published by the Ministry of Health — entirely.

This repo joins both lists, keys them by the country code your device actually reports, cleans the numbers so they dial, and commits the result as plain JSON that anyone can read, diff and fork.

## 📊 How it compares

|  | This project | Paid helpline APIs | Scraped GitHub dumps |
| --- | :---: | :---: | :---: |
| Price | **Free forever** | Paid tiers | Free |
| API key | **None** | Required | n/a |
| Rate limit | **None** (CDN) | Yes | n/a |
| Emergency numbers | **✅** | Sometimes | ✅ |
| Suicide crisis lines | **✅** | ✅ | Partial |
| Query one country | **✅** | ✅ | ❌ download all |
| Query one region | **✅** | Rarely | ❌ |
| Keyed by ISO 3166-1 | **✅** | ✅ | ❌ country names |
| Auto-refreshed | **✅ quarterly** | ✅ | ❌ frozen |
| Changes visible in a diff | **✅** | ❌ | ❌ |
| Works offline | **✅** | ❌ | ✅ |
| Self-hostable | **✅** | ❌ | ✅ |

## 🚀 Quick start

Every path below is a static file on a CDN. No sign-up, no key, no limit.

| What you want | Path |
| --- | --- |
| 🇪🇸 One country | `/data/countries/ES.json` |
| 🌍 One region | `/data/regions/europe.json` |
| 🌐 Everything | `/data/all.json` |
| ℹ️ Just metadata | `/data/meta.json` |

Base URL, pick either:

```
https://cdn.jsdelivr.net/gh/fernando-195/emergency-and-helplines-api@main
https://raw.githubusercontent.com/fernando-195/emergency-and-helplines-api/main
```

**Use the jsDelivr URL in production.** It matters for a reason that is not obvious: jsDelivr pulls
each file from GitHub **once** and then serves it from its own global CDN. Ten thousand users asking
for `ES.json` are ten thousand requests to jsDelivr and **zero to this repository**. It is free,
unmetered, and built for exactly this.

`raw.githubusercontent.com` is fine for development and scripts. It is not a CDN, GitHub applies its
own limits to whoever is calling, and it is not the right thing to point a shipped app at.

### Caching, and how fresh the data is

| | |
| --- | --- |
| Dataset rebuild | every 3 months (and on any push) |
| jsDelivr cache on `@main` | up to **12 hours** |
| jsDelivr cache on a pinned tag | forever (that is the point of pinning) |

So an update takes up to about half a day to reach everyone. That is the right trade for a dataset
that changes a few times a year, and you can force it early:

```bash
# Purge one file from jsDelivr's cache
curl https://purge.jsdelivr.net/gh/fernando-195/emergency-and-helplines-api@main/data/countries/ES.json
```

**Pin a version if you want reproducible builds.** Replace `@main` with a tag and the file is frozen
and cached permanently:

```
https://cdn.jsdelivr.net/gh/fernando-195/emergency-and-helplines-api@v1.0.0/data/countries/ES.json
```

### JavaScript / TypeScript

```js
const BASE = "https://cdn.jsdelivr.net/gh/fernando-195/emergency-and-helplines-api@main";

// The visitor's own country, straight from the browser
const region = new Intl.Locale(navigator.language).region ?? "US";
const res = await fetch(`${BASE}/data/countries/${region}.json`);

if (res.ok) {
  const { emergency, crisis } = await res.json();
  console.log(emergency.number);        // "112"
  console.log(crisis?.number ?? null);  // "024", or null where no national line exists
}
```

### Python

```python
import requests

BASE = "https://cdn.jsdelivr.net/gh/fernando-195/emergency-and-helplines-api@main"
data = requests.get(f"{BASE}/data/countries/BR.json").json()

print(data["emergency"]["number"])   # 192
print(data["crisis"]["number"])      # 188
```

### Swift (iOS)

```swift
let base = URL(string: "https://cdn.jsdelivr.net/gh/fernando-195/emergency-and-helplines-api@main")!
let code = Locale.current.region?.identifier ?? "US"

let (data, _) = try await URLSession.shared.data(from: base.appending(path: "data/countries/\(code).json"))
let country = try JSONDecoder().decode(Country.self, from: data)
```

### Command line

```bash
npx github:fernando-195/emergency-and-helplines-api ES        # one country, by ISO code
npx github:fernando-195/emergency-and-helplines-api Spain     # one country, by name
npx github:fernando-195/emergency-and-helplines-api europe    # a whole region
npx github:fernando-195/emergency-and-helplines-api ES --json # raw JSON, for piping
npx github:fernando-195/emergency-and-helplines-api --list    # every country
```

```
$ npx github:fernando-195/emergency-and-helplines-api HR

Croatia (HR) · Europe
emergency    112   (112 or 194)
crisis       0800 655 222
```

## 📦 Response schema

```jsonc
{
  "country": "EC",              // ISO 3166-1 alpha-2, uppercase
  "name": "Ecuador",            // English display name
  "region": "South America",    // Africa | Asia | Caribbean | Central America |
                                // Europe | North America | Oceania | South America
  "emergency": {
    "number": "911",            // always present, always dialable
    "note": null                // source text, when it says more than the number
  },
  "crisis": {
    "number": "171",
    "note": "171 option 6"      // kept, because that instruction matters when you call
  }
}
```

Two things to know before you write code against this:

> **`crisis` can be `null`.** About 46 countries have no national suicide crisis line at all. That is a fact about those countries, not a gap in the data. `emergency` is never null: if a country has no usable emergency number in the source, the row is not published.

> **`note` carries what the number alone loses.** `171 option 6`, `112 or 194`, carrier-specific variants. It is `null` when the source cell was just the number.

## 🌍 Coverage

```
  Africa           ████████████████████████████  59
  Europe           ██████████████████████████    54
  Asia             █████████████████████████     51
  Caribbean        ██████████████                29
  Oceania          ███████████                   23
  South America    ███████                       15
  Central America  ████                           8
  North America    ██                             5
                   ─────────────────────────────────
                                          total  245
```

| | |
| --- | --- |
| Countries and territories | **245** |
| With a national crisis line | **199** |
| Emergency number only | **46** |

## 🔧 Build it yourself

```bash
git clone https://github.com/fernando-195/emergency-and-helplines-api
cd emergency-and-helplines-api

node src/build.mjs    # fetch from Wikipedia, parse, write data/
node src/test.mjs     # 38 checks on the parser and the output
```

The build reads two Wikipedia pages through the official API and parses their **HTML tables**, one cell per number, never the surrounding prose. It joins them on country, resolves each to ISO 3166-1 alpha-2, and writes one file per country, one per region, and one for everything.

It refreshes automatically every three months via GitHub Actions and **commits the diff**, so when a number changes you can see exactly what moved and when.

### 🪤 Three traps this handles for you

<details>
<summary><b>1. <code>Intl</code> hands you country codes no device ever sends</b></summary>

<br>

The obvious way to map a country name to a code is to loop over every `AA`…`ZZ` pair and ask `Intl.DisplayNames` what it is. Do that and you get:

```js
Intl.DisplayNames(['en'], {type:'region'}).of('FX')  // "France"          ← historic code
Intl.DisplayNames(['en'], {type:'region'}).of('UK')  // "United Kingdom"  ← not an ISO code
```

Alphabetically, `FX` overwrites `FR` and `UK` overwrites `GB`. Your dataset ends up keyed by codes that no phone, browser or `Locale` API ever reports, and **France and the United Kingdom silently never match**. They are right there in the file. They just never resolve.

</details>

<details>
<summary><b>2. Country names differ between every source</b></summary>

<br>

`Intl` writes `Antigua & Barbuda` and `St. Vincent & Grenadines`. Wikipedia writes `Antigua and Barbuda` and `Saint Vincent and the Grenadines`. Without normalising `&`/`and`, `St.`/`Saint` and accents, **every island nation with a compound name disappears** from the dataset, and Ireland goes with them (`Republic of Ireland` vs `Ireland`).

</details>

<details>
<summary><b>3. Short numbers are correct, so length checks destroy data</b></summary>

<br>

`988`, `000`, `119`, `116 123`, `*4141`. Emergency and crisis lines are short **by design** so they are easy to remember under stress. Any sanity check with a minimum digit count throws away real, working crisis lines. The only length rule here is an upper bound.

Also: `(784) 456-1044` must keep its opening parenthesis. Start the match at the first digit and you publish `784) 456-1044`, which dials fine and looks broken, across about ten Caribbean countries.

</details>

## ❓ FAQ

<details>
<summary><b>Is it really free? What's the catch?</b></summary>
<br>
Yes. There is no server: the data is static JSON in a public Git repo, served by GitHub and jsDelivr. There is nothing to meter, so there is nothing to charge for. The catch is the data's provenance, which is documented below in plain terms.
</details>

<details>
<summary><b>Do I need an API key or a token?</b></summary>
<br>
No. It is a file on a CDN. <code>fetch</code> it.
</details>

<details>
<summary><b>Is there a rate limit?</b></summary>
<br>
Not from this project. jsDelivr is a CDN built for exactly this, and it never re-asks GitHub per visitor. If you point at <code>raw.githubusercontent.com</code> instead, GitHub's own limits apply to <em>you</em>, the caller. Use the jsDelivr URL in production.
</details>

<details>
<summary><b>Will heavy use of this dataset cost the repo owner anything?</b></summary>
<br>
No. jsDelivr serves its own copy, so traffic never reaches this repository. Public repositories also get unlimited GitHub Actions minutes, so the quarterly rebuild is free. The whole dataset is a couple of megabytes of JSON.
</details>

<details>
<summary><b>How do I get an update immediately instead of waiting for the cache?</b></summary>
<br>
<code>curl https://purge.jsdelivr.net/gh/fernando-195/emergency-and-helplines-api@main/data/countries/ES.json</code>, or pin a version tag and update it when you choose.
</details>

<details>
<summary><b>Can I bundle the data in my app instead of fetching it?</b></summary>
<br>
Yes, and for a crisis screen you probably should: it must work with no network. Ship <code>data/all.json</code> inside your app as a floor and refresh from the CDN in the background. Attribute Wikipedia (CC BY-SA 4.0).
</details>

<details>
<summary><b>How often is it updated?</b></summary>
<br>
Automatically every three months, plus any time someone opens a PR. Each refresh is a commit, so the history shows what changed.
</details>

<details>
<summary><b>Why is <code>crisis</code> null for some countries?</b></summary>
<br>
Because those countries have no national suicide crisis line. Roughly 46 of them. Publishing a made-up number there would be worse than publishing none.
</details>

<details>
<summary><b>Can I use this in a commercial product?</b></summary>
<br>
Yes. The code is MIT. The data is derived from Wikipedia and is CC BY-SA 4.0, so if you redistribute the dataset itself, attribute Wikipedia and keep the same licence.
</details>

## ⚠️ Limitations, in plain terms

This is compiled from Wikipedia. It is **guidance, not verified official data**.

- Numbers change, and Wikipedia lags. The quarterly rebuild reduces that. It does not remove it.
- Where a country lists several numbers, this takes the first one the source lists and keeps the rest in `note`.
- Some numbers are region-specific inside a country, or only reachable from certain networks.
- **Nothing here has been dialled by a human.**

If you are shipping this somewhere a wrong number causes harm, verify the countries you actually launch in against each country's official body, and treat this dataset as the starting point that saves you the legwork. That is exactly what it is for.

> **This project is not a crisis service.** If you or someone you know is in danger right now, call your local emergency number.

## 🤝 Contributing

Corrections are very welcome, especially from people who know their own country's lines.

- **Wrong number?** The fix belongs on Wikipedia first, since that is the source. Open an issue here too so it gets picked up in the next build.
- **Country missing?** Run `node src/build.mjs` and read the `Unmapped country names` list it prints. Add the alias to `src/countries.mjs` and send a PR.
- **Parsing bug?** Add a failing case to `src/test.mjs`, then fix it.

## 📄 License

Code: [MIT](LICENSE). Data: derived from Wikipedia, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

---

<div align="center">
<sub>

**Free emergency numbers API** · **suicide hotline API** · **crisis line by country** · **helpline directory JSON** · **911 112 999 000 emergency numbers dataset** · **mental health crisis numbers by country** · **suicide prevention lifeline API no key** · **ISO 3166 country emergency contacts** · **open data helplines** · **free alternative to paid helpline APIs**

</sub>
</div>
