import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { findTimes } = require("../tz.user.js");

const WINTER = new Date("2026-01-15T00:00:00Z");
const SUMMER = new Date("2026-07-15T00:00:00Z");

const jstOf = (text, now = WINTER) =>
	findTimes(text, now).map((time) => time.jst);

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
		expect(findTimes("Fri, Nov 6, 2026 10:00 PM PST.", WINTER)).toEqual([
			{ source: "Nov 6, 2026 10:00 PM PST", jst: "2026-11-07 15:00 JST" },
		]);
	});

	it("returns every time in the text together with its source", () => {
		expect(
			findTimes("Meeting at 10:00 PST and 2026-11-06T10:00Z.", WINTER),
		).toEqual([
			{ source: "10:00 PST", jst: "03:00 JST (+1d)" },
			{ source: "2026-11-06T10:00Z", jst: "2026-11-06 19:00 JST" },
		]);
	});

	it.each([
		"10:00",
		"at 10 UTC",
		"UTC",
		"10:00 ESTIMATE",
		"version 1.10:00 UTC",
		"10:00 JST",
		"2026-11-06 19:00 JST",
		"25:00 UTC",
		"10:61 UTC",
		"13pm UTC",
		"Feb 30, 2026 10:00 UTC",
		"Nov 6, 2026",
	])("finds nothing in %s", (input) => {
		expect(jstOf(input)).toEqual([]);
	});
});
