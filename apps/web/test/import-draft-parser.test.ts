import { describe, expect, it } from "vitest";

import {
	ImportParseError,
	parseImportInput,
	reviewImportProposal,
} from "../src/worker/import-draft-parser";

const ikeaResearch = `
### اتاق‌خواب

| محصول | قیمت | کاربرد |
| --- | --- | --- |
| [BJÖRKSNÄS تخت 160×200 با LEIRSUND](https://www.ikea.com/nl/en/p/bjorksnas-bed-frame-birch-leirsund-s79501693/) | €529 | قطعه اصلی؛ ابعاد خارجی 180×214 سانتی‌متر |
| [BJÖRKSNÄS میز کنار تخت](https://www.ikea.com/nl/en/p/bjorksnas-bedside-table-birch-70407360/) | €109 | فقط یک عدد، سمت راست تخت |
| [GULLSUDARE / HAVSDJUP چراغ کاغذی 45cm](https://www.ikea.com/nl/en/p/gullsudare-havsdjup-pendant-lamp-white-s29613301/) | €8.99 | چراغ سقفی شبیه رندر |
| [FADO چراغ رومیزی سفید](https://www.ikea.com/nl/en/p/fado-table-lamp-white-80096372/) | €14.99 | نور گرم روی میز کنار تخت |
| [LOHALS فرش 80×150](https://www.ikea.com/nl/en/cat/rugs-10653/f/natural-fibres-rugs-f-materials--47477/) | €29.99 | کنار تخت؛ حس تاتامی |
| [LÅNGDANS پرده رولی](https://www.ikea.com/nl/en/p/langdans-roller-blind-grey-30467214/) | از €22.99 | عرض را بعد از اندازه‌گیری پنجره انتخاب کن |

جمع اتاق‌خواب بدون تشک و روتختی: حدود €715.

### نشیمن و غذاخوری

| محصول | قیمت | کاربرد |
| --- | --- | --- |
| [SÖDERHAMN مبل سه‌نفره](https://www.ikea.com/nl/en/p/soderhamn-3-seat-sofa-gunnared-beige-s79305423/) | €549 | کم‌ارتفاع و سبک |
| [TONSTAD میز تلویزیون](https://www.ikea.com/nl/en/p/tonstad-tv-bench-oak-veneer-00489302/) | €269 | روی دیوار سمت راست |
| [JAKOBSFORS میز جلو مبلی](https://www.ikea.com/nl/en/p/jakobsfors-coffee-table-dark-brown-stained-oak-veneer-50515167/) | €99.99 | گرد و جمع‌وجور |
| [LOHALS فرش 200×300](https://www.ikea.com/nl/en/p/lohals-rug-flatwoven-natural-00277395/) | €139 | زیر مبل و میز |
| [LISABO میز گرد](https://www.ikea.com/nl/en/p/lisabo-table-ash-veneer-40416498/) | €169 | نزدیک آشپزخانه |
| [LISABO صندلی چوبی](https://www.ikea.com/nl/en/p/lisabo-chair-ash-00457235/) ×۲ | €119.98 | اول دو عدد بگیر؛ بعداً دو تای دیگر اضافه کن |
| [GULLSUDARE چراغ کاغذی](https://www.ikea.com/nl/en/p/gullsudare-havsdjup-pendant-lamp-white-s29613301/) | €8.99 | بالای میز غذاخوری |
| [VARPTROSS چراغ زمینی](https://www.ikea.com/nl/en/p/varptross-floor-lamp-bamboo-40595131/) | €79.99 | کنار TV unit |

جمع نشیمن با دو صندلی: حدود €1,435. جمع کل دو فضا: حدود €2,150؛ با چهار صندلی حدود €2,270.

تشک، تلویزیون، لامپ‌ها، روتختی، گیاه و ارسال حساب نشده‌اند.
`;

describe("deterministic Import Draft parser", () => {
	it("preserves the representative multi-room list and flags inference", () => {
		const result = parseImportInput("markdown", ikeaResearch);

		expect(result.proposal.lines).toHaveLength(14);
		expect(
			new Set(result.proposal.lines.map(({ groupLabel }) => groupLabel)),
		).toEqual(new Set(["اتاق‌خواب", "نشیمن و غذاخوری"]));

		const category = result.proposal.lines.find(({ product }) =>
			product.title.startsWith("LOHALS فرش 80"),
		);
		expect(category?.source?.kind).toBe("category");
		expect(category?.offer).toBeNull();
		expect(
			result.warnings.some(
				({ code, lineKey }) =>
					code === "non_product_source" && lineKey === category?.key,
			),
		).toBe(true);

		const chairs = result.proposal.lines.find(({ product }) =>
			product.title.startsWith("LISABO صندلی"),
		)!;
		expect(chairs.item.quantityNeeded).toBe(2);
		expect(chairs.candidate.plannedPurchaseQuantity).toBe(2);
		expect(chairs.suppliedLineTotal?.minor).toBe(11_998);
		expect(chairs.offer?.facts.unitPriceMinor).toBe(5_999);
		expect(chairs.futureQuantity?.quantity).toBe(2);
		expect(
			result.warnings.find(
				({ code, lineKey }) =>
					code === "future_quantity_requires_choice" && lineKey === chairs.key,
			)?.severity,
		).toBe("error");

		const blind = result.proposal.lines.find(({ product }) =>
			product.title.startsWith("LÅNGDANS"),
		);
		expect(blind?.offer?.facts.priceKind).toBe("starting_at");
		expect(blind?.offer?.facts.shippingBasis).toBe("unknown");
		expect(result.proposal.summaryTotals.length).toBeGreaterThanOrEqual(3);
		expect(
			result.proposal.summaryTotals.some(
				({ groupLabel }) => groupLabel === null,
			),
		).toBe(true);
		expect(result.proposal.exclusions).toContain(
			"تشک، تلویزیون، لامپ‌ها، روتختی، گیاه و ارسال حساب نشده‌اند.",
		);
	});

	it("requires an explicit review when a future quantity is present", () => {
		const parsed = parseImportInput("markdown", ikeaResearch);
		const reviewed = reviewImportProposal({
			...parsed.proposal,
			lines: parsed.proposal.lines.map((line) =>
				line.futureQuantity
					? {
							...line,
							candidate: { ...line.candidate, quantityOrigin: "reviewed" },
							item: { ...line.item, quantityOrigin: "reviewed" },
						}
					: line,
			),
		});

		expect(
			reviewed.warnings.find(
				({ code }) => code === "future_quantity_requires_choice",
			)?.severity,
		).toBe("info");
	});

	it("rejects malformed versioned JSON without evaluating content", () => {
		expect(() => parseImportInput("json", '{"schemaVersion":')).toThrow(
			ImportParseError,
		);
		expect(() =>
			parseImportInput(
				"json",
				JSON.stringify({ schemaVersion: "2", lines: [] }),
			),
		).toThrow(/schema version 1/u);
	});

	it("preserves an unsafe-link row as data but never creates an Offer", () => {
		const result = parseImportInput(
			"markdown",
			`| Product | Price | Notes |\n| --- | --- | --- |\n| [Unsafe](javascript:alert(1)) | €10 | pasted row |`,
		);
		expect(result.proposal.lines).toHaveLength(1);
		expect(result.proposal.lines[0]?.source).toBeNull();
		expect(result.proposal.lines[0]?.offer).toBeNull();
	});
});
