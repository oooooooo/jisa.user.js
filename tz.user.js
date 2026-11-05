// ==UserScript==
// @name         tz.user.js
// @namespace    https://github.com/oooooooo/tz.user.js
// @version      0.1.0
// @description  Show the JST equivalent of a selected time in a popup
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
	const JST_OFFSET = 9 * 60;
	const MINUTES_PER_DAY = 24 * 60;

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
	};

	// Generic names do not say whether DST applies, so the offset depends on the date.
	const GENERIC_ZONES = {
		PT: "America/Los_Angeles",
		MT: "America/Denver",
		CT: "America/Chicago",
		ET: "America/New_York",
		AKT: "America/Anchorage",
	};

	// Longest first so that alternation prefers EST over ET-like prefixes.
	const ABBREVIATIONS = [
		...Object.keys(FIXED_OFFSETS),
		...Object.keys(GENERIC_ZONES),
	]
		.sort((a, b) => b.length - a.length)
		.join("|");

	const MERIDIEM = String.raw`\s*[aApP]\.?[mM]\.?`;
	const CLOCK = String.raw`(?:\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:${MERIDIEM})?|\d{1,2}${MERIDIEM})`;
	const ZONE_NAME = String.raw`(?:(?:UTC|GMT)[+-]\d{1,2}(?::?\d{2})?|${ABBREVIATIONS})`;

	const MONTHS = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	const MONTH_NAME =
		"Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
	const ORDINAL = "(?:st|nd|rd|th)?";
	const DATE_TIME_SEPARATOR = String.raw`(?:,?\s+(?:at\s+)?|,?\s*[-–—@]\s*)`;
	const ISO_DATE = String.raw`(?<isoDate>\d{4}-\d{2}-\d{2})[T ]`;
	// "Nov 6, 2026" and "November 6th"
	const MONTH_DAY_YEAR = String.raw`(?<mdyMonth>${MONTH_NAME})\.?\s+(?<mdyDay>\d{1,2})${ORDINAL}(?:,?\s+(?<mdyYear>\d{4}))?${DATE_TIME_SEPARATOR}`;
	// "6 Nov 2026" and "6th November"
	const DAY_MONTH_YEAR = String.raw`(?<dmyDay>\d{1,2})${ORDINAL}\s+(?<dmyMonth>${MONTH_NAME})\.?(?:,?\s+(?<dmyYear>\d{4}))?${DATE_TIME_SEPARATOR}`;

	const TIME_PATTERN = new RegExp(
		String.raw`(?<![\w:.])` +
			`(?:${ISO_DATE}|${MONTH_DAY_YEAR}|${DAY_MONTH_YEAR})?` +
			`(?<start>${CLOCK})` +
			String.raw`(?:\s*(?:-|–|—|~|〜|to)\s*(?<end>${CLOCK}))?` +
			String.raw`(?:(?<offset>Z|[+-]\d{2}:?\d{2})|\s*(?:\((?<parenZone>${ZONE_NAME})\)|(?<zone>${ZONE_NAME})))` +
			String.raw`(?!\w)`,
		"g",
	);

	const pad = (n) => String(n).padStart(2, "0");

	const mod = (n, m) => ((n % m) + m) % m;

	function parseClock(text) {
		const match = /^(\d{1,2})(?::(\d{2}))?.*?(?:([aApP])\.?[mM]\.?)?$/.exec(
			text,
		);
		let hour = Number(match[1]);
		const minute = Number(match[2] ?? 0);
		const meridiem = match[3]?.toLowerCase();
		if (minute > 59) return null;
		if (meridiem) {
			if (hour < 1 || hour > 12) return null;
			hour = (hour % 12) + (meridiem === "p" ? 12 : 0);
		} else if (hour > 23) {
			return null;
		}
		return hour * 60 + minute;
	}

	function parseSignedOffset(text) {
		const match = /^([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(text);
		const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
		return match[1] === "-" ? -minutes : minutes;
	}

	function ianaOffset(timeZone, date) {
		const name = new Intl.DateTimeFormat("en-US", {
			timeZone,
			timeZoneName: "longOffset",
		})
			.formatToParts(date)
			.find((part) => part.type === "timeZoneName").value;
		return name === "GMT" ? 0 : parseSignedOffset(name.slice(3));
	}

	// Returns a function from an instant to the zone's UTC offset in minutes.
	function resolveZone(groups) {
		if (groups.offset) {
			const offset =
				groups.offset === "Z" ? 0 : parseSignedOffset(groups.offset);
			return () => offset;
		}
		const name = groups.zone ?? groups.parenZone;
		if (name in GENERIC_ZONES) {
			return (date) => ianaOffset(GENERIC_ZONES[name], date);
		}
		if (name in FIXED_OFFSETS) {
			return () => FIXED_OFFSETS[name];
		}
		const offset = parseSignedOffset(name.slice(3));
		return () => offset;
	}

	// Returns null when the text has no date. A null year means the year was omitted.
	function dateParts(groups) {
		if (groups.isoDate !== undefined) {
			const [year, month, day] = groups.isoDate.split("-").map(Number);
			return { year, month: month - 1, day };
		}
		const monthName = groups.mdyMonth ?? groups.dmyMonth;
		if (monthName === undefined) return null;
		const year = groups.mdyYear ?? groups.dmyYear;
		return {
			year: year === undefined ? null : Number(year),
			month: MONTHS.indexOf(monthName.slice(0, 3)),
			day: Number(groups.mdyDay ?? groups.dmyDay),
		};
	}

	// Returns null for dates that do not exist, such as Feb 30.
	function utcDate(year, month, day) {
		const ms = Date.UTC(year, month, day);
		const date = new Date(ms);
		if (date.getUTCMonth() !== month || date.getUTCDate() !== day) {
			return null;
		}
		return ms;
	}

	// "Dec 31" read on Jan 1 means last year's Dec 31, so pick the closest candidate.
	function closestYearDate(month, day, now) {
		const year = now.getUTCFullYear();
		const candidates = [year - 1, year, year + 1]
			.map((y) => utcDate(y, month, day))
			.filter((ms) => ms !== null);
		if (candidates.length === 0) return null;
		const distance = (ms) => Math.abs(ms - now.getTime());
		return candidates.reduce((best, ms) =>
			distance(ms) < distance(best) ? ms : best,
		);
	}

	function formatJstDate(utcMs) {
		const jst = new Date(utcMs + JST_OFFSET * 60_000);
		return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}`;
	}

	function formatClock(minutes) {
		const m = mod(minutes, MINUTES_PER_DAY);
		return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
	}

	function convertDated(dateMs, start, end, offsetAt) {
		const toUtc = (localMinutes) => {
			const localMs = dateMs + localMinutes * 60_000;
			// Look up the offset twice so that the instant used lies on the right side of a DST switch.
			const guess = localMs - offsetAt(new Date(localMs)) * 60_000;
			return localMs - offsetAt(new Date(guess)) * 60_000;
		};
		const startUtc = toUtc(start);
		const startJst = Math.floor(startUtc / 60_000) + JST_OFFSET;
		let clock = formatClock(startJst);
		if (end !== null) {
			clock += `–${formatClock(Math.floor(toUtc(end) / 60_000) + JST_OFFSET)}`;
		}
		return `${formatJstDate(startUtc)} ${clock} JST`;
	}

	function convertUndated(start, end, offset) {
		const toJst = (localMinutes) => localMinutes - offset + JST_OFFSET;
		const startJst = toJst(start);
		let clock = formatClock(startJst);
		if (end !== null) {
			clock += `–${formatClock(toJst(end))}`;
		}
		const shift = Math.floor(startJst / MINUTES_PER_DAY);
		if (shift === 0) return `${clock} JST`;
		return `${clock} JST (${shift > 0 ? "+" : ""}${shift}d)`;
	}

	function convertMatch(match, now) {
		const { start, end } = match.groups;
		const startMinutes = parseClock(start);
		const endMinutes = end === undefined ? null : parseClock(end);
		if (startMinutes === null || (end !== undefined && endMinutes === null)) {
			return null;
		}
		const offsetAt = resolveZone(match.groups);
		const parts = dateParts(match.groups);
		if (parts === null) {
			return convertUndated(startMinutes, endMinutes, offsetAt(now));
		}
		const dateMs =
			parts.year === null
				? closestYearDate(parts.month, parts.day, now)
				: utcDate(parts.year, parts.month, parts.day);
		if (dateMs === null) return null;
		return convertDated(dateMs, startMinutes, endMinutes, offsetAt);
	}

	function findTimes(text, now = new Date()) {
		const times = [];
		for (const match of text.matchAll(TIME_PATTERN)) {
			const jst = convertMatch(match, now);
			if (jst !== null) times.push({ source: match[0], jst });
		}
		return times;
	}

	const HOST_ATTRIBUTE = "data-tz-userjs";
	// Selecting a whole page should not make every mouseup scan megabytes of text.
	const MAX_SELECTION_LENGTH = 2000;
	const GAP = 6;
	const COPY_LABEL = "Copy";
	const COPY_RESULT_DURATION = 1500;

	const POPUP_STYLE = `
		:host { all: initial; }
		.popup {
			position: fixed;
			z-index: 2147483647;
			max-width: 420px;
			padding: 6px 28px 6px 10px;
			border: 1px solid #c8c8c8;
			border-radius: 6px;
			background: #ffffff;
			color: #1f1f1f;
			box-shadow: 0 2px 8px rgb(0 0 0 / 20%);
			font: 13px/1.5 system-ui, sans-serif;
			user-select: text;
		}
		.row { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
		.source { color: #6b6b6b; }
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
			.source { color: #a8a8a8; }
			button { border-color: #4a4a4a; }
			button:hover { background: rgb(255 255 255 / 12%); }
		}
	`;

	function selectionRect(selection) {
		if (selection.rangeCount === 0) return null;
		// jsdom does not implement Range#getBoundingClientRect.
		return selection
			.getRangeAt(selection.rangeCount - 1)
			.getBoundingClientRect?.();
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
		button.setAttribute("aria-label", label);
		button.textContent = text;
		return button;
	}

	function buildCopyButton(doc, text, copy) {
		const button = buildButton(doc, COPY_LABEL, COPY_LABEL);
		button.addEventListener("click", () => {
			// Call copy synchronously: clipboard APIs require a live user activation.
			let copied;
			try {
				copied = Promise.resolve(copy(text));
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

	function buildPopup(doc, times, { copy, close }) {
		const popup = doc.createElement("div");
		popup.className = "popup";
		const closeButton = buildButton(doc, "Close", "×");
		closeButton.className = "close";
		closeButton.addEventListener("click", close);
		popup.append(closeButton);
		for (const { source, jst } of times) {
			const row = doc.createElement("div");
			row.className = "row";
			const sourceText = doc.createElement("span");
			sourceText.className = "source";
			sourceText.textContent = `${source} →`;
			const jstText = doc.createElement("strong");
			jstText.textContent = jst;
			row.append(sourceText, jstText, buildCopyButton(doc, jst, copy));
			popup.append(row);
		}
		return popup;
	}

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
		now = () => new Date(),
		copy = (text) => copyToClipboard(text, doc),
	) {
		const win = doc.defaultView;
		let host = null;
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
			host = doc.createElement("div");
			host.setAttribute(HOST_ATTRIBUTE, "");
			// The shadow root keeps page styles out of the popup and the popup's styles out of the page.
			const shadow = host.attachShadow({ mode: "open" });
			const style = doc.createElement("style");
			style.textContent = POPUP_STYLE;
			const popup = buildPopup(doc, times, { copy, close });
			shadow.append(style, popup);
			doc.documentElement.append(host);
			place(popup, rect, win);
		};

		const onSelectionEnd = () => {
			const selection = win.getSelection();
			const text = selection?.toString() ?? "";
			if (text.length === 0 || text.length > MAX_SELECTION_LENGTH) return;
			const times = findTimes(text, now());
			if (times.length > 0) open(times, selectionRect(selection));
		};

		const onKeyUp = (event) => {
			// Pressing a popup button with the keyboard must not rebuild the popup.
			if (isInsidePopup(event)) return;
			// Escape closes the popup on keydown; reopening it on keyup would undo that.
			if (event.key !== "Escape") onSelectionEnd();
		};

		const onMouseUp = () => {
			if (ignoreNextMouseUp) {
				ignoreNextMouseUp = false;
				return;
			}
			onSelectionEnd();
		};

		const onMouseDown = (event) => {
			const insidePopup = isInsidePopup(event);
			ignoreNextMouseUp = insidePopup;
			// Buttons handle their own click; closing here would remove them before it fires.
			if (insidePopup && event.composedPath()[0].closest?.("button")) return;
			close();
		};

		const onKeyDown = (event) => {
			if (event.key === "Escape") close();
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

	if (typeof module === "object" && module.exports) {
		module.exports = { copyToClipboard, findTimes, install };
	} else {
		install();
	}
})();
