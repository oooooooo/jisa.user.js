// @vitest-environment node
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
	new URL("../jisa.user.js", import.meta.url),
	"utf8",
);

describe("userscript", () => {
	it("still installs on pages that define a global module", () => {
		const { window } = new JSDOM("<p><b>10:00 UTC</b></p>", {
			runScripts: "outside-only",
		});
		window.module = { exports: {} };

		window.eval(SOURCE);
		const range = window.document.createRange();
		range.selectNodeContents(window.document.querySelector("b"));
		window.getSelection().addRange(range);
		window.document.dispatchEvent(new window.MouseEvent("mouseup"));

		expect(window.module.exports).toEqual({});
		expect(window.document.querySelector("[data-jisa]")).not.toBeNull();
	});

	it("keeps recent time zones in the userscript manager storage", () => {
		const { window } = new JSDOM("<p><b>10:00 UTC</b></p>", {
			runScripts: "outside-only",
		});
		const storage = { recentZones: ["America/New_York", "Mars/Base"] };
		window.GM_getValue = (key, fallback) => storage[key] ?? fallback;
		window.GM_setValue = (key, value) => {
			storage[key] = value;
		};

		window.eval(SOURCE);
		const range = window.document.createRange();
		range.selectNodeContents(window.document.querySelector("b"));
		window.getSelection().addRange(range);
		window.document.dispatchEvent(new window.MouseEvent("mouseup"));
		const shadow = window.document.querySelector("[data-jisa]").shadowRoot;

		// A zone the browser does not know is dropped instead of breaking the popup.
		expect(shadow.querySelectorAll(".extra-line")).toHaveLength(1);
		shadow.querySelector('button[aria-haspopup="listbox"]').click();
		shadow.querySelector('[data-zone="Europe/London"]').click();
		expect(storage.recentZones).toEqual(["Europe/London", "America/New_York"]);
	});
});
