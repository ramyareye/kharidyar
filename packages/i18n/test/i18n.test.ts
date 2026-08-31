import { describe, expect, it } from "vitest";

import {
	detectLocale,
	directionForLocale,
	fallbackLocale,
	formatDateTime,
	formatMoney,
	formatNumber,
	message,
	type MessageKey,
} from "../src";

describe("locale policy", () => {
	it("chooses Persian or English from browser preferences", () => {
		expect(detectLocale(["fa-IR", "en-US"])).toBe("fa");
		expect(detectLocale(["de-DE", "en-GB"])).toBe("en");
		expect(detectLocale(["nl-NL"])).toBe(fallbackLocale);
	});

	it("defines explicit document directions", () => {
		expect(directionForLocale("fa")).toBe("rtl");
		expect(directionForLocale("en")).toBe("ltr");
	});
});

describe("localized output", () => {
	it("interpolates equivalent catalog entries", () => {
		expect(message("en", "dashboard.greeting", { name: "Reza" })).toBe(
			"Welcome, Reza.",
		);
		expect(message("fa", "dashboard.greeting", { name: "رضا" })).toBe(
			"خوش آمدی، رضا.",
		);
	});

	it("renders an obvious marker for an unexpected missing key", () => {
		expect(message("fa", "missing.test" as MessageKey)).toBe(
			"[missing:missing.test]",
		);
	});

	it("formats numbers and EUR without changing canonical minor units", () => {
		expect(formatNumber("en", 12)).toBe("12");
		expect(formatNumber("fa", 12)).toMatch(/[۱۲]/u);
		expect(formatMoney("en", 21_500, "EUR")).toContain("215");
		expect(formatMoney("fa", 21_500, "EUR")).toMatch(/[۲]/u);
		expect(formatDateTime("en", "2026-08-31T12:30:00.000Z")).toMatch(
			/2026/u,
		);
		expect(formatDateTime("fa", "2026-08-31T12:30:00.000Z")).toMatch(
			/[۰-۹]/u,
		);
	});
});
