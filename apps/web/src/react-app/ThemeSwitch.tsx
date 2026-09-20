import { useSyncExternalStore } from "react";
import { useLocale } from "./locale-context";
import {
	getThemePreference,
	parseThemePreference,
	setThemePreference,
	subscribeTheme,
} from "./theme";

export function ThemeSwitch() {
	const { t } = useLocale();
	const preference = useSyncExternalStore(subscribeTheme, getThemePreference, () => "system");
	return (
		<label className="theme-switch">
			<span>{t("theme.label")}</span>
			<select
				value={preference}
				onChange={(event) => setThemePreference(parseThemePreference(event.target.value))}
			>
				<option value="system">{t("theme.system")}</option>
				<option value="light">{t("theme.light")}</option>
				<option value="dark">{t("theme.dark")}</option>
			</select>
		</label>
	);
}
