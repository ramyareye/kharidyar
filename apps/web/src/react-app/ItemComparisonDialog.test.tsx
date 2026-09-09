import type { CandidateComparison, ItemComparisonResponse, ItemResource } from "@kharidyar/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ItemComparisonDialog } from "./ItemComparisonDialog";
import { LocaleProvider } from "./LocaleProvider";
import { planningApi } from "./planning-api";

const timestamps = {
	archivedAt: null,
	createdAt: "2026-09-08T10:00:00.000Z",
	updatedAt: "2026-09-08T10:00:00.000Z",
};

function renderComparison(quantityNeeded: number, candidates: CandidateComparison[] = []) {
	const item: ItemResource = {
		...timestamps,
		id: "towel-item",
		workspaceId: "test-workspace",
		collectionId: "test-collection",
		title: "Hand towels",
		description: null,
		requirements: null,
		priority: "essential",
		status: "idea",
		quantityNeeded,
		groupLabel: null,
		budget: null,
		deadlineAt: null,
	};
	const comparison: ItemComparisonResponse = {
		itemId: item.id,
		candidates,
		catalogProducts: [],
		merchants: [],
		permissions: {
			canManageCandidates: true,
			canArchiveCandidates: true,
			canManageProducts: true,
			canManageOffers: true,
			canRefreshOffers: true,
			canRecordPurchase: true,
			canViewWorkspaceCatalog: true,
		},
	};
	return renderToStaticMarkup(
		<LocaleProvider initialLocale="en">
			<ItemComparisonDialog
				api={planningApi}
				comparison={comparison}
				error={null}
				item={item}
				loading={false}
				onChange={() => {}}
				onClose={() => {}}
			/>
		</LocaleProvider>,
	);
}

describe("Candidate quantity controls", () => {
	it.each([2, 4])("defaults planned units to the Item quantity (%i)", (quantityNeeded) => {
		const html = renderComparison(quantityNeeded);
		const quantityField = html.match(/<label[^>]*><span[^>]*>Planned units<\/span>(<input[^>]*>)<\/label>/u)?.[1];
		expect(quantityField).toContain(`value="${quantityNeeded}"`);
	});

	it.each([false, true])("only offers settings-based quantity editing for an unplanned Candidate (planned: %s)", (isPlanned) => {
		const candidate: CandidateComparison = {
			...timestamps,
			id: "towel-candidate",
			itemId: "towel-item",
			product: {
				...timestamps,
				id: "towel-product",
				workspaceId: "test-workspace",
				title: "Cotton towel",
				brand: null,
				model: null,
				category: null,
				imageUrl: "https://images.example/cotton.webp",
				attributes: [{ label: "Material", value: "Cotton" }, { label: "Dimensions", value: "30 × 50 cm" }],
			},
			isPlanned,
			plannedPurchaseQuantity: 5,
			plannedOfferId: null,
			notes: "Keep these notes",
			rank: null,
			purchasedQuantity: 0,
			purchases: [],
			offers: [],
		};
		const html = renderComparison(2, [candidate]);
		expect(html).toContain('src="https://images.example/cotton.webp"');
		expect(html).toContain('<dt dir="auto">Material</dt><dd dir="auto">Cotton</dd>');
		expect(html).toContain('<dt dir="auto">Dimensions</dt><dd dir="auto">30 × 50 cm</dd>');
		const settings = html.split("<summary>Edit Candidate</summary>")[1]?.split("</details>")[0];
		expect(settings).toContain("Candidate notes");
		expect(settings?.includes('type="number" min="1"')).toBe(!isPlanned);
		// Planned quantity remains editable through the plan form, including without an Offer.
		expect(html).toContain('aria-label="Planned units" type="number" min="1" step="1" value="5"');
	});
});
