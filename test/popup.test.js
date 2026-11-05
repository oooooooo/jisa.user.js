// @vitest-environment jsdom
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { install } = require("../tz.user.js");

const NOW = new Date("2026-01-15T00:00:00Z");
const PAGE_HTML = "<p>Starts at <b>10:00 UTC</b> and ends at 11:00 PST.</p>";

function select(node, start = 0, end = node.textContent.length) {
	const range = document.createRange();
	range.setStart(node, start);
	range.setEnd(node, end);
	const selection = window.getSelection();
	selection.removeAllRanges();
	selection.addRange(range);
}

const popupHost = () => document.querySelector("[data-tz-userjs]");

const popupText = () => popupHost()?.shadowRoot.textContent ?? null;

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

	beforeEach(() => {
		document.body.innerHTML = PAGE_HTML;
		copy = vi.fn(() => Promise.resolve());
		uninstall = install(document, () => NOW, copy);
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
		const host = document.querySelector("[data-tz-userjs]");
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
		const host = document.querySelector("[data-tz-userjs]");
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

		expect(document.querySelectorAll("[data-tz-userjs]")).toHaveLength(1);
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
});
