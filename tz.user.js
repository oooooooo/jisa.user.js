// ==UserScript==
// @name         tz.user.js
// @namespace    https://github.com/oooooooo/tz.user.js
// @version      0.1.0
// @description  Convert a selected time to your time zone in a popup
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

	// Returns null for times that do not exist, such as 25:00 or 13pm.
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
		return Temporal.PlainTime.from({ hour, minute });
	}

	// "+05:30", "-3" and "+0100" to minutes east of UTC, or null when out of
	// range. Temporal would carry "+1260" over to +13:00 and reject "+2400".
	function parseSignedOffset(text) {
		const match = /^([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(text);
		const hours = Number(match[2]);
		const minutes = Number(match[3] ?? 0);
		if (hours > 23 || minutes > 59) return null;
		const total = hours * 60 + minutes;
		return match[1] === "-" ? -total : total;
	}

	// Temporal accepts "+05:30" as a fixed-offset time zone.
	function offsetTimeZone(minutes) {
		if (minutes === null) return null;
		const sign = minutes < 0 ? "-" : "+";
		const abs = Math.abs(minutes);
		return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
	}

	function sourceTimeZone(groups) {
		if (groups.offset) {
			return groups.offset === "Z"
				? "UTC"
				: offsetTimeZone(parseSignedOffset(groups.offset));
		}
		const name = groups.zone ?? groups.parenZone;
		if (name in GENERIC_ZONES) return GENERIC_ZONES[name];
		if (name in FIXED_OFFSETS) return offsetTimeZone(FIXED_OFFSETS[name]);
		return offsetTimeZone(parseSignedOffset(name.slice(3)));
	}

	// Returns null when the text has no date. A null year means the year was omitted.
	function dateParts(groups) {
		if (groups.isoDate !== undefined) {
			const [year, month, day] = groups.isoDate.split("-").map(Number);
			return { year, month, day };
		}
		const monthName = groups.mdyMonth ?? groups.dmyMonth;
		if (monthName === undefined) return null;
		const year = groups.mdyYear ?? groups.dmyYear;
		return {
			year: year === undefined ? null : Number(year),
			month: MONTHS.indexOf(monthName.slice(0, 3)) + 1,
			day: Number(groups.mdyDay ?? groups.dmyDay),
		};
	}

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

	// "Dec 31" read on Jan 1 means last year's Dec 31, so pick the closest candidate.
	function closestYearDate(month, day, today) {
		const distance = (date) => Math.abs(today.until(date).days);
		const candidates = [today.year - 1, today.year, today.year + 1]
			.map((year) => plainDate(year, month, day))
			.filter((date) => date !== null);
		if (candidates.length === 0) return null;
		return candidates.reduce((best, date) =>
			distance(date) < distance(best) ? date : best,
		);
	}

	const localTimeZone = () => Temporal.Now.timeZoneId();

	function isValidTimeZone(timeZone) {
		try {
			new Temporal.ZonedDateTime(0n, timeZone);
			return true;
		} catch {
			return false;
		}
	}

	// en-US knows US abbreviations, en-GB European ones and ja-JP knows JST;
	// each gives "GMT+9"-style names for the zones it does not know.
	const LABEL_LOCALES = ["en-US", "en-GB", "ja-JP"];

	function zoneLabel(timeZone, instant) {
		const names = LABEL_LOCALES.map(
			(locale) =>
				new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" })
					.formatToParts(instant)
					.find((part) => part.type === "timeZoneName").value,
		);
		return names.find((name) => !/^GMT[+-]/.test(name)) ?? names[0];
	}

	const formatClock = (dateTime) =>
		dateTime.toPlainTime().toString({ smallestUnit: "minute" });

	function convert({ date, start, end, sourceZone, timeZone, dated }) {
		const toTarget = (time) =>
			date
				.toZonedDateTime({ timeZone: sourceZone, plainTime: time })
				.withTimeZone(timeZone);
		const startTarget = toTarget(start);
		let clock = formatClock(startTarget);
		if (end !== null) clock += `–${formatClock(toTarget(end))}`;
		const label = zoneLabel(timeZone, startTarget.toInstant());
		const targetDate = startTarget.toPlainDate();
		if (dated) return `${targetDate} ${clock} ${label}`;
		const shift = date.until(targetDate).days;
		if (shift === 0) return `${clock} ${label}`;
		return `${clock} ${label} (${shift > 0 ? "+" : ""}${shift}d)`;
	}

	function convertMatch(match, now, timeZone) {
		const { start, end } = match.groups;
		const startTime = parseClock(start);
		const endTime = end === undefined ? null : parseClock(end);
		if (startTime === null || (end !== undefined && endTime === null)) {
			return null;
		}
		const sourceZone = sourceTimeZone(match.groups);
		if (sourceZone === null) return null;
		const today = now.toZonedDateTimeISO(sourceZone).toPlainDate();
		const parts = dateParts(match.groups);
		let date;
		if (parts === null) {
			date = today;
		} else if (parts.year === null) {
			date = closestYearDate(parts.month, parts.day, today);
		} else {
			date = plainDate(parts.year, parts.month, parts.day);
		}
		if (date === null) return null;
		return convert({
			date,
			start: startTime,
			end: endTime,
			sourceZone,
			timeZone,
			dated: parts !== null,
		});
	}

	function findTimes(
		text,
		now = Temporal.Now.instant(),
		timeZone = localTimeZone(),
	) {
		const times = [];
		for (const match of text.matchAll(TIME_PATTERN)) {
			const converted = convertMatch(match, now, timeZone);
			if (converted !== null) times.push({ source: match[0], converted });
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
		select {
			max-width: 100%;
			margin-bottom: 4px;
			color: inherit;
			background: transparent;
			font: 12px/1.6 system-ui, sans-serif;
		}
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

	// Settings are shared across sites through the userscript manager's storage;
	// page storage such as localStorage is separate for every site.
	const userscriptSettings = {
		get: () =>
			typeof GM_getValue === "function" ? GM_getValue("timeZone") : undefined,
		set: (timeZone) => {
			if (typeof GM_setValue === "function") GM_setValue("timeZone", timeZone);
		},
	};

	// An empty string stands for the local time zone.
	function storedTimeZone(settings) {
		const timeZone = settings.get();
		return timeZone && isValidTimeZone(timeZone) ? timeZone : "";
	}

	function buildZoneSelect(doc, selected) {
		const select = doc.createElement("select");
		select.setAttribute("aria-label", "Time zone");
		// Some engines leave UTC out of supportedValuesOf.
		const zones = new Set(["UTC", ...Intl.supportedValuesOf("timeZone")]);
		if (selected) zones.add(selected);
		const local = doc.createElement("option");
		local.value = "";
		local.textContent = `Local (${localTimeZone()})`;
		select.append(local);
		for (const zone of zones) {
			const option = doc.createElement("option");
			option.value = zone;
			option.textContent = zone;
			select.append(option);
		}
		select.value = selected;
		return select;
	}

	function buildRow(doc, { source, converted }, copy) {
		const row = doc.createElement("div");
		row.className = "row";
		const sourceText = doc.createElement("span");
		sourceText.className = "source";
		sourceText.textContent = `${source} →`;
		const convertedText = doc.createElement("strong");
		convertedText.textContent = converted;
		row.append(
			sourceText,
			convertedText,
			buildCopyButton(doc, converted, copy),
		);
		return row;
	}

	function buildPopup(doc, { text, now, settings, copy, close }) {
		const popup = doc.createElement("div");
		popup.className = "popup";
		const closeButton = buildButton(doc, "Close", "×");
		closeButton.className = "close";
		closeButton.addEventListener("click", close);
		const select = buildZoneSelect(doc, storedTimeZone(settings));
		const rows = doc.createElement("div");
		const render = () => {
			const times = findTimes(text, now, select.value || localTimeZone());
			rows.replaceChildren(...times.map((time) => buildRow(doc, time, copy)));
		};
		select.addEventListener("change", () => {
			settings.set(select.value);
			render();
		});
		render();
		popup.append(closeButton, select, rows);
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
		{
			now = () => Temporal.Now.instant(),
			copy = (text) => copyToClipboard(text, doc),
			settings = userscriptSettings,
		} = {},
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

		const open = (text, rect) => {
			close();
			host = doc.createElement("div");
			host.setAttribute(HOST_ATTRIBUTE, "");
			// The shadow root keeps page styles out of the popup and the popup's styles out of the page.
			const shadow = host.attachShadow({ mode: "open" });
			const style = doc.createElement("style");
			style.textContent = POPUP_STYLE;
			const popup = buildPopup(doc, {
				text,
				now: now(),
				settings,
				copy,
				close,
			});
			shadow.append(style, popup);
			doc.documentElement.append(host);
			place(popup, rect, win);
		};

		const onSelectionEnd = () => {
			const selection = win.getSelection();
			const text = selection?.toString() ?? "";
			if (text.length === 0 || text.length > MAX_SELECTION_LENGTH) return;
			if (findTimes(text, now()).length > 0) {
				open(text, selectionRect(selection));
			}
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
			// Controls handle their own click; closing here would remove them before it fires.
			if (insidePopup && event.composedPath()[0].closest?.("button, select")) {
				return;
			}
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
