import {
	directionForLocale,
	message,
	type Locale,
} from "@kharidyar/i18n";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { LocaleContext, type LocaleContextValue } from "./locale-context";
import { applyDocumentLocale, localeStorageKey } from "./locale-runtime";

export function LocaleProvider({
	children,
	initialLocale,
}: {
	children: ReactNode;
	initialLocale: Locale;
}) {
	const [locale, setLocale] = useState(initialLocale);

	useEffect(() => {
		applyDocumentLocale(locale);
		try {
			window.localStorage.setItem(localeStorageKey, locale);
		} catch {
			// The active locale still works when storage is unavailable.
		}
	}, [locale]);

	const value = useMemo<LocaleContextValue>(
		() => ({
			direction: directionForLocale(locale),
			locale,
			setLocale,
			t: (key, values) => message(locale, key, values),
		}),
		[locale],
	);

	return (
		<LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
	);
}
