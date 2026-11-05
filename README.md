# tz.user.js

A userscript that shows the JST (UTC+9) equivalent of a selected time in a
popup. The page itself is never modified.

| Selection              | Popup                               |
| ---------------------- | ----------------------------------- |
| `10:00 PST`            | `03:00 JST (+1d)`                   |
| `4pm – 6pm PT`         | `08:00–10:00 JST (+1d)` (DST aware) |
| `14:00 (UTC+05:30)`    | `17:30 JST`                         |
| `2026-11-06T10:00:00Z` | `2026-11-06 19:00 JST`              |

`(+1d)` / `(-1d)` marks a date change relative to the source time zone.
Each row has a Copy button that copies the JST time. Close the popup with
the × button, by clicking anywhere else, or with Escape.

## Install

Install [Tampermonkey](https://www.tampermonkey.net/) or
[Violentmonkey](https://violentmonkey.github.io/), then open `tz.user.js`.

## Notes

- Times need a zone: an abbreviation (`PST`, `CET`, ...), `UTC±N`, `Z` or a
  numeric offset. Bare times like `10:00` are ignored.
- Copying uses the Clipboard API, or a copy event on http pages.
- Ambiguous abbreviations use the common English meaning: `CST` is US Central,
  `IST` is India.
- Dates without a year get the year closest to today.

## Development

```sh
pnpm install
pnpm test
pnpm lint
```
