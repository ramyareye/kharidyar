import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "./locale-context";
import { safeProductLink } from "./product-presentation";
import "./ProductImageDialog.css";

export function ProductImageDialog({
	src,
	title,
	onClose,
}: {
	src: string;
	title: string;
	onClose: () => void;
}) {
	const { t } = useLocale();
	const dialogRef = useRef<HTMLDialogElement>(null);
	const titleId = useId();
	const [failed, setFailed] = useState(false);
	const originalUrl = safeProductLink(src);

	useEffect(() => {
		const dialog = dialogRef.current!;
		const returnFocus = document.activeElement;
		const overflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		dialog.showModal();
		return () => {
			dialog.close();
			document.body.style.overflow = overflow;
			if (returnFocus instanceof HTMLElement && returnFocus.isConnected) {
				returnFocus.focus({ preventScroll: true });
			}
		};
	}, []);

	return createPortal(
		<dialog
			ref={dialogRef}
			className="product-image-dialog"
			aria-labelledby={titleId}
			onKeyDown={(event) => {
				if (event.key !== "Tab") return;
				const controls = Array.from(
					event.currentTarget.querySelectorAll<HTMLElement>("button, a[href]"),
				);
				const first = controls[0];
				const last = controls.at(-1);
				if (
					event.shiftKey &&
					(document.activeElement === first ||
						!event.currentTarget.contains(document.activeElement))
				) {
					event.preventDefault();
					last?.focus();
				} else if (
					!event.shiftKey &&
					(document.activeElement === last ||
						!event.currentTarget.contains(document.activeElement))
				) {
					event.preventDefault();
					first?.focus();
				}
			}}
			onCancel={(event) => {
				event.preventDefault();
				onClose();
			}}
			onClick={(event) => {
				if (event.target !== event.currentTarget) return;
				const rect = event.currentTarget.getBoundingClientRect();
				if (
					event.clientX < rect.left ||
					event.clientX > rect.right ||
					event.clientY < rect.top ||
					event.clientY > rect.bottom
				)
					onClose();
			}}
		>
			<header>
				<h2 id={titleId} dir="auto">
					{title}
				</h2>
				<button
					type="button"
					className="product-image-dialog__close"
					aria-label={t("common.close")}
					onClick={onClose}
				>
					×
				</button>
			</header>
			<div className="product-image-dialog__canvas">
				{failed ? (
					<p role="status">{t("commerce.imageUnavailable")}</p>
				) : (
					<img
						src={src}
						alt={title}
						decoding="async"
						referrerPolicy="no-referrer"
						onError={() => setFailed(true)}
					/>
				)}
			</div>
			{originalUrl ? (
				<footer>
					<a href={originalUrl} target="_blank" rel="noreferrer">
						{t("commerce.openOriginalImage")} ↗
					</a>
				</footer>
			) : null}
		</dialog>,
		document.body,
	);
}
