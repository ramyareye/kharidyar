export type ThemePreference = "system" | "light" | "dark";

export const themeStorageKey = "wantkit.theme";
const systemQuery = "(prefers-color-scheme: dark)";
let preference: ThemePreference = "system";
const listeners = new Set<() => void>();

export function parseThemePreference(value: string | null): ThemePreference {
	return value === "light" || value === "dark" ? value : "system";
}

function applyTheme() {
	const dark = preference === "dark" ||
		(preference === "system" && window.matchMedia(systemQuery).matches);
	document.documentElement.dataset.theme = dark ? "dark" : "light";
	document.querySelector('meta[name="theme-color"]')?.setAttribute(
		"content", dark ? "#171717" : "#f7f7f7",
	);
}

function updatePreference(next: ThemePreference) {
	preference = next;
	applyTheme();
	for (const listener of listeners) listener();
}

/** Called once at app startup; the head script handles the first paint. */
export function initializeTheme() {
	let saved: string | null = null;
	try {
		saved = window.localStorage.getItem(themeStorageKey);
	} catch {
		// System mode still works when the browser blocks storage.
	}
	updatePreference(parseThemePreference(saved));
	const media = window.matchMedia(systemQuery);
	const onSystemChange = () => applyTheme();
	const onStorage = (event: StorageEvent) => {
		if (event.key !== themeStorageKey && event.key !== null) return;
		// Ignore similarly named sessionStorage events.
		try {
			if (event.storageArea !== window.localStorage) return;
		} catch {
			return;
		}
		updatePreference(parseThemePreference(event.newValue));
	};
	media.addEventListener("change", onSystemChange);
	window.addEventListener("storage", onStorage);
	return () => {
		media.removeEventListener("change", onSystemChange);
		window.removeEventListener("storage", onStorage);
	};
}

export function setThemePreference(next: ThemePreference) {
	try {
		window.localStorage.setItem(themeStorageKey, next);
	} catch {
		// The choice still applies for this visit when storage is unavailable.
	}
	updatePreference(next);
}

export function getThemePreference() {
	return preference;
}

export function subscribeTheme(listener: () => void) {
	listeners.add(listener);
	return () => { listeners.delete(listener); };
}
