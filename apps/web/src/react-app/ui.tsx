import { useState } from "react";

import { useLocale } from "./locale-context";

export function BrandMark({ compact = false }: { compact?: boolean }) {
	const { t } = useLocale();

	return (
		<div className={compact ? "brand brand--compact" : "brand"}>
			<svg
				className="brand__mark"
				viewBox="0 0 40 40"
				aria-hidden="true"
				focusable="false"
			>
				<path d="M6 6h12v12H6zM22 6h12v12H22zM6 22h12v12H6z" />
				<path className="brand__mark-accent" d="M22 22h12v12H22z" />
			</svg>
			<span className="brand__name">{t("app.name")}</span>
		</div>
	);
}

export function LocaleSwitch() {
	const { locale, setLocale, t } = useLocale();
	const nextLocale = locale === "en" ? "fa" : "en";
	const label =
		nextLocale === "fa"
			? t("locale.switchToPersian")
			: t("locale.switchToEnglish");

	return (
		<button
			type="button"
			className="locale-switch"
			onClick={() => setLocale(nextLocale)}
			aria-label={label}
			title={label}
		>
			<span lang={nextLocale} dir={nextLocale === "fa" ? "rtl" : "ltr"}>
				{nextLocale === "fa" ? t("locale.persian") : t("locale.english")}
			</span>
		</button>
	);
}

export function UserAvatar({
	image,
	name,
}: {
	image?: null | string;
	name: string;
}) {
	const [imageFailed, setImageFailed] = useState(false);
	const initial = name.trim().charAt(0).toLocaleUpperCase() || "K";

	return (
		<div className="user-avatar" aria-hidden="true">
			{image && !imageFailed ? (
				<img
					src={image}
					alt=""
					referrerPolicy="no-referrer"
					onError={() => setImageFailed(true)}
				/>
			) : (
				<span>{initial}</span>
			)}
		</div>
	);
}
