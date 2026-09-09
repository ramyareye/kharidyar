import type { ProductAttribute } from "@kharidyar/contracts";
import "./ProductAttributes.css";

function sourceLink(value: string): string | null {
	try {
		const url = new URL(value);
		return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
	} catch {
		return null;
	}
}

export function ProductAttributes({ attributes }: { attributes: ProductAttribute[] }) {
	if (attributes.length === 0) return null;
	return (
		<dl className="product-attributes">
			{attributes.map(({ label, value }, index) => {
				const href = sourceLink(value);
				return (
					<div key={`${label}-${index}`}>
						<dt dir="auto">{label}</dt>
						<dd dir="auto">{href ? <a href={href} target="_blank" rel="noreferrer">{value} ↗</a> : value}</dd>
					</div>
				);
			})}
		</dl>
	);
}
