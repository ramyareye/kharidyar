import { useState } from "react";
import { useLocale } from "./locale-context";
import { ProductImageDialog } from "./ProductImageDialog";

export function ProductThumbnail({
	src,
	title,
}: {
	src?: string | null;
	title: string;
}) {
	const { t } = useLocale();
	const [failedSource, setFailedSource] = useState<string | null>(null);
	const [openedSource, setOpenedSource] = useState<string | null>(null);
	const available = Boolean(src && src !== failedSource);
	if (available)
		return (
			<>
				<button
					type="button"
					className="product-thumbnail product-thumbnail--interactive"
					aria-label={t("commerce.enlargeImage", { title })}
					aria-haspopup="dialog"
					onClick={() => setOpenedSource(src!)}
				>
					<img
						src={src!}
						alt={title}
						loading="lazy"
						decoding="async"
						referrerPolicy="no-referrer"
						onError={() => setFailedSource(src!)}
					/>
					<span className="product-thumbnail__expand" aria-hidden="true">
						⤢
					</span>
				</button>
				{openedSource === src ? (
					<ProductImageDialog
						key={src}
						src={src!}
						title={title}
						onClose={() => setOpenedSource(null)}
					/>
				) : null}
			</>
		);
	return (
		<div className="product-thumbnail">
			<span
				className="product-thumbnail__empty"
				role="img"
				aria-label={t("commerce.noImage")}
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.25"
					aria-hidden="true"
				>
					<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
					<path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.25l8 4.5" />
				</svg>
			</span>
		</div>
	);
}
