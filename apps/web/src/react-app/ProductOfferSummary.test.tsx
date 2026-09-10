import type { CandidateComparison } from "@kharidyar/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "./LocaleProvider";
import { ItemProductDetails, ProductOfferSummary } from "./ProductOfferSummary";
import { detailCandidate } from "./product-presentation";

const timestamps = {
	createdAt: "2026-09-01T12:00:00.000Z",
	updatedAt: "2026-09-01T12:00:00.000Z",
	archivedAt: null,
};
const offer: CandidateComparison["offers"][number] = {
	...timestamps,
	id: "offer",
	workspaceId: "workspace",
	productId: "product",
	sourceUrl: "https://shop.example/chair",
	locale: "en-NL",
	merchant: {
		...timestamps,
		id: "merchant",
		workspaceId: "workspace",
		name: "Sample retailer",
		salesChannel: "online",
		websiteUrl: null,
		notes: null,
	},
	facts: {
		priceKind: "starting_at",
		unitPriceMinor: 12900,
		currency: "EUR",
		shippingMinor: null,
		shippingBasis: "unknown",
		availabilityState: "unknown",
		availabilityChannel: null,
		availabilityLocation: null,
		availabilityNote: null,
		availabilityVariant: null,
	},
	freshness: "stale",
	lastCheckedAt: "2026-09-01T12:00:00.000Z",
	priceChecks: [],
	plannedCost: {
		status: "incomplete",
		currency: "EUR",
		merchandiseMinor: 12900,
		shippingMinor: null,
		totalMinor: null,
		missing: ["shipping"],
	},
};
function candidate(
	id: string,
	imageUrl: string | null = null,
): CandidateComparison {
	return {
		...timestamps,
		id,
		itemId: "item",
		product: {
			...timestamps,
			id,
			workspaceId: "workspace",
			title: id,
			imageUrl,
			brand: "Brand",
			model: null,
			category: null,
			attributes: [],
		},
		isPlanned: false,
		plannedOfferId: null,
		plannedPurchaseQuantity: 1,
		notes: null,
		rank: null,
		purchasedQuantity: 0,
		purchases: [],
		offers: [offer],
	};
}
function renderOffer(value = offer) {
	return renderToStaticMarkup(
		<LocaleProvider initialLocale="en">
			<ProductOfferSummary offer={value} />
		</LocaleProvider>,
	);
}

describe("Product offer presentation", () => {
	it("keeps starting prices, unknown shipping and the saved observation date explicit", () => {
		const html = renderOffer();
		expect(html).toContain("Starting at");
		expect(html).toContain("129");
		expect(html).toContain("per unit");
		expect(html).toContain("Shipping unknown");
		expect(html).toMatch(/datetime="2026-09-01T12:00:00.000Z"/iu);
		expect(html).toContain("Stale");
		expect(html).toContain('href="https://shop.example/chair"');
	});
	it("does not turn an unknown price into zero, and preserves an explicitly zero price", () => {
		expect(
			renderOffer({
				...offer,
				facts: { ...offer.facts, priceKind: "unknown", unitPriceMinor: null },
			}),
		).toContain("Price not available");
		const html = renderOffer({
			...offer,
			facts: { ...offer.facts, priceKind: "exact", unitPriceMinor: 0 },
		});
		expect(html).not.toContain("Price not available");
		expect(html).not.toContain("Starting at");
		expect(html).toContain("0.00");
	});
	it.each([
		"javascript:alert(1)",
		"https://user:secret@shop.example/chair",
		"http://shop.example/chair",
	])("never links an unsafe offer URL: %s", (sourceUrl) => {
		expect(renderOffer({ ...offer, sourceUrl })).not.toContain("href=");
	});
	it("prioritizes the saved offer and hides archived offers and merchants in item details", () => {
		const value = candidate("chair");
		value.plannedOfferId = "selected";
		value.offers = [
			offer,
			{
				...offer,
				id: "selected",
				merchant: { ...offer.merchant, name: "Selected retailer" },
			},
			{
				...offer,
				id: "archived",
				archivedAt: timestamps.createdAt,
				merchant: { ...offer.merchant, name: "Archived offer" },
			},
			{
				...offer,
				id: "archived-merchant",
				merchant: {
					...offer.merchant,
					name: "Archived retailer",
					archivedAt: timestamps.createdAt,
				},
			},
		];
		const html = renderToStaticMarkup(
			<LocaleProvider initialLocale="en">
				<ItemProductDetails candidate={value} />
			</LocaleProvider>,
		);
		expect(html.indexOf("Selected retailer")).toBeLessThan(
			html.indexOf("More retailers"),
		);
		expect(html.indexOf("Sample retailer")).toBeGreaterThan(
			html.indexOf("More retailers"),
		);
		expect(html).not.toContain("Archived offer");
		expect(html).not.toContain("Archived retailer");
	});
});

describe("Item product selection", () => {
	it("keeps the planned product even when another candidate has a photo", () => {
		const planned = { ...candidate("planned"), isPlanned: true };
		expect(
			detailCandidate([
				candidate("other", "https://shop.example/other.jpg"),
				planned,
			]),
		).toBe(planned);
	});
	it("uses the first eligible photo preview, excluding archived candidates/products", () => {
		const archived = {
			...candidate("archived", "https://shop.example/archived.jpg"),
			archivedAt: timestamps.createdAt,
		};
		const archivedProduct = candidate(
			"archived-product",
			"https://shop.example/archived-product.jpg",
		);
		archivedProduct.product.archivedAt = timestamps.createdAt;
		const preview = candidate("preview", "https://shop.example/preview.jpg");
		expect(
			detailCandidate([
				archived,
				archivedProduct,
				candidate("no-photo"),
				preview,
			]),
		).toBe(preview);
	});
	it("still exposes details when every eligible candidate lacks a photo", () => {
		const first = candidate("first");
		expect(detailCandidate([first, candidate("second")])).toBe(first);
		expect(detailCandidate([])).toBeUndefined();
	});
});
