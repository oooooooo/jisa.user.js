# tz.user.js

A userscript that converts a selected time to your time zone and shows it in
a popup. The page itself is never modified.

| Selection                  | Popup (Asia/Tokyo)                  |
| -------------------------- | ----------------------------------- |
| `10:00 PST`                | `03:00 JST (+1d)`                   |
| `4pm – 6pm PT`             | `08:00–10:00 JST (+1d)` (DST aware) |
| `14:00 (UTC+05:30)`        | `17:30 JST`                         |
| `2026-11-06T10:00:00Z`     | `2026-11-06 19:00 JST`              |
| `Nov 05, 2026 - 15:00 UTC` | `2026-11-06 00:00 JST`              |

`(+1d)` / `(-1d)` marks a date change relative to the source time zone.

## Usage

- Select a time on any page to open the popup.
- Pick the target time zone from the popup. The default is your local time
  zone, and the choice is kept across sites.
- Copy a converted time with its Copy button.
- Close the popup with the × button, by clicking anywhere, or with Escape.

## Install

Install [Tampermonkey](https://www.tampermonkey.net/) or
[Violentmonkey](https://violentmonkey.github.io/), then open `tz.user.js`.

The script uses [Temporal](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Temporal),
so the browser must support it.

## Notes

- Times need a zone: an abbreviation (`PST`, `CET`, ...), `UTC±N`, `Z` or a
  numeric offset. Bare times like `10:00` are ignored.
- Ambiguous abbreviations use the common English meaning: `CST` is US Central,
  `IST` is India.
- Dates without a year get the year closest to today.
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
