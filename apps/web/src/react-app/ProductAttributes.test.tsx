import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductAttributes } from "./ProductAttributes";

describe("Product attributes", () => {
	it("renders sourced facts as text and only makes public HTTPS values clickable", () => {
		const html = renderToStaticMarkup(<ProductAttributes attributes={[
			{ label: "Source", value: "https://shop.example/chair?variant=beige" },
			{ label: "Unsafe", value: "javascript:alert(1)" },
			{ label: "Private", value: "https://user:password@shop.example/chair" },
			{ label: "Material", value: "<script>alert(1)</script>" },
		]} />);
		expect(html).toContain('href="https://shop.example/chair?variant=beige"');
		expect(html.match(/href=/gu)).toHaveLength(1);
		expect(html).toContain('target="_blank" rel="noreferrer"');
		expect(html).toContain("&lt;script&gt;");
	});
	it("omits the details list when no attributes are saved", () => {
		expect(renderToStaticMarkup(<ProductAttributes attributes={[]} />)).toBe("");
	});
});
