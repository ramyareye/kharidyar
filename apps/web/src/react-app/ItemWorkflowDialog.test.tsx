import type { ItemResource, RollupLine } from "@kharidyar/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ItemWorkflowDialog } from "./ItemWorkflowDialog";
import { LocaleProvider } from "./LocaleProvider";

const item: ItemResource = {
	id: "item",
	workspaceId: "workspace",
	collectionId: "collection",
	title: "Armchair",
	description: null,
	requirements: null,
	priority: "nice_to_have",
	status: "idea",
	quantityNeeded: 1,
	groupLabel: null,
	budget: null,
	deadlineAt: null,
	archivedAt: null,
	createdAt: "2026-09-09T10:00:00.000Z",
	updatedAt: "2026-09-09T10:00:00.000Z",
};
const plan: RollupLine = {
	itemId: item.id,
	itemTitle: item.title,
	groupLabel: null,
	candidateId: null,
	productTitle: null,
	productImageUrl: null,
	previewProduct: {
		title: "Candidate chair",
		imageUrl: "https://shop.example/preview.jpg",
	},
	offerId: null,
	merchantName: null,
	plannedPurchaseQuantity: null,
	state: "unplanned",
	cost: null,
};

function renderDetail({
	description = "",
	line = plan,
	error = null,
}: {
	description?: string;
	line?: RollupLine;
	error?: string | null;
} = {}) {
	return renderToStaticMarkup(
		<LocaleProvider initialLocale="en">
			<ItemWorkflowDialog
				item={{ ...item, description }}
				plan={line}
				events={[]}
				error={error}
				busy={false}
				loading={false}
				permissions={{
					canCreate: true,
					canEdit: true,
					canArchive: true,
					canChangeNonPurchaseStatus: true,
					canMarkPurchased: true,
				}}
				onClose={() => {}}
				onEdit={() => {}}
				onCompare={() => {}}
				onChangeStatus={async () => true}
			/>
		</LocaleProvider>,
	);
}

describe("Item detail photos and notes", () => {
	it("shows the candidate preview while unplanned, and the chosen product once planned", () => {
		expect(renderDetail()).toContain('src="https://shop.example/preview.jpg"');
		const html = renderDetail({
			line: {
				...plan,
				candidateId: "chosen",
				productTitle: "Chosen chair",
				productImageUrl: "https://shop.example/chosen.jpg",
			},
		});
		expect(html).toContain('src="https://shop.example/chosen.jpg"');
		expect(html).not.toContain('src="https://shop.example/preview.jpg"');
	});

	it("keeps a missing chosen photo empty instead of showing a different candidate", () => {
		const html = renderDetail({
			line: { ...plan, candidateId: "chosen", productTitle: "Chosen chair" },
		});
		expect(html).toContain('aria-label="No product photo"');
		expect(html).not.toContain('src="https://shop.example/preview.jpg"');
	});

	it("renders HTTPS note links without interpreting HTML or unsafe URLs", () => {
		const html = renderDetail({
			description:
				'[Details at IKEA](https://www.ikea.com/nl/en/p/chair/) [Unsafe](javascript:alert(1)) [Private](https://user:secret@shop.example) [Insecure](http://shop.example) <img src=x onerror=alert(1)> [Quote](https://shop.example/"onmouseover="test)',
		});
		expect(html).toContain('href="https://www.ikea.com/nl/en/p/chair/"');
		expect(html).toContain('rel="noreferrer">Details at IKEA</a>');
		expect(html).not.toMatch(/href="(?:javascript:|http:|https:\/\/user:)/u);
		expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
		expect(html).not.toContain(' onmouseover="');
	});

	it("keeps save errors visible while history is collapsed", () => {
		const html = renderDetail({ error: "Could not save" });
		expect(html.indexOf('role="alert"')).toBeLessThan(
			html.indexOf('<details class="item-workflow__history"'),
		);
		expect(html).toContain('role="alert">Could not save</p>');
	});
});
