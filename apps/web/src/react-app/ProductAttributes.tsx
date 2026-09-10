import type { ProductAttribute } from "@kharidyar/contracts";
import { safeProductLink } from "./product-presentation";
import "./ProductAttributes.css";

export function ProductAttributes({ attributes }: { attributes: ProductAttribute[] }) {
	if (attributes.length === 0) return null;
	return (
		<dl className="product-attributes">
			{attributes.map(({ label, value }, index) => {
				const href = safeProductLink(value);
				return (
					<div key={`${label}-${index}`}>
						<dt dir="auto">{label}</dt>
						<dd dir="auto">{href ? <a href={href} title={href} target="_blank" rel="noreferrer">{new URL(href).hostname.replace(/^www\./u, "")} ↗</a> : value}</dd>
					</div>
				);
			})}
		</dl>
	);
}
