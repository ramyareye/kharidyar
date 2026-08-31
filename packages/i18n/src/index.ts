import { enMessages, type MessageKey } from "./messages/en";
import { faMessages } from "./messages/fa";

export const supportedLocales = ["en", "fa"] as const;
export type Locale = (typeof supportedLocales)[number];
export type Direction = "ltr" | "rtl";
export type { MessageKey };

export const fallbackLocale: Locale = "en";

const catalogs: Record<Locale, Record<MessageKey, string>> = {
	en: enMessages,
	fa: faMessages,
};

const localeTags: Record<Locale, string> = {
	en: "en-GB",
	fa: "fa-IR",
};

export function isLocale(value: string | null | undefined): value is Locale {
	return supportedLocales.some((locale) => locale === value);
}

export function detectLocale(languages: readonly string[]): Locale {
	for (const language of languages) {
		const normalized = language.trim().toLowerCase();
		if (normalized === "fa" || normalized.startsWith("fa-")) {
			return "fa";
		}
		if (normalized === "en" || normalized.startsWith("en-")) {
			return "en";
		}
	}

	return fallbackLocale;
}

export function directionForLocale(locale: Locale): Direction {
	return locale === "fa" ? "rtl" : "ltr";
}

export function message(
	locale: Locale,
	key: MessageKey,
	values: Readonly<Record<string, number | string>> = {},
): string {
	const template = catalogs[locale][key] ?? catalogs[fallbackLocale][key];
	if (!template) {
		return `[missing:${key}]`;
	}

	return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/gu, (match, name) => {
		const value = values[name];
		return value === undefined ? match : String(value);
	});
}

export function formatNumber(locale: Locale, value: number): string {
	return new Intl.NumberFormat(localeTags[locale]).format(value);
}

export function formatDate(
	locale: Locale,
	value: Date | number | string,
): string {
	return new Intl.DateTimeFormat(localeTags[locale], {
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(new Date(value));
}

export function formatDateTime(
	locale: Locale,
	value: Date | number | string,
): string {
	return new Intl.DateTimeFormat(localeTags[locale], {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

export function formatMoney(
	locale: Locale,
	minor: number,
	currency: string,
): string {
	const formatter = new Intl.NumberFormat(localeTags[locale], {
		currency,
		currencyDisplay: "narrowSymbol",
		style: "currency",
	});
	const fractionDigits =
		formatter.resolvedOptions().maximumFractionDigits ?? 2;
	return formatter.format(minor / 10 ** fractionDigits);
}
