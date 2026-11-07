import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Popup tests expect the local time zone to be Asia/Tokyo.
		env: { TZ: "Asia/Tokyo" },
	},
});
