import type { Locale, MessageKey } from "@kharidyar/i18n";
import { createContext, useContext } from "react";

type MessageValues = Readonly<Record<string, number | string>>;

export interface LocaleContextValue {
	direction: "ltr" | "rtl";
	locale: Locale;
	setLocale: (locale: Locale) => void;
	t: (key: MessageKey, values?: MessageValues) => string;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale(): LocaleContextValue {
	const value = useContext(LocaleContext);
	if (!value) {
		throw new Error("useLocale must be used inside LocaleProvider.");
	}
	return value;
}
