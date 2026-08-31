import {
	detectLocale,
	directionForLocale,
	isLocale,
	message,
	type Locale,
} from "@kharidyar/i18n";

export const localeStorageKey = "kharidyar.locale";

export function readStoredLocale(): Locale | null {
	try {
		const value = window.localStorage.getItem(localeStorageKey);
		return isLocale(value) ? value : null;
	} catch {
		return null;
	}
}

export function applyDocumentLocale(locale: Locale): void {
	const root = document.documentElement;
	root.lang = locale;
	root.dir = directionForLocale(locale);
	document.title = message(locale, "app.name");
}

export function resolveInitialLocale(): Locale {
	const locale = readStoredLocale() ?? detectLocale(window.navigator.languages);
	applyDocumentLocale(locale);
	return locale;
}
