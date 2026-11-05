// @vitest-environment jsdom
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { copyToClipboard } = require("../tz.user.js");

const JST = "2026-11-06 00:00 JST";

function stubClipboard(writeText) {
	Object.defineProperty(navigator, "clipboard", {
		value: writeText ? { writeText } : undefined,
		configurable: true,
	});
}

// Mimics a browser: execCommand("copy") fires a copy event whose default
// action copies the page selection.
function stubExecCommand() {
	const clipboard = new Map();
	document.execCommand = vi.fn(() => {
		const event = new Event("copy", { bubbles: true, cancelable: true });
		event.clipboardData = {
			setData: (type, data) => clipboard.set(type, data),
		};
		document.body.dispatchEvent(event);
		if (!event.defaultPrevented) {
			clipboard.set("text/plain", window.getSelection().toString());
		}
		return true;
	});
	return clipboard;
}

describe("copyToClipboard", () => {
	beforeEach(() => {
		document.body.innerHTML = "<p>Nov 05, 2026 - 15:00 UTC</p>";
		const range = document.createRange();
		range.selectNodeContents(document.querySelector("p"));
		window.getSelection().addRange(range);
	});

	afterEach(() => {
		window.getSelection().removeAllRanges();
		delete navigator.clipboard;
		delete document.execCommand;
	});

	it("writes the text with the Clipboard API when it is available", async () => {
		const writeText = vi.fn(() => Promise.resolve());
		stubClipboard(writeText);
		stubExecCommand();

		await copyToClipboard(JST, document);

		expect(writeText).toHaveBeenCalledWith(JST);
		expect(document.execCommand).not.toHaveBeenCalled();
	});

	it("copies the given text, not the page selection, without the Clipboard API", async () => {
		stubClipboard(undefined);
		const clipboard = stubExecCommand();

		await copyToClipboard(JST, document);

		expect(clipboard.get("text/plain")).toBe(JST);
	});

	it("keeps page copy handlers from overwriting the text", async () => {
		stubClipboard(undefined);
		const clipboard = stubExecCommand();
		const pageHandler = (event) => {
			event.clipboardData.setData("text/plain", "page");
		};
		document.addEventListener("copy", pageHandler);

		await copyToClipboard(JST, document);
		document.removeEventListener("copy", pageHandler);

		expect(clipboard.get("text/plain")).toBe(JST);
	});

	it("falls back to the copy event when the Clipboard API rejects", async () => {
		stubClipboard(() => Promise.reject(new Error("Document is not focused")));
		const clipboard = stubExecCommand();

		await copyToClipboard(JST, document);

		expect(clipboard.get("text/plain")).toBe(JST);
	});

	it("rejects when the browser refuses to copy", async () => {
		stubClipboard(undefined);
		document.execCommand = vi.fn(() => false);

		await expect(copyToClipboard(JST, document)).rejects.toThrow();
	});
});
