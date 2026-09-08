import { useEffect, useRef, useState, type ReactNode } from "react";

import { useLocale } from "./locale-context";

/** A native disclosure keeps secondary actions reachable by keyboard and touch. */
export function ActionMenu({
	children,
	label,
	name,
}: {
	children: ReactNode;
	label: string;
	name?: string;
}) {
	const ref = useRef<HTMLDetailsElement>(null);
	useEffect(() => {
		function closeOutside(event: PointerEvent) {
			if (
				event.target instanceof Node &&
				!ref.current?.contains(event.target) &&
				ref.current
			) {
				ref.current.open = false;
			}
		}
		document.addEventListener("pointerdown", closeOutside);
		return () => document.removeEventListener("pointerdown", closeOutside);
	}, []);
	return (
		<details
			className="action-menu"
			ref={ref}
			onKeyDown={(event) => {
				if (event.key === "Escape" && ref.current?.open) {
					event.stopPropagation();
					ref.current.open = false;
					ref.current.querySelector("summary")?.focus({ preventScroll: true });
				}
			}}
		>
			<summary aria-label={name ? `${label}: ${name}` : label}>
				{label}
				<span aria-hidden="true">⌄</span>
			</summary>
			<div
				className="action-menu__content"
				onClick={(event) => {
					if (
						event.target instanceof Element &&
						event.target.closest("button:not(:disabled), a")
					) {
						if (ref.current) {
							ref.current.open = false;
							ref.current
								.querySelector("summary")
								?.focus({ preventScroll: true });
						}
					}
				}}
			>
				{children}
			</div>
		</details>
	);
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
	const { t } = useLocale();

	return (
		<div className={compact ? "brand brand--compact" : "brand"}>
			<img
				className="brand__mark"
				src="/wantkit-mark.svg"
				width="40"
				height="40"
				alt=""
				aria-hidden="true"
			/>
			<span className="brand__name" lang="en" dir="ltr">{t("app.name")}</span>
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
