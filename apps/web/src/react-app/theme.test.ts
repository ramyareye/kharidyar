/// <reference types="node" />
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getThemePreference, initializeTheme, setThemePreference,
	subscribeTheme, themeStorageKey,
} from "./theme";

const bootstrap = readFileSync(new URL("../../public/theme-init.js", import.meta.url), "utf8");

describe("appearance preference", () => {
	let saved: string | null;
	let blocked: boolean;
	let documentMock: { documentElement: { dataset: { theme?: string } }; querySelector: ReturnType<typeof vi.fn> };
	let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> };
	let media: EventTarget & { matches: boolean };
	let windowMock: EventTarget & { localStorage: typeof storage; matchMedia: ReturnType<typeof vi.fn> };
	let cleanup: (() => void) | undefined;
	const meta = { setAttribute: vi.fn() };

	beforeEach(() => {
		saved = null;
		blocked = false;
		storage = {
			getItem: vi.fn(() => { if (blocked) throw new Error("blocked"); return saved; }),
			setItem: vi.fn((_key: string, value: string) => { if (blocked) throw new Error("blocked"); saved = value; }),
		};
		media = Object.assign(new EventTarget(), { matches: false });
		windowMock = Object.assign(new EventTarget(), { localStorage: storage, matchMedia: vi.fn(() => media) });
		documentMock = { documentElement: { dataset: {} }, querySelector: vi.fn(() => meta) };
		vi.stubGlobal("window", windowMock);
		vi.stubGlobal("document", documentMock);
	});
	afterEach(() => { cleanup?.(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

	it.each([null, "system", "light", "dark", "invalid"])("matches the pre-paint script for stored %s on either system theme", (value) => {
		for (const dark of [false, true]) {
			saved = value;
			media.matches = dark;
			runInNewContext(bootstrap, { document: documentMock, localStorage: storage, matchMedia: windowMock.matchMedia });
			const initial = documentMock.documentElement.dataset.theme;
			cleanup = initializeTheme();
			expect(documentMock.documentElement.dataset.theme).toBe(initial);
			expect(initial).toBe(value === "dark" || (value !== "light" && dark) ? "dark" : "light");
			cleanup();
		}
	});

	it("follows system changes only in System mode and saves an explicit choice", () => {
		cleanup = initializeTheme();
		media.matches = true;
		media.dispatchEvent(new Event("change"));
		expect(documentMock.documentElement.dataset.theme).toBe("dark");
		setThemePreference("light");
		expect(storage.setItem).toHaveBeenCalledWith(themeStorageKey, "light");
		media.dispatchEvent(new Event("change"));
		expect(documentMock.documentElement.dataset.theme).toBe("light");
		setThemePreference("system");
		expect(documentMock.documentElement.dataset.theme).toBe("dark");
		expect(getThemePreference()).toBe("system");
		expect(meta.setAttribute).toHaveBeenLastCalledWith("content", "#171717");
		cleanup();
		media.matches = false;
		media.dispatchEvent(new Event("change"));
		expect(documentMock.documentElement.dataset.theme).toBe("dark");
	});

	it("syncs other tabs and clearing local storage without overwriting that change", () => {
		cleanup = initializeTheme();
		const listener = vi.fn();
		const unsubscribe = subscribeTheme(listener);
		const send = (key: string | null, newValue: string | null, storageArea: object = storage) =>
			windowMock.dispatchEvent(Object.assign(new Event("storage"), { key, newValue, storageArea }));
		send(themeStorageKey, "dark");
		expect(getThemePreference()).toBe("dark");
		expect(documentMock.documentElement.dataset.theme).toBe("dark");
		expect(listener).toHaveBeenCalledOnce();
		send("unrelated", "light");
		send(themeStorageKey, "light", {});
		expect(getThemePreference()).toBe("dark");
		send(null, null);
		expect(getThemePreference()).toBe("system");
		expect(documentMock.documentElement.dataset.theme).toBe("light");
		expect(storage.setItem).not.toHaveBeenCalled();
		unsubscribe();
		listener.mockClear();
		send(themeStorageKey, "light");
		expect(listener).not.toHaveBeenCalled();
	});

	it("still applies System and manual choices when browser storage is blocked", () => {
		blocked = true;
		media.matches = true;
		runInNewContext(bootstrap, { document: documentMock, localStorage: storage, matchMedia: windowMock.matchMedia });
		expect(documentMock.documentElement.dataset.theme).toBe("dark");
		cleanup = initializeTheme();
		expect(getThemePreference()).toBe("system");
		setThemePreference("light");
		expect(documentMock.documentElement.dataset.theme).toBe("light");
	});
});
