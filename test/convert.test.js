import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { findTimes, parseSelection } = require("../jisa.user.js");

const WINTER = Temporal.Instant.from("2026-01-15T00:00:00Z");
const SUMMER = Temporal.Instant.from("2026-07-15T00:00:00Z");

const TOKYO = "Asia/Tokyo";

const jstOf = (text, now = WINTER) =>
	findTimes(text, now, TOKYO).map((time) => time.converted);

const convertTo = (timeZone, text, now = WINTER) =>
	findTimes(text, now, timeZone).map((time) => time.converted);

describe("findTimes", () => {
	it.each([
		["10:00 PST", "03:00 JST (+1d)"],
		["10:00 PDT", "02:00 JST (+1d)"],
		["3pm EST", "05:00 JST (+1d)"],
		["3:30 p.m. EST", "05:30 JST (+1d)"],
		["9:30 AM UTC", "18:30 JST"],
		["12:00 am UTC", "09:00 JST"],
		["12pm UTC", "21:00 JST"],
		["10:00 GMT", "19:00 JST"],
		["10:00 GMT+2", "17:00 JST"],
		["10:00 UTC+05:30", "13:30 JST"],
		["10:00 UTC-3", "22:00 JST"],
		["23:00 CET", "07:00 JST (+1d)"],
		["14:00 (UTC)", "23:00 JST"],
		["10:00Z", "19:00 JST"],
		["10:00+0100", "18:00 JST"],
		["00:30 NZDT", "20:30 JST (-1d)"],
	])("converts %s to %s", (input, expected) => {
		expect(jstOf(input)).toEqual([expected]);
	});

	it("resolves generic US zones with DST depending on the date", () => {
		expect(jstOf("10:00 PT", WINTER)).toEqual(["03:00 JST (+1d)"]);
		expect(jstOf("10:00 PT", SUMMER)).toEqual(["02:00 JST (+1d)"]);
		expect(jstOf("9am ET", SUMMER)).toEqual(["22:00 JST"]);
	});

	it("converts time ranges and uses the start time for the day shift", () => {
		expect(jstOf("10:00-11:00 UTC")).toEqual(["19:00–20:00 JST"]);
		expect(jstOf("4pm – 6pm PST")).toEqual(["09:00–11:00 JST (+1d)"]);
		expect(jstOf("14:00 to 16:00 UTC")).toEqual(["23:00–01:00 JST"]);
	});

	it("converts ISO 8601 timestamps including the date", () => {
		expect(jstOf("2026-11-06T10:00:00Z")).toEqual(["2026-11-06 19:00 JST"]);
		expect(jstOf("2026-11-06T20:30:00.123-05:00")).toEqual([
			"2026-11-07 10:30 JST",
		]);
		expect(jstOf("2026-12-31 20:00 UTC")).toEqual(["2027-01-01 05:00 JST"]);
	});

	it("uses the date of the timestamp to resolve DST for generic zones", () => {
		expect(jstOf("2026-07-01 10:00 PT")).toEqual(["2026-07-02 02:00 JST"]);
	});

	it.each([
		["Nov 6, 2026 10:00 PM PST", "2026-11-07 15:00 JST"],
		["November 6, 2026 at 10:00 AM EST", "2026-11-07 00:00 JST"],
		["Sept 30, 2026, 9:00 PM PDT", "2026-10-01 13:00 JST"],
		["Oct. 1st, 2026 8am UTC", "2026-10-01 17:00 JST"],
		["6 Nov 2026 10:00 UTC", "2026-11-06 19:00 JST"],
		["6th November 2026, 23:30 GMT", "2026-11-07 08:30 JST"],
		["Nov 6, 2026 10:00-11:00 UTC", "2026-11-06 19:00–20:00 JST"],
		["Nov 05, 2026 - 15:00 UTC", "2026-11-06 00:00 JST"],
		["Nov 5, 2026 – 3pm UTC", "2026-11-06 00:00 JST"],
		["5 Nov 2026 @ 15:00 UTC", "2026-11-06 00:00 JST"],
	])("converts the month-name date %s to %s", (input, expected) => {
		expect(jstOf(input)).toEqual([expected]);
	});

	it("picks the year closest to now when the year is omitted", () => {
		expect(jstOf("Jul 1 10:00 PT")).toEqual(["2026-07-02 02:00 JST"]);
		expect(jstOf("Dec 31 23:00 UTC")).toEqual(["2026-01-01 08:00 JST"]);
		expect(jstOf("2 Jan 10:00 UTC")).toEqual(["2026-01-02 19:00 JST"]);
	});

	it("includes the month-name date in the source", () => {
		expect(findTimes("Fri, Nov 6, 2026 10:00 PM PST.", WINTER, TOKYO)).toEqual([
			{
				source: "Nov 6, 2026 10:00 PM PST",
				converted: "2026-11-07 15:00 JST",
			},
		]);
	});

	it("returns every time in the text together with its source", () => {
		expect(
			findTimes("Meeting at 10:00 PST and 2026-11-06T10:00Z.", WINTER, TOKYO),
		).toEqual([
			{ source: "10:00 PST", converted: "03:00 JST (+1d)" },
			{ source: "2026-11-06T10:00Z", converted: "2026-11-06 19:00 JST" },
		]);
	});

	it.each([
		"10:00",
		"at 10 UTC",
		"UTC",
		"10:00 ESTIMATE",
		"version 1.10:00 UTC",
		"25:00 UTC",
		"10:61 UTC",
		"13pm UTC",
		"Feb 30, 2026 10:00 UTC",
		"Nov 6, 2026",
		"10:00+2400",
		"10:00+1260",
		"10:00 UTC+25",
		"10:00 GMT+5:60",
	])("finds nothing in %s", (input) => {
		expect(jstOf(input)).toEqual([]);
	});

	describe("target time zone", () => {
		it("labels the result with the zone abbreviation when there is one", () => {
			expect(convertTo("Europe/Paris", "10:00 UTC")).toEqual(["11:00 CET"]);
			expect(convertTo("Europe/London", "10:00 UTC", SUMMER)).toEqual([
				"11:00 BST",
			]);
			expect(convertTo("UTC", "10:00 PST")).toEqual(["18:00 UTC"]);
		});

		it("falls back to a GMT offset label", () => {
			expect(convertTo("Asia/Kolkata", "10:00 UTC")).toEqual([
				"15:30 GMT+5:30",
			]);
		});

		it("applies DST of the target zone", () => {
			expect(convertTo("America/New_York", "10:00 UTC", WINTER)).toEqual([
				"05:00 EST",
			]);
			expect(convertTo("America/New_York", "10:00 UTC", SUMMER)).toEqual([
				"06:00 EDT",
			]);
			expect(
				convertTo("America/New_York", "2026-07-01 10:00 UTC", WINTER),
			).toEqual(["2026-07-01 06:00 EDT"]);
		});

		// Temporal's "compatible" disambiguation, the same rule as Date.
		it("moves a time skipped by DST forward and picks the earlier of a repeated time", () => {
			expect(jstOf("2026-03-08 02:30 PT")).toEqual(["2026-03-08 19:30 JST"]);
			expect(jstOf("2026-11-01 01:30 PT")).toEqual(["2026-11-01 17:30 JST"]);
		});

		it("reads JST as a source zone", () => {
			expect(convertTo("America/New_York", "10:00 JST")).toEqual([
				"20:00 EST (-1d)",
			]);
		});

		it("defaults to the local time zone", () => {
			const local = Temporal.Now.timeZoneId();

			expect(findTimes("10:00 PST", WINTER)).toEqual(
				findTimes("10:00 PST", WINTER, local),
			);
		});
	});

	describe("fixes for wrong conversions", () => {
		it.each([
			["1:00–3:00pm PT", "06:00–08:00 JST (+1d)"],
			["9:30-10:30pm EST", "11:30–12:30 JST (+1d)"],
			["1:00 - 3:00 PM ET", "03:00–05:00 JST (+1d)"],
			["11:00-1:00pm ET", "01:00–03:00 JST (+1d)"],
		])(
			"lets the start of %s take the meridiem of its end",
			(input, expected) => {
				expect(jstOf(input)).toEqual([expected]);
			},
		);

		it.each([
			["10:00 UTC−5", "00:00 JST (+1d)"],
			["10:00 (UTC−05:00)", "00:00 JST (+1d)"],
			["10:00 UTC + 9", "10:00 JST"],
			["10:00 GMT +9", "10:00 JST"],
			["10:00 UTC+5.5", "13:30 JST"],
			["10:00 UTC+5:45", "13:15 JST"],
			["10:00 UTC+14", "05:00 JST"],
			["10:00 UTC - 5", "00:00 JST (+1d)"],
			["10:00 UTC - 11:00 UTC", "19:00–20:00 JST"],
		])("reads the offset in %s", (input, expected) => {
			expect(jstOf(input)).toEqual([expected]);
		});

		it.each(["10:00 UTC+15", "10:00 UTC+23", "10:00-1100 UTC"])(
			"rejects %s instead of guessing",
			(input) => {
				expect(jstOf(input)).toEqual([]);
			},
		);

		it("puts the end of an overnight range on the next day", () => {
			expect(jstOf("Mar 7, 2026 11pm–3am PT")).toEqual([
				"2026-03-08 16:00–19:00 JST",
			]);
		});

		it.each([
			["2026/07/01 10:00 PT", "2026-07-02 02:00 JST"],
			["NOV 05, 2026 - 15:00 UTC", "2026-11-06 00:00 JST"],
			["nov 5, 2026 15:00 UTC", "2026-11-06 00:00 JST"],
			["5 NOVEMBER 2026 15:00 UTC", "2026-11-06 00:00 JST"],
			["15:00 UTC on 2026-07-01", "2026-07-02 00:00 JST"],
			["10:00 PT on July 1, 2026", "2026-07-02 02:00 JST"],
			["10:00 PM – 1:00 AM PT on Nov 5, 2026", "2026-11-06 15:00–18:00 JST"],
		])("keeps the date of %s", (input, expected) => {
			expect(jstOf(input)).toEqual([expected]);
		});

		it("uses the date after the time to resolve DST", () => {
			expect(convertTo("America/New_York", "15:00 UTC on 2026-07-01")).toEqual([
				"2026-07-01 11:00 EDT",
			]);
		});

		it.each([
			["tomorrow at 3pm ET", "2026-01-16 05:00 JST"],
			["3pm ET tomorrow", "2026-01-16 05:00 JST"],
			["today at 10:00 UTC", "2026-01-15 19:00 JST"],
			["Yesterday 10:00 UTC", "2026-01-14 19:00 JST"],
		])("reads the relative day in %s", (input, expected) => {
			expect(jstOf(input)).toEqual([expected]);
		});
	});

	describe("more ways to write a time", () => {
		it.each([
			// Ranges whose start is a bare hour
			["4-6pm PT", "09:00–11:00 JST (+1d)"],
			["10–11am PST", "03:00–04:00 JST (+1d)"],
			["10:00 AM ET - 11:00 AM ET", "00:00–01:00 JST (+1d)"],
			["10:00 until 11:00 UTC", "19:00–20:00 JST"],
			["10:00 through 11:00 UTC", "19:00–20:00 JST"],
			// Position and offsets
			["Start:10:00 UTC", "19:00 JST"],
			["10:00 +09:00", "10:00 JST"],
			["Fri, 06 Nov 2026 10:00:00 -0500", "2026-11-07 00:00 JST"],
			// Zone names in any case, spelled out, or as IANA identifiers
			["10:00 utc", "19:00 JST"],
			["10:00 pst", "03:00 JST (+1d)"],
			["9:00 AM Pacific Time", "02:00 JST (+1d)"],
			["10:00 AM Eastern Standard Time", "00:00 JST (+1d)"],
			["10:00 Greenwich Mean Time", "19:00 JST"],
			["10:00 coordinated universal time", "19:00 JST"],
			["2026-11-06 10:00 Europe/London", "2026-11-06 19:00 JST"],
			["10:00 America/New_York", "00:00 JST (+1d)"],
			// More abbreviations
			["10:00 TRT", "16:00 JST"],
			["10:00 GST", "15:00 JST"],
			["10:00 SAST", "17:00 JST"],
			["10:00 CAT", "17:00 JST"],
			["10:00 EAT", "16:00 JST"],
			["10:00 WAT", "18:00 JST"],
			["10:00 PHT", "11:00 JST"],
			["10:00 AoE", "07:00 JST (+1d)"],
			// Other clock styles
			["17.00 CET", "01:00 JST (+1d)"],
			["4.30 p.m. GMT", "01:30 JST (+1d)"],
			["10：30 UTC", "19:30 JST"],
			["10時30分 UTC", "19:30 JST"],
			["午後3時 UTC", "00:00 JST (+1d)"],
			["noon PT", "05:00 JST (+1d)"],
			["12 noon ET", "02:00 JST (+1d)"],
			["midnight UTC", "09:00 JST"],
			// Other date styles
			["Feb 29 3pm UTC", "2024-03-01 00:00 JST"],
			["Monday 10:00 UTC", "2026-01-19 19:00 JST"],
			["Thu at 10:00 UTC", "2026-01-15 19:00 JST"],
			["25/12/2026 10:00 UTC", "2026-12-25 19:00 JST"],
			["1.7.2026 10:00 UTC", "2026-07-01 19:00 JST"],
			["11/11 9am PT", "2025-11-12 02:00 JST"],
			["2026年11月6日 10:00 UTC", "2026-11-06 19:00 JST"],
			["on 2026-11-20 at 10:00 UTC", "2026-11-20 19:00 JST"],
			["the 20th of November 2026 at 10:00 UTC", "2026-11-20 19:00 JST"],
		])("converts %s to %s", (input, expected) => {
			expect(jstOf(input)).toEqual([expected]);
		});

		it("reads a spelled-out generic zone with the DST of the date", () => {
			expect(jstOf("9:00 AM Pacific Time", SUMMER)).toEqual([
				"01:00 JST (+1d)",
			]);
		});

		// "est" is French and Latin for "is", "ist" German.
		it.each([
			"Il est 10:00 est",
			"Um 10:00 ist",
			"10:00 Mars/Base",
			"10:00 Europe/Atlantis",
		])("finds nothing in %s", (input) => {
			expect(jstOf(input)).toEqual([]);
		});
	});

	describe("ambiguous numeric dates", () => {
		it("gives both the American and the European reading", () => {
			expect(jstOf("07/01/2026 10:00 PT")).toEqual([
				"2026-07-02 02:00 JST",
				"2026-01-08 03:00 JST",
			]);
		});

		it("says which reading each result is", () => {
			const notes = parseSelection("07/01/2026 10:00 PT", WINTER, TOKYO).map(
				(time) => time.note,
			);

			expect(notes).toEqual(["as July 1", "as 7 January"]);
		});

		it("also reads a date without a year both ways", () => {
			expect(jstOf("3/4 9am UTC")).toEqual([
				"2026-03-04 18:00 JST",
				"2026-04-03 18:00 JST",
			]);
		});

		it.each([
			["25/12/2026 10:00 UTC", "2026-12-25 19:00 JST"],
			["12/25/2026 10:00 UTC", "2026-12-25 19:00 JST"],
			["05/05/2026 10:00 UTC", "2026-05-05 19:00 JST"],
			["1.7.2026 10:00 UTC", "2026-07-01 19:00 JST"],
		])(
			"gives one result for %s, which can only be read one way",
			(input, expected) => {
				expect(jstOf(input)).toEqual([expected]);
				expect(parseSelection(input, WINTER, TOKYO)[0].note).toBeUndefined();
			},
		);

		it("keeps the reading in the note of a time without a zone", () => {
			const notes = parseSelection("07/01/2026 10:00", WINTER, TOKYO).map(
				(time) => time.note,
			);

			expect(notes).toEqual([
				"as July 1, local time (Asia/Tokyo)",
				"as 7 January, local time (Asia/Tokyo)",
			]);
		});
	});

	describe("review fixes", () => {
		it.each([
			// An offset followed by the abbreviation it stands for
			["10:00 +0100 CET", "18:00 JST"],
			["10:00 -05:00 EST", "00:00 JST (+1d)"],
			["Fri Nov 6 10:00:00 -0500 EST 2026", "2026-11-07 00:00 JST"],
			// Two digits after the dot are minutes, one digit a fraction of an hour
			["10:00 GMT+5.30", "13:30 JST"],
			["10:00 UTC+5.45", "13:15 JST"],
			// The westernmost real offset
			["10:00 UTC-12", "07:00 JST (+1d)"],
			// Noon and midnight lend their half of the day to a bare start
			["10 to 12 noon UTC", "19:00–21:00 JST"],
		])("converts %s to %s", (input, expected) => {
			expect(jstOf(input)).toEqual([expected]);
		});

		it.each([
			["午前0時 JST", "10:00 EST (-1d)"],
			["午後0時 JST", "22:00 EST (-1d)"],
		])("reads %s, the Japanese way to write hour 0", (input, expected) => {
			expect(convertTo("America/New_York", input)).toEqual([expected]);
		});

		it.each(["10:00 UTC-13", "10:00 UTC+15", "10:00 Europe/Lndon"])(
			"shows nothing for %s rather than reading it as local time",
			(input) => {
				expect(parseSelection(input, WINTER, TOKYO)).toEqual([]);
			},
		);
	});
});
