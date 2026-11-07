// @vitest-environment jsdom
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { install } = require("../jisa.user.js");

const NOW = Temporal.Instant.from("2026-01-15T00:00:00Z");
const PAGE_HTML = "<p>Starts at <b>10:00 UTC</b> and ends at 11:00 PST.</p>";

function select(node, start = 0, end = node.textContent.length) {
	const range = document.createRange();
	range.setStart(node, start);
	range.setEnd(node, end);
	const selection = window.getSelection();
	selection.removeAllRanges();
	selection.addRange(range);
}

const popupHost = () => document.querySelector("[data-jisa]");

const popupText = () => popupHost()?.shadowRoot.textContent ?? null;

const shadow = () => popupHost().shadowRoot;

const zoneToggles = () => [
	...shadow().querySelectorAll('button[aria-haspopup="listbox"]'),
];

const searchBoxes = () => [
	...shadow().querySelectorAll('input[type="search"]'),
];

const openSearchBox = () =>
	searchBoxes().find((input) => !input.closest("[hidden]"));

const visibleOptions = () =>
	[...shadow().querySelectorAll('[role="option"]')]
		.filter((option) => !option.hidden && !option.closest("[hidden]"))
		.map((option) => option.textContent);

function search(query) {
	const input = openSearchBox();
	input.value = query;
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function press(key) {
	openSearchBox().dispatchEvent(
		new KeyboardEvent("keydown", { key, bubbles: true, composed: true }),
	);
}

const optionFor = (zone) =>
	[...shadow().querySelectorAll('[role="option"]')].find(
		(option) => option.dataset.zone === zone && !option.closest("[hidden]"),
	);

const popupButtons = (label) =>
	[...popupHost().shadowRoot.querySelectorAll("button")].filter(
		(button) => button.getAttribute("aria-label") === label,
	);

// A real click fires mousedown, mouseup and click on the same element.
function click(element) {
	for (const type of ["mousedown", "mouseup", "click"]) {
		element.dispatchEvent(
			new MouseEvent(type, { bubbles: true, composed: true }),
		);
	}
}

function openPopupFor(node, start, end) {
	select(node, start, end);
	document.dispatchEvent(new MouseEvent("mouseup"));
}

describe("install", () => {
	let uninstall;
	let copy;
	let settings;

	beforeEach(() => {
		document.body.innerHTML = PAGE_HTML;
		copy = vi.fn(() => Promise.resolve());
		settings = { getRecentZones: vi.fn(() => []), setRecentZones: vi.fn() };
		uninstall = install(document, { now: () => NOW, copy, settings });
	});

	afterEach(() => {
		uninstall();
		window.getSelection().removeAllRanges();
	});

	it("shows the JST time of the selected text in a popup", () => {
		select(document.querySelector("b").firstChild);
		document.dispatchEvent(new MouseEvent("mouseup"));

		expect(popupText()).toContain("10:00 UTC");
		expect(popupText()).toContain("19:00 JST");
	});

	it("lists every time in a selection spanning several nodes", () => {
		select(document.querySelector("p"), 0, 3);
		document.dispatchEvent(new MouseEvent("mouseup"));

		expect(popupText()).toContain("19:00 JST");
		expect(popupText()).toContain("04:00 JST (+1d)");
	});

	it("also reacts to keyboard selection", () => {
		select(document.querySelector("b").firstChild);
		document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));

		expect(popupText()).toContain("19:00 JST");
	});

	it("does not show a popup when the selection has no time", () => {
		select(document.querySelector("p").firstChild);
		document.dispatchEvent(new MouseEvent("mouseup"));

		expect(popupText()).toBeNull();
	});

	it("leaves the page content untouched", () => {
		select(document.querySelector("b").firstChild);
		document.dispatchEvent(new MouseEvent("mouseup"));

		expect(document.body.innerHTML).toBe(PAGE_HTML);
	});

	it("closes the popup on mousedown outside it", () => {
		select(document.querySelector("b").firstChild);
		document.dispatchEvent(new MouseEvent("mouseup"));
		document.body.dispatchEvent(
			new MouseEvent("mousedown", { bubbles: true, composed: true }),
		);

		expect(popupText()).toBeNull();
	});

	it("closes the popup when it is clicked", () => {
		select(document.querySelector("b").firstChild);
		document.dispatchEvent(new MouseEvent("mouseup"));
		const host = document.querySelector("[data-jisa]");
		host.shadowRoot.firstElementChild.dispatchEvent(
			new MouseEvent("mousedown", { bubbles: true, composed: true }),
		);
		document.body.dispatchEvent(
			new MouseEvent("mouseup", { bubbles: true, composed: true }),
		);

		expect(popupText()).toBeNull();
	});

	it("opens again on the next selection after the popup is clicked", () => {
		select(document.querySelector("b").firstChild);
		document.dispatchEvent(new MouseEvent("mouseup"));
		const host = document.querySelector("[data-jisa]");
		host.shadowRoot.firstElementChild.dispatchEvent(
			new MouseEvent("mousedown", { bubbles: true, composed: true }),
		);
		document.dispatchEvent(new MouseEvent("mouseup"));
		document.dispatchEvent(new MouseEvent("mousedown"));
		document.dispatchEvent(new MouseEvent("mouseup"));

		expect(popupText()).toContain("19:00 JST");
	});

	it("closes the popup on Escape", () => {
		select(document.querySelector("b").firstChild);
		document.dispatchEvent(new MouseEvent("mouseup"));
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape" }));

		expect(popupText()).toBeNull();
	});

	it("replaces the popup instead of stacking a second one", () => {
		select(document.querySelector("b").firstChild);
		document.dispatchEvent(new MouseEvent("mouseup"));
		document.dispatchEvent(new MouseEvent("mouseup"));

		expect(document.querySelectorAll("[data-jisa]")).toHaveLength(1);
	});

	describe("copy button", () => {
		it("copies the JST time of its row", () => {
			openPopupFor(document.querySelector("p"), 0, 3);

			click(popupButtons("Copy")[1]);

			expect(copy).toHaveBeenCalledWith("04:00 JST (+1d)");
		});

		it("keeps the popup open and reports success", async () => {
			openPopupFor(document.querySelector("b").firstChild);
			const host = popupHost();
			const [button] = popupButtons("Copy");

			click(button);
			await vi.waitFor(() => expect(button.textContent).toBe("Copied"));

			expect(popupHost()).toBe(host);
		});

		it("reports a failed copy", async () => {
			copy.mockReturnValue(Promise.reject(new Error("denied")));
			openPopupFor(document.querySelector("b").firstChild);
			const [button] = popupButtons("Copy");

			click(button);

			await vi.waitFor(() => expect(button.textContent).toBe("Failed"));
		});

		it("does not rebuild the popup when pressed with the keyboard", () => {
			openPopupFor(document.querySelector("b").firstChild);
			const host = popupHost();

			popupButtons("Copy")[0].dispatchEvent(
				new KeyboardEvent("keyup", {
					key: "Enter",
					bubbles: true,
					composed: true,
				}),
			);

			expect(popupHost()).toBe(host);
		});
	});

	describe("close button", () => {
		it("closes the popup without reopening it", () => {
			openPopupFor(document.querySelector("b").firstChild);

			click(popupButtons("Close")[0]);

			expect(popupText()).toBeNull();
		});

		it("is shown once regardless of the number of rows", () => {
			openPopupFor(document.querySelector("p"), 0, 3);

			expect(popupButtons("Close")).toHaveLength(1);
		});
	});

	describe("time zone picker", () => {
		const openPicker = (index = 0) => {
			openPopupFor(document.querySelector("b").firstChild);
			click(zoneToggles()[index]);
		};

		it("shows the time in the local time zone by default", () => {
			openPopupFor(document.querySelector("b").firstChild);

			expect(Temporal.Now.timeZoneId()).toBe("Asia/Tokyo");
			expect(zoneToggles()[0].textContent).toBe("Asia/Tokyo — 19:00 JST");
		});

		it("has one picker per time", () => {
			openPopupFor(document.querySelector("p"), 0, 3);

			expect(zoneToggles()).toHaveLength(2);
		});

		it("does not build the list until it is opened", () => {
			openPopupFor(document.querySelector("b").firstChild);

			expect(shadow().querySelectorAll('[role="option"]')).toHaveLength(0);
		});

		it("opens a list of every time zone with a focused search box on top", () => {
			openPicker();

			const options = visibleOptions();
			expect(options).toContain("America/New_York — 05:00 EST");
			expect(options).toContain("UTC — 10:00 UTC");
			expect(options.length).toBeGreaterThan(300);
			expect(shadow().activeElement).toBe(openSearchBox());
			const panel = openSearchBox().parentElement;
			expect(panel.firstElementChild).toBe(openSearchBox());
		});

		it("filters the list as the query is typed", () => {
			openPicker();

			search("new york");

			expect(visibleOptions()).toEqual(["America/New_York — 05:00 EST"]);
		});

		it("also matches the converted time", () => {
			openPicker();

			search("EST");

			expect(visibleOptions()).toContain("America/New_York — 05:00 EST");
			expect(visibleOptions()).not.toContain("Asia/Tokyo — 19:00 JST");
			// Words are matched from their start: "est" is not in "Budapest".
			expect(
				visibleOptions().some((option) => option.startsWith("Europe/Budapest")),
			).toBe(false);
		});

		it("chooses a clicked option and copies its time", () => {
			openPicker();
			search("new york");

			click(optionFor("America/New_York"));
			click(popupButtons("Copy")[0]);

			expect(zoneToggles()[0].textContent).toBe("America/New_York — 05:00 EST");
			expect(openSearchBox()).toBeUndefined();
			expect(copy).toHaveBeenCalledWith("05:00 EST");
		});

		it("chooses the highlighted option with the arrow keys and Enter", () => {
			openPicker();
			search("america/new");

			press("ArrowDown");
			press("ArrowUp");
			press("Enter");

			expect(zoneToggles()[0].textContent).toBe("America/New_York — 05:00 EST");
		});

		it("keeps keys typed in the search box from the page", () => {
			const pageListener = vi.fn();
			document.addEventListener("keydown", pageListener);
			try {
				openPicker();
				for (const type of ["keydown", "keypress", "keyup"]) {
					openSearchBox().dispatchEvent(
						new KeyboardEvent(type, {
							key: "s",
							bubbles: true,
							composed: true,
						}),
					);
				}

				expect(pageListener).not.toHaveBeenCalled();
			} finally {
				document.removeEventListener("keydown", pageListener);
			}
		});

		it("closes only the list on Escape", () => {
			openPicker();

			press("Escape");

			expect(openSearchBox()).toBeUndefined();
			expect(popupHost()).not.toBeNull();
		});

		it("keeps a single list open", () => {
			openPopupFor(document.querySelector("p"), 0, 3);

			click(zoneToggles()[0]);
			click(zoneToggles()[1]);

			expect(
				searchBoxes().filter((input) => !input.closest("[hidden]")),
			).toHaveLength(1);
		});
	});

	it("shows the source text without an arrow", () => {
		openPopupFor(document.querySelector("b").firstChild);

		expect(shadow().querySelector(".source").textContent).toBe("10:00 UTC");
	});

	describe("position", () => {
		const rect = ({ left, top, right, bottom }) => ({
			left,
			top,
			right,
			bottom,
			width: right - left,
			height: bottom - top,
		});

		// Where the text of each element is laid out.
		const TEXT_RECTS = {
			time: rect({ left: 10, top: 100, right: 200, bottom: 120 }),
			after: rect({ left: 10, top: 200, right: 120, bottom: 220 }),
			next: rect({ left: 10, top: 380, right: 80, bottom: 400 }),
			split: rect({ left: 10, top: 500, right: 200, bottom: 520 }),
			low: rect({ left: 10, top: 580, right: 120, bottom: 600 }),
			bold: rect({ left: 120, top: 500, right: 160, bottom: 520 }),
		};
		// The box of #spacer, which a range ending in #next fully contains.
		const SPACER_RECT = rect({ left: 0, top: 220, right: 600, bottom: 380 });

		function selectedPart(range, node) {
			const start = node === range.startContainer ? range.startOffset : 0;
			const end = node === range.endContainer ? range.endOffset : node.length;
			return node.data.slice(start, end);
		}

		function textRects(range) {
			const walker = document.createTreeWalker(
				document.body,
				NodeFilter.SHOW_TEXT,
			);
			const rects = [];
			while (walker.nextNode()) {
				const node = walker.currentNode;
				if (!range.intersectsNode(node)) continue;
				// Like a browser, whitespace between blocks has no box.
				if (selectedPart(range, node).trim() === "") continue;
				rects.push(TEXT_RECTS[node.parentElement.id]);
			}
			return rects;
		}

		// jsdom has no layout, so the fake returns fixed boxes. A range whose
		// boundary is an element also gets the boxes of the elements it contains.
		beforeEach(() => {
			document.body.innerHTML = [
				'<p id="time">Oct 29, 2026 - 15:14 UTC</p>',
				'<p id="after">More updates soon</p>',
				'<div id="spacer"></div>',
				'<div id="next">Uptime</div>',
				'<p id="split">Oct 30, 2026 - <b id="bold">09:00</b> UTC</p>',
				'<p id="low">10:00 UTC</p>',
			].join("\n");
			Range.prototype.getClientRects = function () {
				const inText =
					this.startContainer.nodeType === Node.TEXT_NODE &&
					this.endContainer.nodeType === Node.TEXT_NODE;
				return inText ? textRects(this) : [...textRects(this), SPACER_RECT];
			};
			Range.prototype.getBoundingClientRect = function () {
				const rects = this.getClientRects();
				return rect({
					left: Math.min(...rects.map((r) => r.left)),
					top: Math.min(...rects.map((r) => r.top)),
					right: Math.max(...rects.map((r) => r.right)),
					bottom: Math.max(...rects.map((r) => r.bottom)),
				});
			};
		});

		afterEach(() => {
			delete Range.prototype.getClientRects;
			delete Range.prototype.getBoundingClientRect;
		});

		const popupBox = () => shadow().querySelector(".popup");

		function selectRange(startNode, startOffset, endNode, endOffset) {
			const range = document.createRange();
			range.setStart(startNode, startOffset);
			range.setEnd(endNode, endOffset);
			window.getSelection().removeAllRanges();
			window.getSelection().addRange(range);
			document.dispatchEvent(new MouseEvent("mouseup"));
		}

		const textOf = (id) => document.getElementById(id).firstChild;

		it("opens right below the time", () => {
			openPopupFor(textOf("time"));

			expect(popupBox().style.top).toBe("126px");
		});

		it("ignores the following blocks a triple-click selection ends in", () => {
			selectRange(textOf("time"), 0, document.getElementById("after"), 0);

			expect(popupBox().style.top).toBe("126px");
		});

		it("stays at the time when the selection continues past it", () => {
			const after = textOf("after");
			selectRange(textOf("time"), 0, after, after.length);

			expect(popupBox().style.top).toBe("126px");
		});

		it("finds a time split over several text nodes", () => {
			const split = document.getElementById("split");
			selectRange(split, 0, split, split.childNodes.length);

			expect(popupBox().style.top).toBe("526px");
		});

		it("opens below the first time when several are selected", () => {
			const split = document.getElementById("split");
			selectRange(textOf("time"), 0, split, split.childNodes.length);

			expect(popupBox().style.top).toBe("126px");
		});

		it("moves up when the opened list would run off the bottom", () => {
			const original = Element.prototype.getBoundingClientRect;
			// The popup is 60px tall, or 300px with a list open; the viewport is 768px.
			Element.prototype.getBoundingClientRect = function () {
				if (!this.classList.contains("popup")) return original.call(this);
				const open = this.querySelector(".panel:not([hidden])");
				return rect({ left: 0, top: 0, right: 300, bottom: open ? 300 : 60 });
			};
			try {
				openPopupFor(textOf("low"));
				expect(popupBox().style.top).toBe("606px");

				click(zoneToggles()[0]);

				expect(popupBox().style.top).toBe("274px");
			} finally {
				Element.prototype.getBoundingClientRect = original;
			}
		});
	});
	describe("dismissal", () => {
		it("does not reopen after Escape when a key is released", () => {
			openPopupFor(document.querySelector("b").firstChild);
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

			document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));

			expect(popupText()).toBeNull();
		});

		it("does not reopen after the close button when Ctrl+C is released", () => {
			openPopupFor(document.querySelector("b").firstChild);
			click(popupButtons("Close")[0]);

			document.dispatchEvent(
				new KeyboardEvent("keyup", { key: "c", ctrlKey: true }),
			);

			expect(popupText()).toBeNull();
		});

		it("opens again once the selection changes", () => {
			openPopupFor(document.querySelector("b").firstChild);
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

			select(document.querySelector("p"), 0, 3);
			document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));

			expect(popupText()).toContain("19:00 JST");
		});

		it("keeps Escape from the page when it closes the popup", () => {
			const pageListener = vi.fn();
			document.addEventListener("keydown", pageListener);
			try {
				openPopupFor(document.querySelector("b").firstChild);
				document.dispatchEvent(
					new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
				);
				expect(pageListener).not.toHaveBeenCalled();

				document.dispatchEvent(
					new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
				);
				expect(pageListener).toHaveBeenCalledTimes(1);
			} finally {
				document.removeEventListener("keydown", pageListener);
			}
		});
	});

	describe("many times", () => {
		it("shows at most 20 times and counts the rest", () => {
			document.body.innerHTML = `<p>${Array.from(
				{ length: 25 },
				(_, i) => `${String(i % 24).padStart(2, "0")}:00 UTC`,
			).join(", ")}</p>`;
			openPopupFor(document.querySelector("p").firstChild);

			expect(zoneToggles()).toHaveLength(20);
			expect(popupText()).toContain("and 5 more");
		});
	});

	describe("host element", () => {
		it("uses its own tag and resets page styles with !important", () => {
			openPopupFor(document.querySelector("b").firstChild);

			expect(popupHost().tagName).toBe("JISA-POPUP");
			expect(popupHost().style.getPropertyValue("all")).toBe("initial");
			expect(popupHost().style.getPropertyPriority("all")).toBe("important");
		});

		it("uses a constructed style sheet when the browser supports it", () => {
			let adopted = [];
			Object.defineProperty(ShadowRoot.prototype, "adoptedStyleSheets", {
				configurable: true,
				get: () => adopted,
				set: (sheets) => {
					adopted = sheets;
				},
			});
			try {
				openPopupFor(document.querySelector("b").firstChild);

				expect(adopted).toHaveLength(1);
				expect(shadow().querySelector("style")).toBeNull();
			} finally {
				delete ShadowRoot.prototype.adoptedStyleSheets;
			}
		});
	});
	describe("more than zoned times", () => {
		it("converts a Unix timestamp", () => {
			document.body.innerHTML = "<p><b>1768435200</b></p>";
			openPopupFor(document.querySelector("b").firstChild);

			expect(zoneToggles()[0].textContent).toBe(
				"Asia/Tokyo — 2026-01-15 09:00 JST",
			);
			expect(shadow().querySelector(".note").textContent).toBe("Unix time");
		});

		it("converts a Unix timestamp in milliseconds", () => {
			document.body.innerHTML = "<p><b>1768435200000</b></p>";
			openPopupFor(document.querySelector("b").firstChild);

			expect(zoneToggles()[0].textContent).toBe(
				"Asia/Tokyo — 2026-01-15 09:00 JST",
			);
		});

		it("reads a time without a zone as local time", () => {
			document.body.innerHTML = "<p>Lunch at <b>15:00</b></p>";
			openPopupFor(document.querySelector("b").firstChild);
			click(zoneToggles()[0]);

			expect(shadow().querySelector(".note").textContent).toBe(
				"local time (Asia/Tokyo)",
			);
			expect(visibleOptions()).toContain("America/New_York — 01:00 EST");
		});

		it("ignores a decimal number that only looks like a time", () => {
			document.body.innerHTML = "<p>Version <b>1.10</b></p>";
			openPopupFor(document.querySelector("b").firstChild);

			expect(popupText()).toBeNull();
		});

		it("prefers zoned times over local guesses", () => {
			openPopupFor(document.querySelector("p"), 0, 3);

			expect(shadow().querySelector(".note")).toBeNull();
		});

		it("shows how far the time is from now", () => {
			openPopupFor(document.querySelector("b").firstChild);

			expect(shadow().querySelector(".relative").textContent).toBe(
				"in 10 hours",
			);
		});

		it("converts a time selected inside a text field", () => {
			document.body.innerHTML = "<textarea>Starts at 10:00 UTC</textarea>";
			const field = document.querySelector("textarea");
			field.focus();
			field.setSelectionRange(10, 19);
			document.dispatchEvent(new MouseEvent("mouseup"));

			expect(zoneToggles()[0].textContent).toBe("Asia/Tokyo — 19:00 JST");
		});
	});

	describe("recent time zones", () => {
		it("remembers a chosen time zone", () => {
			openPopupFor(document.querySelector("b").firstChild);
			click(zoneToggles()[0]);
			search("new york");
			click(optionFor("America/New_York"));

			expect(settings.setRecentZones).toHaveBeenCalledWith([
				"America/New_York",
			]);
		});

		it("keeps the three most recent, newest first", () => {
			settings.getRecentZones.mockReturnValue([
				"Europe/London",
				"Asia/Seoul",
				"UTC",
			]);
			openPopupFor(document.querySelector("b").firstChild);
			click(zoneToggles()[0]);
			search("new york");
			click(optionFor("America/New_York"));

			expect(settings.setRecentZones).toHaveBeenCalledWith([
				"America/New_York",
				"Europe/London",
				"Asia/Seoul",
			]);
		});

		it("shows the time in recent zones next to the local one", () => {
			settings.getRecentZones.mockReturnValue(["America/New_York"]);
			openPopupFor(document.querySelector("b").firstChild);

			const extra = shadow().querySelector(".extra");
			expect(extra.textContent).toContain("America/New_York — 05:00 EST");
			click(extra.querySelector("button"));
			expect(copy).toHaveBeenCalledWith("05:00 EST");
		});

		it("keeps every zone chosen in the same popup", () => {
			openPopupFor(document.querySelector("b").firstChild);
			click(zoneToggles()[0]);
			search("new york");
			click(optionFor("America/New_York"));
			click(zoneToggles()[0]);
			search("london");
			click(optionFor("Europe/London"));

			expect(settings.setRecentZones).toHaveBeenLastCalledWith([
				"Europe/London",
				"America/New_York",
			]);
		});

		it("lists recent zones first", () => {
			settings.getRecentZones.mockReturnValue(["America/New_York"]);
			openPopupFor(document.querySelector("b").firstChild);
			click(zoneToggles()[0]);

			expect(visibleOptions()[0]).toBe("America/New_York — 05:00 EST");
		});
	});
});
