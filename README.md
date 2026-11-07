# jisa.user.js

_Jisa_ (時差) means "time difference" in Japanese.

A userscript that converts a selected time to every time zone and shows it in
a popup. The page itself is never modified.

| Selection                  | Popup (Asia/Tokyo)                  |
| -------------------------- | ----------------------------------- |
| `10:00 PST`                | `03:00 JST (+1d)`                   |
| `4pm – 6pm PT`             | `08:00–10:00 JST (+1d)` (DST aware) |
| `14:00 (UTC+05:30)`        | `17:30 JST`                         |
| `2026-11-06T10:00:00Z`     | `2026-11-06 19:00 JST`              |
| `Nov 05, 2026 - 15:00 UTC` | `2026-11-06 00:00 JST`              |
| `1:00–3:00pm Pacific Time` | `06:00–08:00 JST (+1d)`             |
| `tomorrow at noon ET`      | `2026-11-08 02:00 JST` (on Nov 6)   |
| `1762423200`               | `2025-11-06 19:00 JST` (Unix time)  |

`(+1d)` / `(-1d)` marks a date change relative to the source time zone.

## Usage

- Each time is shown in your local time zone, with how far it is from now.
  Click it to pick another zone; the search accepts `new york` or `EST`.
- The last three zones you picked are listed first and shown under every time.
- Selections inside text fields work too.
- Up to 20 times are shown at once.

## Install

Install [Tampermonkey](https://www.tampermonkey.net/) or
[Violentmonkey](https://violentmonkey.github.io/), then click
[jisa.user.js](https://github.com/oooooooo/jisa.user.js/raw/refs/heads/main/jisa.user.js)
to install the script.

The script stores recently picked zones with `GM_getValue` and `GM_setValue`
so they are shared across sites.

The script uses [Temporal](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Temporal),
so the browser must support it.

## What it reads

- Zones: abbreviations (`PST`, `CET`, `AoE`, ...), spelled-out names
  (`Pacific Time`, `Japan Standard Time`), IANA names (`Europe/London`),
  `UTC±N` (also `UTC + 9`, `UTC−5`, `UTC+5.5`, `GMT+5.30`), `Z` and numeric
  offsets, optionally followed by their abbreviation (`-0500 EST`).
- Times: `10:00`, `3pm`, `17.00`, `10：30`, `午後3時`, `noon`, `midnight`, and
  ranges such as `4-6pm`, `10:00 until 11:00`, or `11pm–3am` across midnight.
- Dates before or after the time: ISO 8601, `2026/07/01`, `07/01/2026`,
  `1.7.2026`, `Nov 5, 2026`, `the 20th of November`, `2026年11月6日`,
  `today`, `tomorrow`, and weekdays.
- Unix timestamps in seconds or milliseconds, when selected on their own.
- A time without a zone is read as local time when no zoned time is selected.

## Notes

- Ambiguous abbreviations use the common English meaning: `CST` is US Central,
  `IST` is India. Abbreviations that are also words (`EST`, `IST`, `CAT`, ...)
  count only in capitals.
- A numeric date both America and Europe could have written, such as
  `07/01/2026`, gives two results, labelled `as July 1` and `as 7 January`.
  `25/12/2026` and `1.7.2026` (dots are day first) give one.
- Dates without a year get the year closest to today; a weekday means the
  coming one.
- Offsets beyond -12:00 and +14:00 are rejected.
- A time skipped by a DST change moves forward, and a repeated time uses the
  earlier one.

## Development

Requires Node.js 26 or later (pinned in `mise.toml`).

```sh
pnpm install
pnpm test
pnpm lint
```

## License

[MIT](LICENSE)
