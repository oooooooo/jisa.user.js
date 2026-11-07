// ==UserScript==
// @name         jisa.user.js
// @namespace    https://github.com/oooooooo/jisa.user.js
// @version      0.2.0
// @description  Convert a selected time to every time zone in a popup
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(() => {
	// Abbreviations are ambiguous worldwide (CST, IST, BST, ...). The most common
	// meaning on English-language pages wins: CST is US Central, IST is India.
	const FIXED_OFFSETS = {
		UTC: 0,
		GMT: 0,
		WET: 0,
		WEST: 60,
		BST: 60,
		CET: 60,
		CEST: 120,
		EET: 120,
		EEST: 180,
		MSK: 180,
		IST: 330,
		PKT: 300,
		ICT: 420,
		WIB: 420,
		SGT: 480,
		HKT: 480,
		AWST: 480,
		KST: 540,
		JST: 540,
		ACST: 570,
		ACDT: 630,
		AEST: 600,
		AEDT: 660,
		NZST: 720,
		NZDT: 780,
		HST: -600,
		AKST: -540,
		AKDT: -480,
		PST: -480,
		PDT: -420,
		MST: -420,
		MDT: -360,
		CST: -360,
		CDT: -300,
		EST: -300,
		EDT: -240,
		AST: -240,
		ADT: -180,
		NST: -210,
		NDT: -150,
		BRT: -180,
		ART: -180,
		TRT: 180,
		GST: 240,
		WAT: 60,
		CAT: 120,
		SAST: 120,
		EAT: 180,
		NPT: 345,
		MYT: 480,
		PHT: 480,
		WITA: 480,
		WIT: 540,
		// Anywhere on Earth, used for deadlines.
		AoE: -720,
	};

	// Generic names do not say whether DST applies, so the offset depends on the date.
	const GENERIC_ZONES = {
		PT: "America/Los_Angeles",
		MT: "America/Denver",
		CT: "America/Chicago",
		ET: "America/New_York",
		AKT: "America/Anchorage",
	};

	const NORTH_AMERICAN_ZONES = {
		Pacific: ["America/Los_Angeles", -480, -420],
		Mountain: ["America/Denver", -420, -360],
		Central: ["America/Chicago", -360, -300],
		Eastern: ["America/New_York", -300, -240],
		Atlantic: ["America/Halifax", -240, -180],
		Alaska: ["America/Anchorage", -540, -480],
	};

	// Spelled-out names: a fixed offset in minutes, or an IANA zone when the name
	// does not say whether DST applies.
	const SPELLED_OUT_ZONES = {
		"Coordinated Universal Time": 0,
		"Universal Time": 0,
		"Greenwich Mean Time": 0,
		"British Summer Time": 60,
		"Western European Time": 0,
		"Central European Time": 60,
		"Central European Summer Time": 120,
		"Eastern European Time": 120,
		"Eastern European Summer Time": 180,
		"Moscow Time": 180,
		"Gulf Standard Time": 240,
		"India Standard Time": 330,
		"China Standard Time": 480,
		"Singapore Time": 480,
		"Japan Standard Time": 540,
		"Korea Standard Time": 540,
		"Australian Eastern Standard Time": 600,
		"Australian Eastern Daylight Time": 660,
		"New Zealand Standard Time": 720,
		"New Zealand Daylight Time": 780,
		"Hawaii Time": -600,
		"Hawaii Standard Time": -600,
		...Object.fromEntries(
			Object.entries(NORTH_AMERICAN_ZONES).flatMap(
				([name, [zone, standard, daylight]]) => [
					[`${name} Time`, zone],
					[`${name} Standard Time`, standard],
					[`${name} Daylight Time`, daylight],
				],
			),
		),
	};
	const spelledOutZones = new Map(
		Object.entries(SPELLED_OUT_ZONES).map(([name, zone]) => [
			name.toLowerCase(),
			zone,
		]),
	);

	// Escapes a literal for use inside a RegExp source.
	const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	// Matches a word in any letter case; the pattern itself stays case-sensitive
	// because zone abbreviations such as "EST" are also everyday words.
	const anyCase = (word) =>
		escapeRegExp(word).replace(
			/[a-z]/gi,
			(letter) => `[${letter.toUpperCase()}${letter.toLowerCase()}]`,
		);

	// Longer alternatives first, so EST wins over ET and "Central European Time"
	// over "Central Time".
	const longestFirst = (words) =>
		[...words].sort((a, b) => b.length - a.length);

	// Abbreviations that are also words ("est" is French for "is", "ist" German)
	// only count in capitals; the rest may be written in any case.
	const CAPITALS_ONLY = new Set([
		"EST",
		"IST",
		"ART",
		"AST",
		"CAT",
		"EAT",
		"WAT",
		"WIT",
		"AoE",
	]);
	const abbreviationKeys = new Map(
		[...Object.keys(FIXED_OFFSETS), ...Object.keys(GENERIC_ZONES)].map(
			(key) => [key.toUpperCase(), key],
		),
	);
	const ABBREVIATION = longestFirst(abbreviationKeys.values())
		.map((key) =>
			key.length < 3 || CAPITALS_ONLY.has(key)
				? escapeRegExp(key)
				: anyCase(key),
		)
		.join("|");
	const SPELLED_OUT = longestFirst(Object.keys(SPELLED_OUT_ZONES))
		.map((name) => anyCase(name).replaceAll(" ", String.raw`\s+`))
		.join("|");
	const IANA_ZONE = String.raw`(?:Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|Etc)/[A-Za-z][\w+\-]*(?:/[A-Za-z][\w+\-]*)?`;

	const SIGN = "[+\\-−]";
	const OFFSET_DIGITS = String.raw`\d{1,2}(?::?\d{2}|\.\d{1,2})?`;
	// What may follow "UTC" as an offset: "+5", " + 9", " -05:00", "- 5". A
	// minus, a space and a clock ("UTC - 11:00") start the end of a range instead.
	const OFFSET_TAIL = String.raw`(?:${SIGN}${OFFSET_DIGITS}|\s*\+\s*${OFFSET_DIGITS}|\s+[-−]${OFFSET_DIGITS}|\s*[-−]\s+\d{1,2}(?![:\d.]))`;
	const UTC_OFFSET = `(?:${anyCase("UTC")}|${anyCase("GMT")})${OFFSET_TAIL}`;
	const NUMERIC_OFFSET = String.raw`${SIGN}\d{2}:?\d{2}`;
	const ZONE_NAME = `(?:${UTC_OFFSET}|${IANA_ZONE}|${SPELLED_OUT}|(?:${ABBREVIATION})(?!${OFFSET_TAIL}))`;

	const MERIDIEM = String.raw`\s*[aApP]\.?[mM]\.?`;
	const CLOCK = `(?:${[
		String.raw`\d{1,2}[:：]\d{2}(?::\d{2}(?:\.\d+)?)?(?:${MERIDIEM})?`,
		// "17.00" and "4.30 p.m."; a colon or digit after it means something else.
		String.raw`\d{1,2}\.\d{2}(?![:.\d])(?:${MERIDIEM})?`,
		String.raw`\d{1,2}${MERIDIEM}`,
		String.raw`(?:午前|午後)?\d{1,2}時(?:\d{1,2}分|半)?`,
		String.raw`(?:12\s*)?(?:${anyCase("noon")}|${anyCase("midday")}|${anyCase("midnight")})`,
	].join("|")})`;
	// A bare hour can only start a range whose end says am or pm: "4-6pm".
	const BARE_HOUR = String.raw`\d{1,2}`;
	// A hyphen with a space before it and a digit right after ("10:00 -05:00") is
	// the sign of an offset, not a range.
	const RANGE_SEPARATOR = String.raw`(?:\s*[–—~〜]\s*|-\s*|\s*-\s+|\s+(?:to|until|through|thru)\s+)`;

	const MONTHS = [
		"jan",
		"feb",
		"mar",
		"apr",
		"may",
		"jun",
		"jul",
		"aug",
		"sep",
		"oct",
		"nov",
		"dec",
	];
	const MONTH_NAME = longestFirst([
		"January",
		"February",
		"March",
		"April",
		"June",
		"July",
		"August",
		"September",
		"Sept",
		"October",
		"November",
		"December",
		...MONTHS,
	])
		.map(anyCase)
		.join("|");
	const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
	const WEEKDAY = `(?:${longestFirst([
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
		"Sunday",
		"Thurs",
		"Tues",
		"Thur",
		...WEEKDAYS,
	])
		.map(anyCase)
		.join("|")})\\.?`;
	const RELATIVE_DAYS = { today: 0, tonight: 0, tomorrow: 1, yesterday: -1 };
	const RELATIVE_DAY = Object.keys(RELATIVE_DAYS).map(anyCase).join("|");
	const ORDINAL = "(?:st|nd|rd|th)?";
	const YEAR = String.raw`\d{4}`;
	const MONTH_DAY = String.raw`(?:${MONTH_NAME})\.?\s+\d{1,2}${ORDINAL}(?:,?\s+${YEAR})?`;
	const DAY_MONTH = String.raw`(?:${anyCase("the")}\s+)?\d{1,2}${ORDINAL}\s+(?:${anyCase("of")}\s+)?(?:${MONTH_NAME})\.?(?:,?\s+${YEAR})?`;
	const NUMERIC_DATE = String.raw`${YEAR}[-/]\d{1,2}[-/]\d{1,2}`;
	// "07/01/2026" is read the American way unless a part is over 12; "1.7.2026"
	// is European.
	const SLASH_DATE_WITH_YEAR = String.raw`\d{1,2}/\d{1,2}/(?:\d{4}|\d{2})`;
	const SLASH_DATE = String.raw`\d{1,2}/\d{1,2}(?!/)`;
	const DOT_DATE = String.raw`\d{1,2}\.\d{1,2}\.${YEAR}`;
	const JAPANESE_DATE = String.raw`(?:\d{4}年)?\d{1,2}月\d{1,2}日(?:\s*[（(][月火水木金土日][)）])?`;
	const DATE_AFTER_TIME = `(?:${NUMERIC_DATE}|${SLASH_DATE_WITH_YEAR}|${DOT_DATE}|${JAPANESE_DATE}|${MONTH_DAY}|${DAY_MONTH}|${RELATIVE_DAY}|${WEEKDAY})`;
	// A year-less "3/4" right after a time is more likely a fraction than a date.
	const DATE = `(?:${DATE_AFTER_TIME}|${SLASH_DATE})`;
	const DATE_TIME_SEPARATOR = String.raw`(?:T|,?\s+(?:${anyCase("at")}\s+|@\s*|[-–—]\s*)?|,?\s*[-–—@]\s*|(?<=[日)）])\s*)`;
	const TIME_DATE_SEPARATOR = String.raw`(?:,?\s+(?:${anyCase("on")}\s+)?|\s*[-–—]\s*)`;

	// An offset may be followed by the abbreviation it stands for, as in
	// "-0500 EST" or "+0100 (CET)"; parseMatch checks that the two agree. The
	// year of Unix date output ("Fri Nov 6 10:00:00 EST 2026") comes last.
	const ZONE = String.raw`(?:(?:(?<offset>Z|${NUMERIC_OFFSET})|\s(?<spacedOffset>${NUMERIC_OFFSET}))(?:\s+\(?(?<offsetName>${ABBREVIATION})\)?)?|\s*(?:\((?<parenZone>${ZONE_NAME})\)|(?<zone>${ZONE_NAME})))(?:\s+(?<trailingYear>${YEAR})(?![\d:]))?`;

	// A zoned time, or with withZone false a time without a zone.
	const timePattern = (withZone) =>
		new RegExp(
			// Not inside a word, a decimal number or an h:mm:ss time.
			String.raw`(?<![\w.])(?<!\d:)` +
				`(?:(?<dateBefore>${DATE})${DATE_TIME_SEPARATOR})?` +
				`(?<start>${CLOCK}|${BARE_HOUR}(?=${RANGE_SEPARATOR}))` +
				(withZone
					? String.raw`(?:\s*(?<startZone>${ZONE_NAME})(?=${RANGE_SEPARATOR}))?`
					: "") +
				`(?:${RANGE_SEPARATOR}(?<end>${CLOCK}))?` +
				(withZone ? ZONE : "") +
				`(?:${TIME_DATE_SEPARATOR}(?<dateAfter>${DATE_AFTER_TIME}))?` +
				String.raw`(?![\w:])`,
			"g",
		);
	const TIME_PATTERN = timePattern(true);
	const ZONELESS_TIME_PATTERN = timePattern(false);

	const pad = (n) => String(n).padStart(2, "0");

	// The parts of a written time. The hour is validated once the meridiem,
	// possibly borrowed from the end of a range, is known.
	function parseClock(text) {
		const lower = text.toLowerCase();
		// Noon and midnight already say which half of the day they are in.
		if (/noon|midday/.test(lower)) {
			return { hour: 12, minute: 0, meridiem: null, bare: false, fixed: true };
		}
		if (lower.includes("midnight")) {
			return { hour: 0, minute: 0, meridiem: null, bare: false, fixed: true };
		}
		const japanese = /^(午前|午後)?(\d{1,2})時(?:(\d{1,2})分|(半))?$/.exec(
			text,
		);
		if (japanese) {
			const hour = Number(japanese[2]);
			// 午前0時 is midnight and 午後0時 noon; English has no hour 0 with am/pm.
			if (hour === 0 && japanese[1]) {
				return {
					hour: japanese[1] === "午後" ? 12 : 0,
					minute: japanese[4] ? 30 : Number(japanese[3] ?? 0),
					meridiem: null,
					bare: false,
					fixed: true,
				};
			}
			return {
				hour,
				minute: japanese[4] ? 30 : Number(japanese[3] ?? 0),
				meridiem: japanese[1] ? (japanese[1] === "午後" ? "p" : "a") : null,
				bare: false,
				fixed: false,
			};
		}
		const match =
			/^(\d{1,2})(?:[:：.](\d{2}))?.*?(?:([aApP])\.?[mM]\.?)?$/.exec(text);
		return {
			hour: Number(match[1]),
			minute: Number(match[2] ?? 0),
			meridiem: match[3]?.toLowerCase() ?? null,
			bare: /^\d{1,2}$/.test(text),
			fixed: false,
		};
	}

	// Returns null for times that do not exist, such as 25:00 or 13pm.
	function toPlainTime({ hour, minute }, meridiem) {
		if (minute > 59) return null;
		let hour24 = hour;
		if (meridiem) {
			if (hour < 1 || hour > 12) return null;
			hour24 = (hour % 12) + (meridiem === "p" ? 12 : 0);
		} else if (hour > 23) {
			return null;
		}
		return Temporal.PlainTime.from({ hour: hour24, minute });
	}

	// "1:00–3:00pm" means 1pm: a start without am/pm takes the one of the end,
	// unless that puts it after the end ("11–1pm" starts at 11am).
	function rangeTimes(startText, endText) {
		const start = parseClock(startText);
		if (endText === undefined) {
			return start.bare
				? null
				: { start: toPlainTime(start, start.meridiem), end: null };
		}
		const end = parseClock(endText);
		const endTime = toPlainTime(end, end.meridiem);
		// "10 to 12 noon": noon is pm and midnight am for the start to borrow.
		const endMeridiem =
			end.meridiem ?? (end.fixed ? (end.hour >= 12 ? "p" : "a") : null);
		if (start.meridiem || !endMeridiem || start.hour > 12 || start.fixed) {
			if (start.bare) return null;
			return { start: toPlainTime(start, start.meridiem), end: endTime };
		}
		let startTime = toPlainTime(start, endMeridiem);
		if (
			startTime &&
			endTime &&
			Temporal.PlainTime.compare(startTime, endTime) > 0
		) {
			startTime = toPlainTime(start, endMeridiem === "a" ? "p" : "a");
		}
		return { start: startTime, end: endTime };
	}

	// Minutes after a dot: "5.30" is 5:30 as written in India, while a single
	// digit is a fraction of an hour, so "5.5" is 5:30 too.
	const dotMinutes = (digits) =>
		digits.length === 1 ? Number(digits) * 6 : Number(digits);

	// Minutes east of UTC, or null outside the real-world range of -12:00 to
	// +14:00. Temporal would carry "+1260" over to +13:00.
	function parseOffset(sign, hourText, minuteText = "0", dotText) {
		const minutes =
			dotText === undefined ? Number(minuteText) : dotMinutes(dotText);
		if (minutes > 59) return null;
		const total = Number(hourText) * 60 + minutes;
		if (total > (sign === "+" ? 14 : 12) * 60) return null;
		return sign === "+" ? total : -total;
	}

	// Temporal accepts "+05:30" as a fixed-offset time zone.
	function offsetTimeZone(minutes) {
		if (minutes === null) return null;
		const sign = minutes < 0 ? "-" : "+";
		const abs = Math.abs(minutes);
		return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
	}

	// The canonical name of an IANA zone, or null when Temporal does not know it.
	function ianaTimeZone(name) {
		try {
			return new Temporal.ZonedDateTime(0n, name).timeZoneId;
		} catch (error) {
			if (error instanceof RangeError) return null;
			throw error;
		}
	}

	// A time zone identifier Temporal accepts, or null for an invalid offset.
	function parseZone(text) {
		const spelled = spelledOutZones.get(
			text.toLowerCase().replace(/\s+/g, " "),
		);
		if (typeof spelled === "number") return offsetTimeZone(spelled);
		if (spelled !== undefined) return spelled;
		if (text.includes("/")) return ianaTimeZone(text);
		const zone = text.replaceAll("−", "-").replace(/\s+/g, "");
		if (zone === "Z") return "UTC";
		const numeric =
			/^(?:UTC|GMT)?([+-])(\d{1,2})(?::?(\d{2})|\.(\d{1,2}))?$/i.exec(zone);
		if (numeric) return offsetTimeZone(parseOffset(...numeric.slice(1)));
		const key = abbreviationKeys.get(zone.toUpperCase());
		if (key in GENERIC_ZONES) return GENERIC_ZONES[key];
		return offsetTimeZone(FIXED_OFFSETS[key] ?? null);
	}

	const YEARS_BACK_AND_FORTH = 4;

	// Returns null for dates that do not exist, such as Feb 30.
	function plainDate(year, month, day) {
		try {
			return Temporal.PlainDate.from(
				{ year, month, day },
				{ overflow: "reject" },
			);
		} catch (error) {
			if (error instanceof RangeError) return null;
			throw error;
		}
	}

	// "Dec 31" read on Jan 1 means last year's Dec 31, so pick the closest
	// candidate. Looking four years each way also finds the nearest Feb 29.
	function closestYearDate(month, day, today) {
		const distance = (date) => Math.abs(today.until(date).days);
		const candidates = [];
		for (
			let offset = -YEARS_BACK_AND_FORTH;
			offset <= YEARS_BACK_AND_FORTH;
			offset++
		) {
			const date = plainDate(today.year + offset, month, day);
			if (date !== null) candidates.push(date);
		}
		if (candidates.length === 0) return null;
		return candidates.reduce((best, date) =>
			distance(date) < distance(best) ? date : best,
		);
	}

	// A year of null means the year was omitted.
	function datedOrClosest(year, month, day, today) {
		if (year === null) return closestYearDate(month, day, today);
		return plainDate(year < 100 ? 2000 + year : year, month, day);
	}

	const monthNumber = (name) =>
		MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

	const numberOrNull = (text) => (text === undefined ? null : Number(text));

	const reading = (date) => (date === null ? [] : [{ date }]);

	// "07/01/2026" is July 1 in America and 7 January in Europe; the note tells
	// the two results apart.
	function bothReadings(year, first, second, today) {
		const american = datedOrClosest(year, first, second, today);
		const european = datedOrClosest(year, second, first, today);
		return [
			{ date: american, locale: "en-US" },
			{ date: european, locale: "en-GB" },
		]
			.filter(({ date }) => date !== null)
			.map(({ date, locale }) => ({
				date,
				note: `as ${date.toLocaleString(locale, { month: "long", day: "numeric" })}`,
			}));
	}

	// The possible readings of a date: none for a date that does not exist,
	// two for a numeric date that both America and Europe could have written.
	function parseDate(text, today) {
		const word = text.toLowerCase().replace(/\.$/, "");
		const relative = RELATIVE_DAYS[word];
		if (relative !== undefined) return reading(today.add({ days: relative }));
		const weekday = WEEKDAYS.indexOf(word.slice(0, 3));
		if (weekday !== -1 && /^[a-z]+$/.test(word)) {
			// The coming one, or today when it is that day.
			return reading(
				today.add({ days: (weekday + 1 - today.dayOfWeek + 7) % 7 }),
			);
		}
		const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text);
		if (iso) return reading(plainDate(...iso.slice(1).map(Number)));
		const japanese = /^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/.exec(text);
		if (japanese) {
			const [year, month, day] = japanese.slice(1).map(numberOrNull);
			return reading(datedOrClosest(year, month, day, today));
		}
		// Dots are only used day first.
		const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
		if (dotted) {
			const [day, month, year] = dotted.slice(1).map(Number);
			return reading(plainDate(year, month, day));
		}
		const slashed = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(text);
		if (slashed) {
			const [first, second, year] = slashed.slice(1).map(numberOrNull);
			if (first > 12)
				return reading(datedOrClosest(year, second, first, today));
			if (second > 12 || first === second) {
				return reading(datedOrClosest(year, first, second, today));
			}
			return bothReadings(year, first, second, today);
		}
		const words =
			/^(?:the\s+)?(?:([a-z]+)\.?\s+(\d{1,2})|(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)\.?)(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/i.exec(
				text,
			);
		const month = monthNumber(words[1] ?? words[4]);
		const day = Number(words[2] ?? words[3]);
		return reading(datedOrClosest(numberOrNull(words[5]), month, day, today));
	}

	const localTimeZone = () => Temporal.Now.timeZoneId();

	// en-US knows US abbreviations, en-GB European ones and ja-JP knows JST;
	// each gives "GMT+9"-style names for the zones it does not know.
	const LABEL_LOCALES = ["en-US", "en-GB", "ja-JP"];

	// The popup labels every time zone, and creating a formatter is the slow part.
	const labelFormatters = new Map();

	function labelFormatter(locale, timeZone) {
		const key = `${locale} ${timeZone}`;
		if (!labelFormatters.has(key)) {
			labelFormatters.set(
				key,
				new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" }),
			);
		}
		return labelFormatters.get(key);
	}

	function zoneLabel(timeZone, instant) {
		const names = LABEL_LOCALES.map(
			(locale) =>
				labelFormatter(locale, timeZone)
					.formatToParts(instant)
					.find((part) => part.type === "timeZoneName").value,
		);
		return names.find((name) => !/^GMT[+-]/.test(name)) ?? names[0];
	}

	const formatClock = (dateTime) =>
		dateTime.toPlainTime().toString({ smallestUnit: "minute" });

	// The start and end of a time as zoned date-times. The end of an overnight
	// range ("11pm–3am") falls on the next day.
	function zonedRange({ date, start, end, startZone, endZone }) {
		const startAt = date.toZonedDateTime({
			timeZone: startZone,
			plainTime: start,
		});
		if (end === null) return { startAt, endAt: null };
		let endAt = date.toZonedDateTime({ timeZone: endZone, plainTime: end });
		if (Temporal.ZonedDateTime.compare(endAt, startAt) <= 0) {
			endAt = date
				.add({ days: 1 })
				.toZonedDateTime({ timeZone: endZone, plainTime: end });
		}
		return { startAt, endAt };
	}

	function convert({ date, range, timeZone, dated }) {
		const startTarget = range.startAt.withTimeZone(timeZone);
		let clock = formatClock(startTarget);
		if (range.endAt !== null) {
			clock += `–${formatClock(range.endAt.withTimeZone(timeZone))}`;
		}
		const label = zoneLabel(timeZone, startTarget.toInstant());
		const targetDate = startTarget.toPlainDate();
		if (dated) return `${targetDate} ${clock} ${label}`;
		const shift = date.until(targetDate).days;
		if (shift === 0) return `${clock} ${label}`;
		return `${clock} ${label} (${shift > 0 ? "+" : ""}${shift}d)`;
	}

	// The times a match may mean: none when it is not a real time, such as 25:00
	// or Feb 30, and two for a date like "07/01/2026". A match without a zone is
	// read in fallbackZone.
	function parseMatch(match, now, fallbackZone) {
		const groups = match.groups;
		const times = rangeTimes(groups.start, groups.end);
		if (times === null || times.start === null) return [];
		if (groups.end !== undefined && times.end === null) return [];
		const zoneText =
			groups.offset ?? groups.spacedOffset ?? groups.parenZone ?? groups.zone;
		const endZone = zoneText === undefined ? fallbackZone : parseZone(zoneText);
		const startZone =
			groups.startZone === undefined ? endZone : parseZone(groups.startZone);
		if (endZone === null || startZone === null) return [];
		const today = now.toZonedDateTimeISO(startZone).toPlainDate();
		const dateText = withTrailingYear(
			groups.dateBefore ?? groups.dateAfter,
			groups.trailingYear,
		);
		const readings =
			dateText === undefined ? reading(today) : parseDate(dateText, today);
		return readings.flatMap(({ date, note }) => {
			const range = zonedRange({
				date,
				start: times.start,
				end: times.end,
				startZone,
				endZone,
			});
			// "10:00-1100 UTC" is not an offset of -11:00 named UTC.
			if (
				groups.offsetName !== undefined &&
				!sameOffset(range.startAt, parseZone(groups.offsetName))
			) {
				return [];
			}
			return {
				source: match[0],
				note,
				instant: range.startAt.toInstant(),
				convertTo: (timeZone) =>
					convert({ date, range, timeZone, dated: dateText !== undefined }),
			};
		});
	}

	// Whether a zone has the same offset as the zoned date-time at that moment.
	const sameOffset = (zonedDateTime, timeZone) =>
		zonedDateTime.withTimeZone(timeZone).offset === zonedDateTime.offset;

	// The year after "Fri Nov 6 10:00:00 EST 2026" completes a date written
	// with a month name and no year.
	function withTrailingYear(dateText, year) {
		if (dateText === undefined || year === undefined) return dateText;
		if (!/^[a-z]/i.test(dateText) || /\d{4}/.test(dateText)) return dateText;
		return `${dateText.replace(/^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, "")}, ${year}`;
	}

	function parseTimes(text, now = Temporal.Now.instant()) {
		return [...text.matchAll(TIME_PATTERN)].flatMap((match) =>
			parseMatch(match, now),
		);
	}

	const UNIX_TIME = /^\s*(\d{10}|\d{13})\s*$/;
	// Without a zone, only clock-like text counts, so "1.10" stays a number.
	const LOOKS_LIKE_CLOCK = /[:：時]|\d\s*[ap]\.?m|noon|midday|midnight/i;

	function unixTime(digits) {
		const milliseconds =
			digits.length === 13 ? Number(digits) : Number(digits) * 1000;
		const instant = Temporal.Instant.fromEpochMilliseconds(milliseconds);
		const startAt = instant.toZonedDateTimeISO("UTC");
		const range = { startAt, endAt: null };
		return {
			source: digits,
			note: "Unix time",
			instant,
			convertTo: (timeZone) =>
				convert({ date: startAt.toPlainDate(), range, timeZone, dated: true }),
		};
	}

	// What the popup shows for a selection: zoned times, else a Unix timestamp,
	// else times without a zone read as local time.
	function parseSelection(
		text,
		now = Temporal.Now.instant(),
		localZone = localTimeZone(),
	) {
		// A zoned time that turns out invalid ("UTC+15") must not be read as a
		// local time instead.
		const zoned = [...text.matchAll(TIME_PATTERN)];
		if (zoned.length > 0) {
			return zoned.flatMap((match) => parseMatch(match, now));
		}
		const unix = UNIX_TIME.exec(text);
		if (unix) return [unixTime(unix[1])];
		return [...text.matchAll(ZONELESS_TIME_PATTERN)]
			.filter((match) => LOOKS_LIKE_CLOCK.test(match[0]))
			.flatMap((match) => parseMatch(match, now, localZone))
			.map((time) => ({
				...time,
				note: [time.note, `local time (${localZone})`]
					.filter(Boolean)
					.join(", "),
			}));
	}

	const RELATIVE_TIME = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

	// "in 10 hours", "2 days ago".
	function relativeLabel(instant, now) {
		const minutes = Math.round(now.until(instant).total("minutes"));
		if (Math.abs(minutes) < 60) return RELATIVE_TIME.format(minutes, "minute");
		const hours = Math.round(minutes / 60);
		if (Math.abs(hours) < 48) return RELATIVE_TIME.format(hours, "hour");
		return RELATIVE_TIME.format(Math.round(hours / 24), "day");
	}

	function findTimes(
		text,
		now = Temporal.Now.instant(),
		timeZone = localTimeZone(),
	) {
		return parseTimes(text, now).map(({ source, convertTo }) => ({
			source,
			converted: convertTo(timeZone),
		}));
	}

	const HOST_ATTRIBUTE = "data-jisa";
	// Selecting a whole page should not make every mouseup scan megabytes of text.
	const MAX_SELECTION_LENGTH = 2000;
	const GAP = 6;
	// Each row converts to every zone once its list opens; a timetable selection
	// with hundreds of times would otherwise freeze the page.
	const MAX_ROWS = 20;
	const COPY_LABEL = "Copy";
	const COPY_RESULT_DURATION = 1500;

	const POPUP_STYLE = `
		:host { all: initial; }
		.popup {
			position: fixed;
			z-index: 2147483647;
			box-sizing: border-box;
			width: max-content;
			max-width: min(460px, calc(100vw - 12px));
			padding: 6px 28px 6px 10px;
			border: 1px solid #c8c8c8;
			border-radius: 6px;
			background: #ffffff;
			color: #1f1f1f;
			box-shadow: 0 2px 8px rgb(0 0 0 / 20%);
			font: 13px/1.5 system-ui, sans-serif;
			user-select: text;
		}
		.row { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; }
		.row + .row { margin-top: 6px; }
		.heading { flex-basis: 100%; color: #6b6b6b; }
		.note, .relative { margin-left: 6px; font-size: 12px; }
		.extra { flex-basis: 100%; font-size: 12px; }
		.extra-line { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
		.extra-line span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.more { margin-top: 6px; color: #6b6b6b; }
		.toggle {
			flex: 1;
			min-width: 0;
			overflow: hidden;
			text-align: left;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.panel { flex-basis: 100%; }
		.panel input {
			box-sizing: border-box;
			width: 100%;
			margin: 2px 0;
			padding: 2px 6px;
			border: 1px solid #c8c8c8;
			border-radius: 4px;
			background: transparent;
			color: inherit;
			font: 12px/1.6 system-ui, sans-serif;
		}
		[role="listbox"] {
			max-height: 240px;
			overflow-y: auto;
			font-size: 12px;
		}
		[role="option"] {
			padding: 1px 6px;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			cursor: pointer;
		}
		[role="option"].active { background: rgb(0 0 0 / 10%); }
		[role="option"][aria-selected="true"] { font-weight: bold; }
		button {
			padding: 0 6px;
			border: 1px solid #c8c8c8;
			border-radius: 4px;
			background: transparent;
			color: inherit;
			font: 12px/1.6 system-ui, sans-serif;
			cursor: pointer;
		}
		button:hover { background: rgb(0 0 0 / 8%); }
		.close {
			position: absolute;
			top: 4px;
			right: 4px;
			border: none;
			font-size: 14px;
		}
		@media (prefers-color-scheme: dark) {
			.popup { border-color: #4a4a4a; background: #262626; color: #f0f0f0; }
			.heading, .more { color: #a8a8a8; }
			button, .panel input { border-color: #4a4a4a; }
			button:hover { background: rgb(255 255 255 / 12%); }
			[role="option"].active { background: rgb(255 255 255 / 16%); }
		}
	`;

	// Text nodes in the range, with the offsets of their selected part.
	function selectedTextParts(range) {
		const root = range.commonAncestorContainer;
		const nodes = [];
		if (root.nodeType === Node.TEXT_NODE) {
			nodes.push(root);
		} else {
			const walker = root.ownerDocument.createTreeWalker(
				root,
				NodeFilter.SHOW_TEXT,
			);
			while (walker.nextNode()) {
				if (range.intersectsNode(walker.currentNode))
					nodes.push(walker.currentNode);
			}
		}
		return nodes.map((node) => ({
			node,
			start: node === range.startContainer ? range.startOffset : 0,
			end: node === range.endContainer ? range.endOffset : node.length,
		}));
	}

	// The DOM position of a character offset into the joined text parts.
	function positionAt(parts, offset) {
		let remaining = offset;
		for (const { node, start, end } of parts) {
			const length = end - start;
			if (remaining <= length) {
				return { node, offset: start + remaining };
			}
			remaining -= length;
		}
		return null;
	}

	// Anchors the popup to the time itself. The selection may hold more text, and
	// a triple-click range ends at the start of the next block, so the box of the
	// whole range can reach far below the time.
	function selectionRect(selection, source) {
		if (selection.rangeCount === 0) return null;
		const range = selection.getRangeAt(selection.rangeCount - 1);
		// jsdom implements neither Range#getClientRects nor getBoundingClientRect.
		if (typeof range.getClientRects !== "function") return null;
		const parts = selectedTextParts(range);
		const text = parts
			.map(({ node, start, end }) => node.data.slice(start, end))
			.join("");
		// Not found when the time spans blocks: selection.toString() puts line
		// breaks between them that the text nodes do not have.
		const index = text.indexOf(source);
		if (index === -1) return range.getBoundingClientRect();
		const start = positionAt(parts, index);
		const end = positionAt(parts, index + source.length);
		const timeRange = range.startContainer.ownerDocument.createRange();
		timeRange.setStart(start.node, start.offset);
		timeRange.setEnd(end.node, end.offset);
		// A boundary at the end of a text node yields an empty box.
		const rects = [...timeRange.getClientRects()].filter(
			(rect) => rect.width > 0,
		);
		if (rects.length === 0) return range.getBoundingClientRect();
		// A time wrapped over two lines starts on the first and ends on the last.
		return {
			left: rects[0].left,
			top: rects[0].top,
			bottom: rects.at(-1).bottom,
		};
	}

	// execCommand("copy") copies the page selection, which still holds the
	// original text, unless a copy listener replaces the data.
	function copyWithCopyEvent(text, doc) {
		const win = doc.defaultView;
		let copied = false;
		const onCopy = (event) => {
			event.preventDefault();
			// Page handlers must not overwrite the data.
			event.stopImmediatePropagation();
			event.clipboardData.setData("text/plain", text);
			copied = true;
		};
		win.addEventListener("copy", onCopy, true);
		try {
			doc.execCommand("copy");
		} finally {
			win.removeEventListener("copy", onCopy, true);
		}
		if (copied) return Promise.resolve();
		return Promise.reject(
			new Error('document.execCommand("copy") was refused'),
		);
	}

	// navigator.clipboard is missing on http pages and rejects when the document
	// is not focused; the copy event covers both cases.
	function copyToClipboard(text, doc = document) {
		const clipboard = doc.defaultView.navigator.clipboard;
		if (typeof clipboard?.writeText !== "function") {
			return copyWithCopyEvent(text, doc);
		}
		return clipboard.writeText(text).catch(() => copyWithCopyEvent(text, doc));
	}

	function buildButton(doc, label, text) {
		const button = doc.createElement("button");
		button.type = "button";
		if (label !== null) button.setAttribute("aria-label", label);
		button.textContent = text;
		return button;
	}

	function buildCopyButton(doc, getText, copy) {
		const button = buildButton(doc, COPY_LABEL, COPY_LABEL);
		button.addEventListener("click", () => {
			// Call copy synchronously: clipboard APIs require a live user activation.
			let copied;
			try {
				copied = Promise.resolve(copy(getText()));
			} catch (error) {
				copied = Promise.reject(error);
			}
			copied
				.then(
					() => "Copied",
					() => "Failed",
				)
				.then((result) => {
					button.textContent = result;
					setTimeout(() => {
						button.textContent = COPY_LABEL;
					}, COPY_RESULT_DURATION);
				});
		});
		return button;
	}

	// Recent zones come first. Some engines leave UTC out of supportedValuesOf,
	// and the local zone may be an alias that the list does not contain.
	const allTimeZones = (recentZones) => [
		...new Set([
			...recentZones,
			...["UTC", localTimeZone(), ...Intl.supportedValuesOf("timeZone")].sort(),
		]),
	];

	// Each word of the query must start a word of the option, so "new york" finds
	// America/New_York while "est" does not find Europe/Budapest.
	function matchesWordStart(text, term) {
		for (
			let index = text.indexOf(term);
			index !== -1;
			index = text.indexOf(term, index + 1)
		) {
			if (index === 0 || !/[\p{L}\p{N}]/u.test(text[index - 1])) return true;
		}
		return false;
	}

	// A button showing the chosen conversion, and a panel with a search box above a
	// list of every time zone. Native <select> can neither search nor keep a box on top.
	function buildZonePicker(
		doc,
		convertTo,
		{ closeOtherPickers, onLayoutChange, recentZones, onChoose },
	) {
		let selected = localTimeZone();
		let active = null;
		const label = (zone) => `${zone} — ${convertTo(zone)}`;

		const toggle = buildButton(doc, null, label(selected));
		toggle.className = "toggle";
		toggle.setAttribute("aria-haspopup", "listbox");
		toggle.setAttribute("aria-expanded", "false");

		const panel = doc.createElement("div");
		panel.className = "panel";
		panel.hidden = true;
		const search = doc.createElement("input");
		search.type = "search";
		search.placeholder = "Search time zones";
		search.setAttribute("aria-label", "Search time zones");
		const list = doc.createElement("div");
		list.setAttribute("role", "listbox");
		let options = [];
		const searchText = new Map();
		// Built on first open: labelling every zone is the slow part of the popup.
		const buildOptions = () => {
			options = allTimeZones(recentZones).map((zone) => {
				const option = doc.createElement("div");
				option.setAttribute("role", "option");
				option.dataset.zone = zone;
				option.textContent = label(zone);
				searchText.set(option, option.textContent.toLowerCase());
				return option;
			});
			list.append(...options);
		};
		panel.append(search, list);

		const isOpen = () => !panel.hidden;
		const visibleOptions = () => options.filter((option) => !option.hidden);

		const highlight = (option) => {
			active?.classList.remove("active");
			active = option ?? null;
			active?.classList.add("active");
			// jsdom does not implement scrollIntoView.
			active?.scrollIntoView?.({ block: "nearest" });
		};

		const filter = () => {
			const terms = search.value.toLowerCase().split(/\s+/).filter(Boolean);
			for (const option of options) {
				const text = searchText.get(option);
				option.hidden = !terms.every((term) => matchesWordStart(text, term));
			}
			highlight(visibleOptions()[0]);
		};

		const close = () => {
			if (panel.hidden) return;
			panel.hidden = true;
			toggle.setAttribute("aria-expanded", "false");
			onLayoutChange();
		};

		const open = () => {
			closeOtherPickers();
			if (options.length === 0) buildOptions();
			panel.hidden = false;
			toggle.setAttribute("aria-expanded", "true");
			search.value = "";
			filter();
			for (const option of options) {
				option.setAttribute(
					"aria-selected",
					String(option.dataset.zone === selected),
				);
			}
			highlight(options.find((option) => option.dataset.zone === selected));
			search.focus();
			onLayoutChange();
		};

		const choose = (zone) => {
			selected = zone;
			onChoose(zone);
			toggle.textContent = label(zone);
			close();
			toggle.focus();
		};

		const moveHighlight = (step) => {
			const visible = visibleOptions();
			if (visible.length === 0) return;
			const index = visible.indexOf(active);
			const next = Math.min(Math.max(index + step, 0), visible.length - 1);
			highlight(visible[next]);
		};

		toggle.addEventListener("click", () => (isOpen() ? close() : open()));
		search.addEventListener("input", filter);
		// Pages see keys from the shadow root as coming from the popup host, not
		// from a text field, and would run their shortcuts on them.
		for (const type of ["keydown", "keypress", "keyup"]) {
			search.addEventListener(type, (event) => event.stopPropagation());
		}
		search.addEventListener("keydown", (event) => {
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				moveHighlight(event.key === "ArrowDown" ? 1 : -1);
			} else if (event.key === "Enter" && active) {
				event.preventDefault();
				choose(active.dataset.zone);
			}
		});
		list.addEventListener("click", (event) => {
			const option = event.target.closest('[role="option"]');
			if (option) choose(option.dataset.zone);
		});

		return {
			toggle,
			panel,
			isOpen,
			close,
			converted: () => convertTo(selected),
		};
	}

	function buildSpan(doc, className, text) {
		const span = doc.createElement("span");
		span.className = className;
		span.textContent = text;
		return span;
	}

	// The source text, how it was read, and how far it is from now.
	function buildHeading(doc, { source, note, instant }, now) {
		const heading = doc.createElement("div");
		heading.className = "heading";
		heading.append(buildSpan(doc, "source", source));
		if (note) heading.append(buildSpan(doc, "note", note));
		heading.append(buildSpan(doc, "relative", relativeLabel(instant, now)));
		return heading;
	}

	// The time in each recently chosen zone, so several zones show at once.
	function buildExtraLines(doc, convertTo, { recentZones, copy }) {
		const extra = doc.createElement("div");
		extra.className = "extra";
		for (const zone of recentZones) {
			if (zone === localTimeZone()) continue;
			const line = doc.createElement("div");
			line.className = "extra-line";
			line.append(
				buildSpan(doc, "", `${zone} — ${convertTo(zone)}`),
				buildCopyButton(doc, () => convertTo(zone), copy),
			);
			extra.append(line);
		}
		return extra;
	}

	function buildRow(doc, time, { copy, now, pickerHooks }) {
		const row = doc.createElement("div");
		row.className = "row";
		const picker = buildZonePicker(doc, time.convertTo, pickerHooks);
		const copyButton = buildCopyButton(doc, picker.converted, copy);
		row.append(buildHeading(doc, time, now), picker.toggle, copyButton);
		const extra = buildExtraLines(doc, time.convertTo, {
			recentZones: pickerHooks.recentZones,
			copy,
		});
		if (extra.childElementCount > 0) row.append(extra);
		row.append(picker.panel);
		return { row, picker };
	}

	// Returns the popup element and a function that closes any open time zone list,
	// telling whether one was open.
	function buildPopup(
		doc,
		{ times, now, copy, close, onLayoutChange, recentZones, onChoose },
	) {
		const popup = doc.createElement("div");
		popup.className = "popup";
		const closeButton = buildButton(doc, "Close", "×");
		closeButton.className = "close";
		closeButton.addEventListener("click", close);
		const pickers = [];
		const closePickers = () => {
			const wasOpen = pickers.some((picker) => picker.isOpen());
			for (const picker of pickers) picker.close();
			return wasOpen;
		};
		const pickerHooks = {
			closeOtherPickers: closePickers,
			onLayoutChange,
			recentZones,
			onChoose,
		};
		const rows = times.slice(0, MAX_ROWS).map((time) => {
			const { row, picker } = buildRow(doc, time, { copy, now, pickerHooks });
			pickers.push(picker);
			return row;
		});
		popup.append(closeButton, ...rows);
		if (times.length > MAX_ROWS) {
			const more = doc.createElement("div");
			more.className = "more";
			more.textContent = `and ${times.length - MAX_ROWS} more`;
			popup.append(more);
		}
		return { popup, closePickers };
	}

	// Constructed style sheets are exempt from a page's style-src CSP, which
	// would block an inline <style>.
	function addPopupStyle(shadow, doc) {
		const StyleSheet = doc.defaultView.CSSStyleSheet;
		if ("adoptedStyleSheets" in shadow && typeof StyleSheet === "function") {
			const sheet = new StyleSheet();
			sheet.replaceSync(POPUP_STYLE);
			shadow.adoptedStyleSheets = [sheet];
			return;
		}
		const style = doc.createElement("style");
		style.textContent = POPUP_STYLE;
		shadow.append(style);
	}

	const MAX_RECENT_ZONES = 3;

	// Recent zones are kept by the userscript manager, so they follow the user
	// across sites; page storage such as localStorage is separate for each site.
	function userscriptSettings() {
		if (typeof GM_getValue !== "function") {
			let recentZones = [];
			return {
				getRecentZones: () => recentZones,
				setRecentZones: (zones) => {
					recentZones = zones;
				},
			};
		}
		return {
			getRecentZones: () =>
				GM_getValue("recentZones", []).filter(
					(zone) => ianaTimeZone(zone) !== null,
				),
			setRecentZones: (zones) => GM_setValue("recentZones", zones),
		};
	}

	const TEXT_FIELD_TYPES = new Set(["text", "search", "url", "tel"]);

	// Text fields keep their selection apart from the page selection.
	const isTextField = (element) =>
		element?.tagName === "TEXTAREA" ||
		(element?.tagName === "INPUT" && TEXT_FIELD_TYPES.has(element.type));

	// The selected text, read lazily because Ctrl+A on a long page makes it
	// expensive, a key telling whether the selection changed, and where the
	// popup goes for a time in it.
	function readSelection(doc) {
		const field = doc.activeElement;
		if (isTextField(field) && field.selectionStart !== field.selectionEnd) {
			const { selectionStart: start, selectionEnd: end } = field;
			return {
				text: () => field.value.slice(start, end),
				key: {
					startContainer: field,
					startOffset: start,
					endContainer: field,
					endOffset: end,
				},
				rectFor: () => field.getBoundingClientRect(),
			};
		}
		const selection = doc.defaultView.getSelection();
		return {
			text: () => selection?.toString() ?? "",
			key: selectionBoundaries(selection),
			rectFor: (source) => selectionRect(selection, source),
		};
	}

	function selectionBoundaries(selection) {
		if (!selection || selection.rangeCount === 0) return null;
		const range = selection.getRangeAt(0);
		return {
			startContainer: range.startContainer,
			startOffset: range.startOffset,
			endContainer: range.endContainer,
			endOffset: range.endOffset,
		};
	}

	const sameSelection = (a, b) =>
		a !== null &&
		b !== null &&
		a.startContainer === b.startContainer &&
		a.startOffset === b.startOffset &&
		a.endContainer === b.endContainer &&
		a.endOffset === b.endOffset;

	function place(popup, rect, win) {
		if (!rect) return;
		const box = popup.getBoundingClientRect();
		let top = rect.bottom + GAP;
		if (top + box.height > win.innerHeight) top = rect.top - box.height - GAP;
		const left = Math.min(rect.left, win.innerWidth - box.width - GAP);
		popup.style.top = `${Math.max(GAP, top)}px`;
		popup.style.left = `${Math.max(GAP, left)}px`;
	}

	function install(
		doc = document,
		{
			now = () => Temporal.Now.instant(),
			copy = (text) => copyToClipboard(text, doc),
			settings = userscriptSettings(),
		} = {},
	) {
		const win = doc.defaultView;
		let host = null;
		// Keyboard handling reacts to every keyup; only a changed selection may
		// open the popup again, or Shift and Ctrl+C would undo closing it.
		let lastSelection = null;
		let closePickers = () => false;
		// The page selection survives a click on the popup, so the mouseup of that
		// click would open the popup again right after closing it.
		let ignoreNextMouseUp = false;

		const close = () => {
			host?.remove();
			host = null;
		};

		const isInsidePopup = (event) =>
			host !== null && event.composedPath().includes(host);

		const open = (times, rect) => {
			close();
			// A custom tag escapes page rules written for div, and the important
			// reset beats page rules that still match the host.
			host = doc.createElement("jisa-popup");
			host.setAttribute(HOST_ATTRIBUTE, "");
			host.style.setProperty("all", "initial", "important");
			// The shadow root keeps page styles out of the popup and the popup's styles out of the page.
			const shadow = host.attachShadow({ mode: "open" });
			addPopupStyle(shadow, doc);
			let recentZones = settings.getRecentZones();
			let popup;
			({ popup, closePickers } = buildPopup(doc, {
				times,
				now: now(),
				copy,
				close,
				onLayoutChange: () => place(popup, rect, win),
				recentZones,
				onChoose: (zone) => {
					recentZones = [
						zone,
						...recentZones.filter((recent) => recent !== zone),
					].slice(0, MAX_RECENT_ZONES);
					settings.setRecentZones(recentZones);
				},
			}));
			shadow.append(popup);
			doc.documentElement.append(host);
			place(popup, rect, win);
		};

		const onSelectionEnd = (selection) => {
			const text = selection.text();
			if (text.length === 0 || text.length > MAX_SELECTION_LENGTH) return;
			const times = parseSelection(text, now());
			if (times.length > 0) open(times, selection.rectFor(times[0].source));
		};

		const onKeyUp = (event) => {
			// Pressing a popup button with the keyboard must not rebuild the popup.
			if (isInsidePopup(event)) return;
			const selection = readSelection(doc);
			if (sameSelection(selection.key, lastSelection)) return;
			lastSelection = selection.key;
			onSelectionEnd(selection);
		};

		const onMouseUp = () => {
			if (ignoreNextMouseUp) {
				ignoreNextMouseUp = false;
				return;
			}
			const selection = readSelection(doc);
			lastSelection = selection.key;
			onSelectionEnd(selection);
		};

		const onMouseDown = (event) => {
			const insidePopup = isInsidePopup(event);
			ignoreNextMouseUp = insidePopup;
			// Controls handle their own click; closing here would remove them before it fires.
			if (
				insidePopup &&
				event.composedPath()[0].closest?.('button, input, [role="listbox"]')
			) {
				return;
			}
			close();
		};

		const onKeyDown = (event) => {
			if (event.key !== "Escape" || host === null) return;
			// The page must not also act on an Escape that closed the popup.
			event.preventDefault();
			event.stopImmediatePropagation();
			// Escape in an open time zone list closes only that list.
			if (isInsidePopup(event) && closePickers()) return;
			close();
		};

		const listeners = [
			["mouseup", onMouseUp],
			["keyup", onKeyUp],
			["mousedown", onMouseDown],
			["keydown", onKeyDown],
		];
		for (const [type, listener] of listeners) {
			doc.addEventListener(type, listener, true);
		}

		return () => {
			for (const [type, listener] of listeners) {
				doc.removeEventListener(type, listener, true);
			}
			close();
		};
	}

	// Pages may define a global module; only Node, where the tests run, has process.versions.node.
	if (
		typeof module === "object" &&
		module?.exports &&
		globalThis.process?.versions?.node
	) {
		module.exports = { copyToClipboard, findTimes, install, parseSelection };
	} else {
		install();
	}
})();
