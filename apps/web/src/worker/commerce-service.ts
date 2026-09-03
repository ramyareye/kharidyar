import {
	productAttributeSchema,
	purchaseSnapshotSchema,
	type CandidateComparison,
	type CandidateCreateInput,
	type CandidateUpdateInput,
	type CollectionRollupResponse,
	type CommercePermissions,
	type ItemComparisonResponse,
	type MerchantInput,
	type MerchantResource,
	type OfferFacts,
	type OfferInput,
	type OfferResource,
	type PlannedCostResource,
	type PlannedSelectionInput,
	type PlannedSelectionSnapshot,
	type PriceCheckInput,
	type PriceCheckResource,
	type ProductAttribute,
	type ProductResource,
	type ProductUpdateInput,
	type PurchaseRecordInput,
	type PurchaseRecordResource,
	type PurchaseSnapshot,
	type RollupLine,
	type RollupSummary,
} from "@kharidyar/contracts";
import {
	aggregatePlannedCosts,
	calculatePlannedCost,
	hasCapability,
	isOfferStale,
	offerTerms,
	plannedPurchaseQuantity,
	type AvailabilityState,
	type MerchantSalesChannel,
	type OfferPriceKind,
	type PlannedCost,
	type ShippingBasis,
} from "@kharidyar/domain";

import { conflict, forbidden, notFound, resourceArchived } from "./api-errors";
import {
	loadCollectionAccess,
	loadWorkspaceAccess,
	requireCapability,
	type ResourceAccess,
} from "./authorization";

interface ItemContextRow {
	id: string;
	workspace_id: string;
	collection_id: string;
	title: string;
	quantity_needed: number;
	group_label: string | null;
	archived_at: number | null;
	collection_archived_at: number | null;
	workspace_archived_at: number | null;
}

interface CandidateProductRow {
	candidate_id: string;
	item_id: string;
	planned_purchase_quantity: number;
	is_planned: number;
	planned_offer_id: string | null;
	notes: string | null;
	rank: number | null;
	candidate_archived_at: number | null;
	candidate_created_at: number;
	candidate_updated_at: number;
	product_id: string;
	product_workspace_id: string;
	product_title: string;
	product_brand: string | null;
	product_model: string | null;
	product_category: string | null;
	product_attributes_json: string | null;
	product_archived_at: number | null;
	product_created_at: number;
	product_updated_at: number;
}

interface ProductRow {
	id: string;
	workspace_id: string;
	title: string;
	brand: string | null;
	model: string | null;
	category: string | null;
	attributes_json: string | null;
	archived_at: number | null;
	created_at: number;
	updated_at: number;
}

interface MerchantRow {
	id: string;
	workspace_id: string;
	name: string;
	sales_channel: MerchantSalesChannel;
	website_url: string | null;
	notes: string | null;
	archived_at: number | null;
	created_at: number;
	updated_at: number;
}

interface OfferMerchantRow {
	candidate_id: string;
	offer_id: string;
	workspace_id: string;
	product_id: string;
	merchant_id: string;
	source_url: string;
	price_kind: OfferPriceKind;
	unit_price_minor: number | null;
	currency: string | null;
	shipping_minor: number | null;
	shipping_basis: ShippingBasis;
	availability_state: AvailabilityState;
	availability_channel: string | null;
	availability_location: string | null;
	availability_variant: string | null;
	availability_note: string | null;
	locale: string | null;
	last_checked_at: number;
	offer_archived_at: number | null;
	offer_created_at: number;
	offer_updated_at: number;
	merchant_name: string;
	merchant_sales_channel: MerchantSalesChannel;
	merchant_website_url: string | null;
	merchant_notes: string | null;
	merchant_archived_at: number | null;
	merchant_created_at: number;
	merchant_updated_at: number;
}

interface PriceCheckRow {
	id: string;
	offer_id: string;
	price_kind: OfferPriceKind;
	unit_price_minor: number | null;
	currency: string | null;
	shipping_minor: number | null;
	shipping_basis: ShippingBasis;
	availability_state: AvailabilityState;
	availability_channel: string | null;
	availability_location: string | null;
	availability_variant: string | null;
	availability_note: string | null;
	observed_at: number;
	observed_by_user_id: string;
	observed_by_name: string;
	observed_by_image: string | null;
	created_at: number;
}

interface PurchaseEventRow {
	id: string;
	actor_user_id: string;
	actor_name: string;
	actor_image: string | null;
	purchase_snapshot_json: string;
	created_at: number;
}

interface CandidateStateRow {
	id: string;
	item_id: string;
	workspace_id: string;
	product_id: string;
	planned_purchase_quantity: number;
	is_planned: number;
	planned_offer_id: string | null;
	notes: string | null;
	rank: number | null;
	archived_at: number | null;
}

interface SelectionRow {
	candidate_id: string;
	product_id: string;
	product_title: string;
	planned_purchase_quantity: number;
	planned_offer_id: string | null;
	merchant_name: string | null;
}

interface PurchaseContextRow {
	candidate_id: string;
	product_id: string;
	product_title: string;
	planned_offer_id: string | null;
	is_planned: number;
	candidate_archived_at: number | null;
	offer_id: string;
	merchant_id: string;
	merchant_name: string;
	source_url: string;
	availability_state: AvailabilityState;
	availability_channel: string | null;
	availability_location: string | null;
	availability_variant: string | null;
	availability_note: string | null;
	offer_archived_at: number | null;
}

interface RollupRow {
	item_id: string;
	item_title: string;
	group_label: string | null;
	candidate_id: string | null;
	planned_purchase_quantity: number | null;
	product_title: string | null;
	offer_id: string | null;
	merchant_name: string | null;
	price_kind: OfferPriceKind | null;
	unit_price_minor: number | null;
	currency: string | null;
	shipping_minor: number | null;
	shipping_basis: ShippingBasis | null;
	availability_state: AvailabilityState | null;
}

interface BudgetRow {
	budget_minor: number | null;
	budget_currency: string | null;
}

function timestamp(value: number): string {
	return new Date(value).toISOString();
}

function nullableTimestamp(value: number | null): string | null {
	return value === null ? null : timestamp(value);
}

function attributes(value: string | null): ProductAttribute[] {
	if (value === null) return [];
	return productAttributeSchema.array().max(30).parse(JSON.parse(value));
}

function productResource(row: ProductRow): ProductResource {
	return {
		id: row.id,
		workspaceId: row.workspace_id,
		title: row.title,
		brand: row.brand,
		model: row.model,
		category: row.category,
		attributes: attributes(row.attributes_json),
		archivedAt: nullableTimestamp(row.archived_at),
		createdAt: timestamp(row.created_at),
		updatedAt: timestamp(row.updated_at),
	};
}

function candidateProductResource(row: CandidateProductRow): ProductResource {
	return productResource({
		id: row.product_id,
		workspace_id: row.product_workspace_id,
		title: row.product_title,
		brand: row.product_brand,
		model: row.product_model,
		category: row.product_category,
		attributes_json: row.product_attributes_json,
		archived_at: row.product_archived_at,
		created_at: row.product_created_at,
		updated_at: row.product_updated_at,
	});
}

function merchantResource(row: MerchantRow): MerchantResource {
	return {
		id: row.id,
		workspaceId: row.workspace_id,
		name: row.name,
		salesChannel: row.sales_channel,
		websiteUrl: row.website_url,
		notes: row.notes,
		archivedAt: nullableTimestamp(row.archived_at),
		createdAt: timestamp(row.created_at),
		updatedAt: timestamp(row.updated_at),
	};
}

function offerMerchantResource(row: OfferMerchantRow): MerchantResource {
	return merchantResource({
		id: row.merchant_id,
		workspace_id: row.workspace_id,
		name: row.merchant_name,
		sales_channel: row.merchant_sales_channel,
		website_url: row.merchant_website_url,
		notes: row.merchant_notes,
		archived_at: row.merchant_archived_at,
		created_at: row.merchant_created_at,
		updated_at: row.merchant_updated_at,
	});
}

function facts(row: {
	price_kind: OfferPriceKind;
	unit_price_minor: number | null;
	currency: string | null;
	shipping_minor: number | null;
	shipping_basis: ShippingBasis;
	availability_state: AvailabilityState;
	availability_channel: string | null;
	availability_location: string | null;
	availability_variant: string | null;
	availability_note: string | null;
}): OfferFacts {
	return {
		priceKind: row.price_kind,
		unitPriceMinor: row.unit_price_minor,
		currency: row.currency,
		shippingMinor: row.shipping_minor,
		shippingBasis: row.shipping_basis,
		availabilityState: row.availability_state,
		availabilityChannel: row.availability_channel,
		availabilityLocation: row.availability_location,
		availabilityVariant: row.availability_variant,
		availabilityNote: row.availability_note,
	};
}

function priceCheckResource(row: PriceCheckRow): PriceCheckResource {
	return {
		id: row.id,
		offerId: row.offer_id,
		facts: facts(row),
		observedAt: timestamp(row.observed_at),
		observedBy: {
			id: row.observed_by_user_id,
			name: row.observed_by_name,
			image: row.observed_by_image,
		},
		createdAt: timestamp(row.created_at),
	};
}

function plannedCostResource(cost: PlannedCost): PlannedCostResource {
	return {
		status: cost.status,
		currency: cost.currency,
		merchandiseMinor: cost.merchandiseMinor,
		shippingMinor: cost.shippingMinor,
		totalMinor: cost.totalMinor,
		missing: [...cost.missing],
	};
}

function purchaseRecordResource(row: PurchaseEventRow): PurchaseRecordResource {
	return {
		id: row.id,
		actor: {
			id: row.actor_user_id,
			name: row.actor_name,
			image: row.actor_image,
		},
		purchase: purchaseSnapshotSchema.parse(
			JSON.parse(row.purchase_snapshot_json),
		),
		createdAt: timestamp(row.created_at),
	};
}

async function itemContext(
	database: D1Database,
	itemId: string,
): Promise<ItemContextRow | null> {
	return database
		.prepare(
			`select
				i.id,
				i.workspace_id,
				i.collection_id,
				i.title,
				i.quantity_needed,
				i.group_label,
				i.archived_at,
				c.archived_at as collection_archived_at,
				w.archived_at as workspace_archived_at
			from items i
			join collections c on c.id = i.collection_id
			join workspaces w on w.id = i.workspace_id
			where i.id = ?1`,
		)
		.bind(itemId)
		.first<ItemContextRow>();
}

function requireMutableItem(row: ItemContextRow): void {
	if (row.workspace_archived_at !== null) throw resourceArchived("Workspace");
	if (row.collection_archived_at !== null) throw resourceArchived("Collection");
	if (row.archived_at !== null) throw resourceArchived("Item");
}

async function commerceAccess(input: {
	database: D1Database;
	itemId: string;
	userId: string;
}): Promise<{
	access: ResourceAccess;
	canViewWorkspaceCatalog: boolean;
	item: ItemContextRow;
}> {
	const item = await itemContext(input.database, input.itemId);
	if (item === null) throw notFound();
	const access = requireCapability(
		await loadCollectionAccess(
			input.database,
			input.userId,
			item.collection_id,
		),
		"view",
	);
	const workspaceAccess = await loadWorkspaceAccess(
		input.database,
		input.userId,
		item.workspace_id,
	);
	const canViewWorkspaceCatalog =
		workspaceAccess !== null &&
		hasCapability(workspaceAccess.grants, workspaceAccess.target, "view");
	return { access, canViewWorkspaceCatalog, item };
}

function permissions(
	access: ResourceAccess,
	canViewWorkspaceCatalog: boolean,
): CommercePermissions {
	return {
		canManageCandidates: hasCapability(
			access.grants,
			access.target,
			"candidate_manage",
		),
		canArchiveCandidates: hasCapability(
			access.grants,
			access.target,
			"candidate_archive",
		),
		canManageProducts: hasCapability(
			access.grants,
			access.target,
			"product_manage",
		),
		canManageOffers: hasCapability(
			access.grants,
			access.target,
			"offer_manage",
		),
		canRefreshOffers: hasCapability(
			access.grants,
			access.target,
			"offer_refresh",
		),
		canRecordPurchase: hasCapability(
			access.grants,
			access.target,
			"record_purchase",
		),
		canViewWorkspaceCatalog,
	};
}

const candidateProductSelect = `select
	ic.id as candidate_id,
	ic.item_id,
	ic.planned_purchase_quantity,
	ic.is_planned,
	ic.planned_offer_id,
	ic.notes,
	ic.rank,
	ic.archived_at as candidate_archived_at,
	ic.created_at as candidate_created_at,
	ic.updated_at as candidate_updated_at,
	p.id as product_id,
	p.workspace_id as product_workspace_id,
	p.title as product_title,
	p.brand as product_brand,
	p.model as product_model,
	p.category as product_category,
	p.attributes_json as product_attributes_json,
	p.archived_at as product_archived_at,
	p.created_at as product_created_at,
	p.updated_at as product_updated_at
from item_candidates ic
join products p on p.id = ic.product_id
where ic.item_id = ?1
order by ic.archived_at is not null, ic.rank is null, ic.rank, ic.created_at, ic.id`;

const offerMerchantSelect = `select
	ic.id as candidate_id,
	o.id as offer_id,
	o.workspace_id,
	o.product_id,
	o.merchant_id,
	o.source_url,
	o.price_kind,
	o.unit_price_minor,
	o.currency,
	o.shipping_minor,
	o.shipping_basis,
	o.availability_state,
	o.availability_channel,
	o.availability_location,
	o.availability_variant,
	o.availability_note,
	o.locale,
	o.last_checked_at,
	o.archived_at as offer_archived_at,
	o.created_at as offer_created_at,
	o.updated_at as offer_updated_at,
	m.name as merchant_name,
	m.sales_channel as merchant_sales_channel,
	m.website_url as merchant_website_url,
	m.notes as merchant_notes,
	m.archived_at as merchant_archived_at,
	m.created_at as merchant_created_at,
	m.updated_at as merchant_updated_at
from item_candidates ic
join offers o on o.product_id = ic.product_id and o.workspace_id = ic.workspace_id
join merchants m on m.id = o.merchant_id
where ic.item_id = ?1
order by o.archived_at is not null, o.last_checked_at desc, o.id`;

export async function readItemComparison(input: {
	database: D1Database;
	itemId: string;
	userId: string;
}): Promise<ItemComparisonResponse> {
	const { access, canViewWorkspaceCatalog, item } = await commerceAccess(input);
	const results = await input.database.batch([
		input.database.prepare(candidateProductSelect).bind(item.id),
		input.database.prepare(offerMerchantSelect).bind(item.id),
		input.database
			.prepare(
				`select * from (
					select
						pc.id,
						pc.offer_id,
						pc.price_kind,
						pc.unit_price_minor,
						pc.currency,
						pc.shipping_minor,
						pc.shipping_basis,
						pc.availability_state,
						pc.availability_channel,
						pc.availability_location,
						pc.availability_variant,
						pc.availability_note,
						pc.observed_at,
						pc.observed_by_user_id,
						u.name as observed_by_name,
						u.image as observed_by_image,
						pc.created_at,
						row_number() over (
							partition by pc.offer_id
							order by pc.observed_at desc, pc.id desc
						) as position
					from price_checks pc
					join user u on u.id = pc.observed_by_user_id
					join offers o on o.id = pc.offer_id
					join item_candidates ic
						on ic.product_id = o.product_id and ic.workspace_id = o.workspace_id
					where ic.item_id = ?1
				)
				where position <= 10
				order by offer_id, observed_at desc, id desc`,
			)
			.bind(item.id),
		input.database
			.prepare(
				`select
					e.id,
					e.actor_user_id,
					u.name as actor_name,
					u.image as actor_image,
					e.purchase_snapshot_json,
					e.created_at
				from decision_events e
				join user u on u.id = e.actor_user_id
				where e.item_id = ?1 and e.kind = 'purchase_recorded'
				order by e.created_at desc, e.id desc
				limit 100`,
			)
			.bind(item.id),
		input.database
			.prepare(
				`select
					p.id, p.workspace_id, p.title, p.brand, p.model, p.category,
					p.attributes_json, p.archived_at, p.created_at, p.updated_at
				from products p
				where p.workspace_id = ?1
					and p.archived_at is null
					and (
						?2 = 1
						or exists (
							select 1
							from item_candidates visible_candidate
							join items visible_item on visible_item.id = visible_candidate.item_id
							where visible_candidate.product_id = p.id
								and visible_candidate.archived_at is null
								and visible_item.collection_id = ?3
						)
					)
				order by p.title, p.id
				limit 200`,
			)
			.bind(item.workspace_id, canViewWorkspaceCatalog ? 1 : 0, item.collection_id),
		input.database
			.prepare(
				`select distinct
					m.id, m.workspace_id, m.name, m.sales_channel, m.website_url,
					m.notes, m.archived_at, m.created_at, m.updated_at
				from merchants m
				where m.workspace_id = ?1
					and m.archived_at is null
					and (
						?2 = 1
						or m.created_by_user_id = ?3
						or exists (
							select 1
							from offers visible_offer
							join item_candidates visible_candidate
								on visible_candidate.product_id = visible_offer.product_id
							join items visible_item on visible_item.id = visible_candidate.item_id
							where visible_offer.merchant_id = m.id
								and visible_item.collection_id = ?4
						)
					)
				order by m.name, m.id
				limit 200`,
			)
			.bind(
				item.workspace_id,
				canViewWorkspaceCatalog ? 1 : 0,
				input.userId,
				item.collection_id,
			),
	]);

	const candidateRows = results[0]!.results as unknown as CandidateProductRow[];
	const offerRows = results[1]!.results as unknown as OfferMerchantRow[];
	const priceCheckRows = results[2]!.results as unknown as PriceCheckRow[];
	const purchaseRows = results[3]!.results as unknown as PurchaseEventRow[];
	const catalogRows = results[4]!.results as unknown as ProductRow[];
	const merchantRows = results[5]!.results as unknown as MerchantRow[];

	const checksByOffer = new Map<string, PriceCheckResource[]>();
	for (const row of priceCheckRows) {
		const values = checksByOffer.get(row.offer_id) ?? [];
		values.push(priceCheckResource(row));
		checksByOffer.set(row.offer_id, values);
	}
	const purchasesByCandidate = new Map<string, PurchaseRecordResource[]>();
	for (const row of purchaseRows) {
		const purchase = purchaseRecordResource(row);
		const values = purchasesByCandidate.get(purchase.purchase.candidateId) ?? [];
		values.push(purchase);
		purchasesByCandidate.set(purchase.purchase.candidateId, values);
	}

	const offersByCandidate = new Map<string, OfferResource[]>();
	for (const row of offerRows) {
		const value: OfferResource = {
			id: row.offer_id,
			workspaceId: row.workspace_id,
			productId: row.product_id,
			merchant: offerMerchantResource(row),
			sourceUrl: row.source_url,
			locale: row.locale,
			facts: facts(row),
			lastCheckedAt: timestamp(row.last_checked_at),
			freshness: isOfferStale(row.last_checked_at) ? "stale" : "fresh",
			priceChecks: checksByOffer.get(row.offer_id) ?? [],
			archivedAt: nullableTimestamp(row.offer_archived_at),
			createdAt: timestamp(row.offer_created_at),
			updatedAt: timestamp(row.offer_updated_at),
		};
		const values = offersByCandidate.get(row.candidate_id) ?? [];
		values.push(value);
		offersByCandidate.set(row.candidate_id, values);
	}

	const candidates: CandidateComparison[] = candidateRows.map((row) => {
		const candidateOffers = offersByCandidate.get(row.candidate_id) ?? [];
		const purchases = purchasesByCandidate.get(row.candidate_id) ?? [];
		return {
			id: row.candidate_id,
			itemId: row.item_id,
			product: candidateProductResource(row),
			plannedPurchaseQuantity: row.planned_purchase_quantity,
			isPlanned: row.is_planned === 1,
			plannedOfferId: row.planned_offer_id,
			notes: row.notes,
			rank: row.rank,
			purchasedQuantity: purchases.reduce(
				(total, purchase) => total + purchase.purchase.purchasedQuantity,
				0,
			),
			purchases,
			offers: candidateOffers.map((offer) => ({
				...offer,
				plannedCost: plannedCostResource(
					calculatePlannedCost(
						offerTerms({
							priceKind: offer.facts.priceKind,
							unitPriceMinor: offer.facts.unitPriceMinor,
							currency: offer.facts.currency,
							shippingMinor: offer.facts.shippingMinor,
							shippingBasis: offer.facts.shippingBasis,
							availability: offer.facts.availabilityState,
						}),
						plannedPurchaseQuantity(row.planned_purchase_quantity),
					),
				),
			})),
			archivedAt: nullableTimestamp(row.candidate_archived_at),
			createdAt: timestamp(row.candidate_created_at),
			updatedAt: timestamp(row.candidate_updated_at),
		};
	});

	return {
		itemId: item.id,
		candidates,
		catalogProducts: catalogRows.map(productResource),
		merchants: merchantRows.map(merchantResource),
		permissions: permissions(access, canViewWorkspaceCatalog),
	};
}

async function candidateState(
	database: D1Database,
	itemId: string,
	candidateId: string,
): Promise<CandidateStateRow | null> {
	return database
		.prepare(
			`select
				id, item_id, workspace_id, product_id, planned_purchase_quantity,
				is_planned, planned_offer_id, notes, rank, archived_at
			from item_candidates
			where id = ?1 and item_id = ?2`,
		)
		.bind(candidateId, itemId)
		.first<CandidateStateRow>();
}

function constraintConflict(error: unknown, message: string): never {
	if (error instanceof Error && /constraint|unique/i.test(error.message)) {
		throw conflict(message);
	}
	throw error;
}

export async function createCandidate(input: {
	database: D1Database;
	itemId: string;
	userId: string;
	value: CandidateCreateInput;
}): Promise<ItemComparisonResponse> {
	const { access, canViewWorkspaceCatalog, item } = await commerceAccess(input);
	requireCapability(access, "candidate_manage");
	requireMutableItem(item);
	const candidateId = crypto.randomUUID();
	const productId =
		input.value.product.kind === "new"
			? crypto.randomUUID()
			: input.value.product.productId;
	const now = Date.now();

	if (input.value.product.kind === "existing") {
		const visible = await input.database
			.prepare(
				`select p.id
				from products p
				where p.id = ?1
					and p.workspace_id = ?2
					and p.archived_at is null
					and (
						?3 = 1
						or exists (
							select 1
							from item_candidates visible_candidate
							join items visible_item on visible_item.id = visible_candidate.item_id
							where visible_candidate.product_id = p.id
								and visible_candidate.archived_at is null
								and visible_item.collection_id = ?4
						)
					)`,
			)
			.bind(
				productId,
				item.workspace_id,
				canViewWorkspaceCatalog ? 1 : 0,
				item.collection_id,
			)
			.first<{ id: string }>();
		if (visible === null) throw notFound();
	}

	try {
		const statements: D1PreparedStatement[] = [];
		if (input.value.product.kind === "new") {
			const product = input.value.product.value;
			statements.push(
				input.database
					.prepare(
						`insert into products (
							id, workspace_id, title, brand, model, category, attributes_json,
							created_by_user_id, created_at, updated_at
						) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
					)
					.bind(
						productId,
						item.workspace_id,
						product.title,
						product.brand,
						product.model,
						product.category,
						JSON.stringify(product.attributes),
						input.userId,
						now,
					),
			);
		}
		statements.push(
			input.database
				.prepare(
					`insert into item_candidates (
						id, workspace_id, item_id, product_id, planned_purchase_quantity,
						notes, rank, created_by_user_id, created_at, updated_at
					) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
				)
				.bind(
					candidateId,
					item.workspace_id,
					item.id,
					productId,
					input.value.plannedPurchaseQuantity,
					input.value.notes,
					input.value.rank,
					input.userId,
					now,
				),
		);
		await input.database.batch(statements);
	} catch (error) {
		constraintConflict(error, "That Product is already an active Candidate.");
	}

	return readItemComparison(input);
}

export async function updateCandidate(input: {
	candidateId: string;
	database: D1Database;
	itemId: string;
	userId: string;
	value: CandidateUpdateInput;
}): Promise<ItemComparisonResponse> {
	const { access, item } = await commerceAccess(input);
	requireCapability(access, "candidate_manage");
	requireMutableItem(item);
	const current = await candidateState(
		input.database,
		item.id,
		input.candidateId,
	);
	if (current === null) throw notFound();
	if (current.archived_at !== null) throw resourceArchived("Candidate");
	if (
		current.is_planned === 1 &&
		input.value.plannedPurchaseQuantity !== undefined &&
		input.value.plannedPurchaseQuantity !== current.planned_purchase_quantity
	) {
		throw conflict("Change a planned Candidate's quantity through the plan command.");
	}

	await input.database
		.prepare(
			`update item_candidates
			set planned_purchase_quantity = ?1, notes = ?2, rank = ?3, updated_at = ?4
			where id = ?5 and item_id = ?6 and archived_at is null`,
		)
		.bind(
			input.value.plannedPurchaseQuantity ?? current.planned_purchase_quantity,
			input.value.notes === undefined ? current.notes : input.value.notes,
			input.value.rank === undefined ? current.rank : input.value.rank,
			Date.now(),
			current.id,
			item.id,
		)
		.run();
	return readItemComparison(input);
}

export async function setCandidateArchived(input: {
	archived: boolean;
	candidateId: string;
	database: D1Database;
	itemId: string;
	userId: string;
}): Promise<ItemComparisonResponse> {
	const { access, item } = await commerceAccess(input);
	requireCapability(access, "candidate_archive");
	requireMutableItem(item);
	const current = await candidateState(
		input.database,
		item.id,
		input.candidateId,
	);
	if (current === null) throw notFound();
	if (input.archived && current.is_planned === 1) {
		throw conflict("Clear the planned Candidate before archiving it.");
	}
	if (input.archived === (current.archived_at !== null)) {
		throw conflict(
			input.archived
				? "The Candidate is already archived."
				: "The Candidate is already active.",
		);
	}
	try {
		await input.database
			.prepare(
				`update item_candidates
				set archived_at = ?1, updated_at = ?2
				where id = ?3 and item_id = ?4`,
			)
			.bind(input.archived ? Date.now() : null, Date.now(), current.id, item.id)
			.run();
	} catch (error) {
		constraintConflict(error, "That Product already has an active Candidate.");
	}
	return readItemComparison(input);
}

async function productSharedOutsideCollection(input: {
	collectionId: string;
	database: D1Database;
	productId: string;
}): Promise<boolean> {
	const row = await input.database
		.prepare(
			`select 1 as found
			from item_candidates ic
			join items i on i.id = ic.item_id
			where ic.product_id = ?1
				and ic.archived_at is null
				and i.collection_id <> ?2
			limit 1`,
		)
		.bind(input.productId, input.collectionId)
		.first<{ found: number }>();
	return row !== null;
}

export async function updateCandidateProduct(input: {
	candidateId: string;
	database: D1Database;
	itemId: string;
	userId: string;
	value: ProductUpdateInput;
}): Promise<ItemComparisonResponse> {
	const { access, canViewWorkspaceCatalog, item } = await commerceAccess(input);
	requireCapability(access, "product_manage");
	requireMutableItem(item);
	const candidate = await candidateState(
		input.database,
		item.id,
		input.candidateId,
	);
	if (candidate === null) throw notFound();
	if (candidate.archived_at !== null) throw resourceArchived("Candidate");
	if (
		!canViewWorkspaceCatalog &&
		(await productSharedOutsideCollection({
			collectionId: item.collection_id,
			database: input.database,
			productId: candidate.product_id,
		}))
	) {
		throw forbidden(
			"A Collection-only member cannot edit a Product shared with another Collection.",
		);
	}
	const current = await input.database
		.prepare(
			`select
				id, workspace_id, title, brand, model, category, attributes_json,
				archived_at, created_at, updated_at
			from products
			where id = ?1 and workspace_id = ?2`,
		)
		.bind(candidate.product_id, item.workspace_id)
		.first<ProductRow>();
	if (current === null) throw notFound();
	if (current.archived_at !== null) throw resourceArchived("Product");
	await input.database
		.prepare(
			`update products
			set title = ?1, brand = ?2, model = ?3, category = ?4,
				attributes_json = ?5, updated_at = ?6
			where id = ?7 and workspace_id = ?8 and archived_at is null`,
		)
		.bind(
			input.value.title ?? current.title,
			input.value.brand === undefined ? current.brand : input.value.brand,
			input.value.model === undefined ? current.model : input.value.model,
			input.value.category === undefined
				? current.category
				: input.value.category,
			input.value.attributes === undefined
				? current.attributes_json
				: JSON.stringify(input.value.attributes),
			Date.now(),
			current.id,
			item.workspace_id,
		)
		.run();
	return readItemComparison(input);
}

export async function createMerchant(input: {
	database: D1Database;
	itemId: string;
	userId: string;
	value: MerchantInput;
}): Promise<ItemComparisonResponse> {
	const { access, item } = await commerceAccess(input);
	requireCapability(access, "offer_manage");
	requireMutableItem(item);
	try {
		await input.database
			.prepare(
				`insert into merchants (
					id, workspace_id, name, sales_channel, website_url, notes,
					created_by_user_id, created_at, updated_at
				) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`,
			)
			.bind(
				crypto.randomUUID(),
				item.workspace_id,
				input.value.name,
				input.value.salesChannel,
				input.value.websiteUrl,
				input.value.notes,
				input.userId,
				Date.now(),
			)
			.run();
	} catch (error) {
		constraintConflict(error, "An active Merchant with that name already exists.");
	}
	return readItemComparison(input);
}

async function merchantVisible(input: {
	canViewWorkspaceCatalog: boolean;
	collectionId: string;
	database: D1Database;
	merchantId: string;
	userId: string;
	workspaceId: string;
}): Promise<boolean> {
	const row = await input.database
		.prepare(
			`select m.id
			from merchants m
			where m.id = ?1
				and m.workspace_id = ?2
				and m.archived_at is null
				and (
					?3 = 1
					or m.created_by_user_id = ?4
					or exists (
						select 1
						from offers visible_offer
						join item_candidates visible_candidate
							on visible_candidate.product_id = visible_offer.product_id
						join items visible_item on visible_item.id = visible_candidate.item_id
						where visible_offer.merchant_id = m.id
							and visible_item.collection_id = ?5
					)
				)`,
		)
		.bind(
			input.merchantId,
			input.workspaceId,
			input.canViewWorkspaceCatalog ? 1 : 0,
			input.userId,
			input.collectionId,
		)
		.first<{ id: string }>();
	return row !== null;
}

function observedAt(value: string | undefined): number {
	return value === undefined ? Date.now() : new Date(value).getTime();
}

function offerFactsBindings(value: OfferFacts): readonly unknown[] {
	return [
		value.priceKind,
		value.unitPriceMinor,
		value.currency,
		value.shippingMinor,
		value.shippingBasis,
		value.availabilityState,
		value.availabilityChannel,
		value.availabilityLocation,
		value.availabilityVariant,
		value.availabilityNote,
	];
}

export async function createOffer(input: {
	candidateId: string;
	database: D1Database;
	itemId: string;
	userId: string;
	value: OfferInput;
}): Promise<ItemComparisonResponse> {
	const { access, canViewWorkspaceCatalog, item } = await commerceAccess(input);
	requireCapability(access, "offer_manage");
	requireMutableItem(item);
	const candidate = await candidateState(
		input.database,
		item.id,
		input.candidateId,
	);
	if (candidate === null) throw notFound();
	if (candidate.archived_at !== null) throw resourceArchived("Candidate");
	if (
		!canViewWorkspaceCatalog &&
		(await productSharedOutsideCollection({
			collectionId: item.collection_id,
			database: input.database,
			productId: candidate.product_id,
		}))
	) {
		throw forbidden(
			"A Collection-only member cannot add an Offer to a Product shared with another Collection.",
		);
	}
	if (
		!(await merchantVisible({
			canViewWorkspaceCatalog,
			collectionId: item.collection_id,
			database: input.database,
			merchantId: input.value.merchantId,
			userId: input.userId,
			workspaceId: item.workspace_id,
		}))
	) {
		throw notFound();
	}
	const offerId = crypto.randomUUID();
	const priceCheckId = crypto.randomUUID();
	const now = Date.now();
	const checkedAt = observedAt(input.value.observedAt);
	const factValues = offerFactsBindings(input.value.facts);
	await input.database.batch([
		input.database
			.prepare(
				`insert into offers (
					id, workspace_id, product_id, merchant_id, source_url,
					price_kind, unit_price_minor, currency, shipping_minor,
					shipping_basis, availability_state, availability_channel,
					availability_location, availability_variant, availability_note,
					locale, last_checked_at, created_by_user_id, created_at, updated_at
				) values (
					?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
					?13, ?14, ?15, ?16, ?17, ?18, ?19, ?19
				)`,
			)
			.bind(
				offerId,
				item.workspace_id,
				candidate.product_id,
				input.value.merchantId,
				input.value.sourceUrl,
				...factValues,
				input.value.locale,
				checkedAt,
				input.userId,
				now,
			),
		input.database
			.prepare(
				`insert into price_checks (
					id, offer_id, price_kind, unit_price_minor, currency,
					shipping_minor, shipping_basis, availability_state,
					availability_channel, availability_location, availability_variant,
					availability_note, observed_at, observed_by_user_id, created_at
				) values (
					?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15
				)`,
			)
			.bind(
				priceCheckId,
				offerId,
				...factValues,
				checkedAt,
				input.userId,
				now,
			),
	]);
	return readItemComparison(input);
}

async function offerForCandidate(input: {
	candidateId: string;
	database: D1Database;
	itemId: string;
	offerId: string;
}): Promise<{ productId: string; archivedAt: number | null } | null> {
	return input.database
		.prepare(
			`select o.product_id as productId, o.archived_at as archivedAt
			from offers o
			join item_candidates ic
				on ic.product_id = o.product_id and ic.workspace_id = o.workspace_id
			where o.id = ?1 and ic.id = ?2 and ic.item_id = ?3`,
		)
		.bind(input.offerId, input.candidateId, input.itemId)
		.first<{ productId: string; archivedAt: number | null }>();
}

async function refreshOffer(input: {
	candidateId: string;
	database: D1Database;
	itemId: string;
	merchantId?: string;
	sourceUrl?: string;
	locale?: string | null;
	userId: string;
	facts: OfferFacts;
	observedAt?: string;
	offerId: string;
}): Promise<ItemComparisonResponse> {
	const { access, canViewWorkspaceCatalog, item } = await commerceAccess(input);
	requireCapability(access, "offer_manage");
	requireMutableItem(item);
	const candidate = await candidateState(
		input.database,
		item.id,
		input.candidateId,
	);
	if (candidate === null) throw notFound();
	if (candidate.archived_at !== null) throw resourceArchived("Candidate");
	const offer = await offerForCandidate(input);
	if (offer === null) throw notFound();
	if (offer.archivedAt !== null) throw resourceArchived("Offer");
	if (
		!canViewWorkspaceCatalog &&
		(await productSharedOutsideCollection({
			collectionId: item.collection_id,
			database: input.database,
			productId: candidate.product_id,
		}))
	) {
		throw forbidden(
			"A Collection-only member cannot refresh an Offer shared with another Collection.",
		);
	}
	if (
		input.merchantId !== undefined &&
		!(await merchantVisible({
			canViewWorkspaceCatalog,
			collectionId: item.collection_id,
			database: input.database,
			merchantId: input.merchantId,
			userId: input.userId,
			workspaceId: item.workspace_id,
		}))
	) {
		throw notFound();
	}

	const current = await input.database
		.prepare("select merchant_id, source_url, locale from offers where id = ?1")
		.bind(input.offerId)
		.first<{ merchant_id: string; source_url: string; locale: string | null }>();
	if (current === null) throw notFound();
	const checkId = crypto.randomUUID();
	const now = Date.now();
	const checkedAt = observedAt(input.observedAt);
	const factValues = offerFactsBindings(input.facts);
	await input.database.batch([
		input.database
			.prepare(
				`update offers
				set merchant_id = ?1, source_url = ?2, locale = ?3,
					price_kind = ?4, unit_price_minor = ?5, currency = ?6,
					shipping_minor = ?7, shipping_basis = ?8,
					availability_state = ?9, availability_channel = ?10,
					availability_location = ?11, availability_variant = ?12,
					availability_note = ?13, last_checked_at = ?14, updated_at = ?15
				where id = ?16 and product_id = ?17 and archived_at is null`,
			)
			.bind(
				input.merchantId ?? current.merchant_id,
				input.sourceUrl ?? current.source_url,
				input.locale === undefined ? current.locale : input.locale,
				...factValues,
				checkedAt,
				now,
				input.offerId,
				candidate.product_id,
			),
		input.database
			.prepare(
				`insert into price_checks (
					id, offer_id, price_kind, unit_price_minor, currency,
					shipping_minor, shipping_basis, availability_state,
					availability_channel, availability_location, availability_variant,
					availability_note, observed_at, observed_by_user_id, created_at
				) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
			)
			.bind(
				checkId,
				input.offerId,
				...factValues,
				checkedAt,
				input.userId,
				now,
			),
	]);
	return readItemComparison(input);
}

export function updateOffer(input: {
	candidateId: string;
	database: D1Database;
	itemId: string;
	offerId: string;
	userId: string;
	value: OfferInput;
}): Promise<ItemComparisonResponse> {
	return refreshOffer({
		...input,
		merchantId: input.value.merchantId,
		sourceUrl: input.value.sourceUrl,
		locale: input.value.locale,
		facts: input.value.facts,
		observedAt: input.value.observedAt,
	});
}

export function recordPriceCheck(input: {
	candidateId: string;
	database: D1Database;
	itemId: string;
	offerId: string;
	userId: string;
	value: PriceCheckInput;
}): Promise<ItemComparisonResponse> {
	return refreshOffer({
		...input,
		facts: input.value.facts,
		observedAt: input.value.observedAt,
	});
}

async function selectedCandidate(
	database: D1Database,
	itemId: string,
): Promise<SelectionRow | null> {
	return database
		.prepare(
			`select
				ic.id as candidate_id,
				ic.product_id,
				p.title as product_title,
				ic.planned_purchase_quantity,
				ic.planned_offer_id,
				m.name as merchant_name
			from item_candidates ic
			join products p on p.id = ic.product_id
			left join offers o on o.id = ic.planned_offer_id
			left join merchants m on m.id = o.merchant_id
			where ic.item_id = ?1 and ic.is_planned = 1 and ic.archived_at is null`,
		)
		.bind(itemId)
		.first<SelectionRow>();
}

function selectionSnapshot(row: SelectionRow | null): PlannedSelectionSnapshot | null {
	if (row === null) return null;
	return {
		candidateId: row.candidate_id,
		productId: row.product_id,
		productTitle: row.product_title,
		offerId: row.planned_offer_id,
		merchantName: row.merchant_name,
		plannedPurchaseQuantity: row.planned_purchase_quantity,
	};
}

async function targetSelection(input: {
	database: D1Database;
	itemId: string;
	value: PlannedSelectionInput;
}): Promise<SelectionRow | null> {
	if (input.value.candidateId === null) return null;
	const row = await input.database
		.prepare(
			`select
				ic.id as candidate_id,
				ic.product_id,
				p.title as product_title,
				?1 as planned_purchase_quantity,
				?2 as planned_offer_id,
				m.name as merchant_name
			from item_candidates ic
			join products p on p.id = ic.product_id
			left join offers o
				on o.id = ?2
				and o.product_id = ic.product_id
				and o.workspace_id = ic.workspace_id
				and o.archived_at is null
			left join merchants m on m.id = o.merchant_id
			where ic.id = ?3
				and ic.item_id = ?4
				and ic.archived_at is null
				and p.archived_at is null
				and (?2 is null or o.id is not null)`,
		)
		.bind(
			input.value.plannedPurchaseQuantity,
			input.value.offerId,
			input.value.candidateId,
			input.itemId,
		)
		.first<SelectionRow>();
	if (row === null) throw notFound();
	return row;
}

export async function changePlannedSelection(input: {
	database: D1Database;
	itemId: string;
	userId: string;
	value: PlannedSelectionInput;
}): Promise<ItemComparisonResponse> {
	const { access, item } = await commerceAccess(input);
	requireCapability(access, "candidate_manage");
	requireMutableItem(item);
	const before = selectionSnapshot(
		await selectedCandidate(input.database, item.id),
	);
	const after = selectionSnapshot(
		await targetSelection({
			database: input.database,
			itemId: item.id,
			value: input.value,
		}),
	);
	if (JSON.stringify(before) === JSON.stringify(after)) {
		throw conflict("The Item already has this planned selection.");
	}
	const eventId = crypto.randomUUID();
	const now = Date.now();
	const update =
		input.value.candidateId === null
			? input.database
					.prepare(
						`update item_candidates
						set is_planned = 0, planned_offer_id = null, updated_at = ?1
						where item_id = ?2 and is_planned = 1 and archived_at is null`,
					)
					.bind(now, item.id)
			: input.database
					.prepare(
						`update item_candidates
						set
							is_planned = case when id = ?1 then 1 else 0 end,
							planned_offer_id = case when id = ?1 then ?2 else null end,
							planned_purchase_quantity = case when id = ?1 then ?3 else planned_purchase_quantity end,
							updated_at = ?4
						where item_id = ?5
							and archived_at is null
							and (is_planned = 1 or id = ?1)`,
					)
					.bind(
						input.value.candidateId,
						input.value.offerId,
						input.value.plannedPurchaseQuantity,
						now,
						item.id,
					);
	await input.database.batch([
		update,
		input.database
			.prepare(
				`insert into decision_events (
					id, item_id, kind, actor_user_id, before_snapshot_json,
					after_snapshot_json, created_at
				) values (?1, ?2, 'planned_candidate_changed', ?3, ?4, ?5, ?6)`,
			)
			.bind(
				eventId,
				item.id,
				input.userId,
				before === null ? null : JSON.stringify(before),
				after === null ? null : JSON.stringify(after),
				now,
			),
	]);
	return readItemComparison(input);
}

export async function recordPurchase(input: {
	database: D1Database;
	itemId: string;
	userId: string;
	value: PurchaseRecordInput;
}): Promise<ItemComparisonResponse> {
	const { access, item } = await commerceAccess(input);
	requireCapability(access, "record_purchase");
	requireMutableItem(item);
	const current = await input.database
		.prepare(
			`select
				ic.id as candidate_id,
				ic.product_id,
				p.title as product_title,
				ic.planned_offer_id,
				ic.is_planned,
				ic.archived_at as candidate_archived_at,
				o.id as offer_id,
				o.merchant_id,
				m.name as merchant_name,
				o.source_url,
				o.availability_state,
				o.availability_channel,
				o.availability_location,
				o.availability_variant,
				o.availability_note,
				o.archived_at as offer_archived_at
			from item_candidates ic
			join products p on p.id = ic.product_id
			join offers o
				on o.id = ?1 and o.product_id = ic.product_id and o.workspace_id = ic.workspace_id
			join merchants m on m.id = o.merchant_id
			where ic.id = ?2 and ic.item_id = ?3`,
		)
		.bind(input.value.offerId, input.value.candidateId, item.id)
		.first<PurchaseContextRow>();
	if (current === null) throw notFound();
	if (current.candidate_archived_at !== null) throw resourceArchived("Candidate");
	if (current.offer_archived_at !== null) throw resourceArchived("Offer");
	if (
		current.is_planned !== 1 ||
		current.planned_offer_id !== current.offer_id
	) {
		throw conflict("Record a purchase only against the currently planned Offer.");
	}

	const checkId = crypto.randomUUID();
	const eventId = crypto.randomUUID();
	const now = Date.now();
	const checkedAt = observedAt(input.value.observedAt);
	const cost = calculatePlannedCost(
		offerTerms({
			priceKind: "exact",
			unitPriceMinor: input.value.unitPriceMinor,
			currency: input.value.currency,
			shippingMinor: input.value.shippingMinor,
			shippingBasis: input.value.shippingBasis,
			availability: current.availability_state,
		}),
		plannedPurchaseQuantity(input.value.purchasedQuantity),
	);
	const snapshot: PurchaseSnapshot = {
		candidateId: current.candidate_id,
		productId: current.product_id,
		productTitle: current.product_title,
		offerId: current.offer_id,
		merchantId: current.merchant_id,
		merchantName: current.merchant_name,
		sourceUrl: current.source_url,
		priceCheckId: checkId,
		purchasedQuantity: input.value.purchasedQuantity,
		priceKind: "exact",
		unitPriceMinor: input.value.unitPriceMinor,
		currency: input.value.currency,
		shippingMinor: input.value.shippingMinor,
		shippingBasis: input.value.shippingBasis,
		merchandiseTotalMinor: cost.merchandiseMinor!,
		shippingTotalMinor: cost.shippingMinor,
		totalMinor: cost.totalMinor,
		observedAt: timestamp(checkedAt),
		note: input.value.note,
	};
	await input.database.batch([
		input.database
			.prepare(
				`update offers
				set price_kind = 'exact', unit_price_minor = ?1, currency = ?2,
					shipping_minor = ?3, shipping_basis = ?4,
					last_checked_at = ?5, updated_at = ?6
				where id = ?7 and archived_at is null`,
			)
			.bind(
				input.value.unitPriceMinor,
				input.value.currency,
				input.value.shippingMinor,
				input.value.shippingBasis,
				checkedAt,
				now,
				current.offer_id,
			),
		input.database
			.prepare(
				`insert into price_checks (
					id, offer_id, price_kind, unit_price_minor, currency,
					shipping_minor, shipping_basis, availability_state,
					availability_channel, availability_location, availability_variant,
					availability_note, observed_at, observed_by_user_id, created_at
				) values (
					?1, ?2, 'exact', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
				)`,
			)
			.bind(
				checkId,
				current.offer_id,
				input.value.unitPriceMinor,
				input.value.currency,
				input.value.shippingMinor,
				input.value.shippingBasis,
				current.availability_state,
				current.availability_channel,
				current.availability_location,
				current.availability_variant,
				current.availability_note,
				checkedAt,
				input.userId,
				now,
			),
		input.database
			.prepare(
				`insert into decision_events (
					id, item_id, kind, actor_user_id, candidate_id, offer_id,
					price_check_id, purchased_quantity, purchase_snapshot_json, created_at
				) values (?1, ?2, 'purchase_recorded', ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
			)
			.bind(
				eventId,
				item.id,
				input.userId,
				current.candidate_id,
				current.offer_id,
				checkId,
				input.value.purchasedQuantity,
				JSON.stringify(snapshot),
				now,
			),
	]);
	return readItemComparison(input);
}

function rollupSummary(
	costs: readonly PlannedCost[],
	unplannedLineCount: number,
): RollupSummary {
	const aggregate = aggregatePlannedCosts(costs, "EUR");
	return {
		status:
			unplannedLineCount > 0 ? "incomplete" : aggregate.status,
		currency: aggregate.currency,
		merchandiseMinor: aggregate.merchandiseMinor,
		shippingMinor: aggregate.shippingMinor,
		totalMinor: aggregate.totalMinor,
		completeLineCount: aggregate.completeLineCount,
		incompleteLineCount: aggregate.incompleteLineCount,
		currencyMismatchLineCount: aggregate.currencyMismatchLineCount,
		unplannedLineCount,
	};
}

export async function readCollectionRollup(input: {
	collectionId: string;
	database: D1Database;
	userId: string;
}): Promise<CollectionRollupResponse> {
	requireCapability(
		await loadCollectionAccess(
			input.database,
			input.userId,
			input.collectionId,
		),
		"view",
	);
	const [lineResult, budget] = await Promise.all([
		input.database
			.prepare(
				`select
					i.id as item_id,
					i.title as item_title,
					i.group_label,
					ic.id as candidate_id,
					ic.planned_purchase_quantity,
					p.title as product_title,
					o.id as offer_id,
					m.name as merchant_name,
					o.price_kind,
					o.unit_price_minor,
					o.currency,
					o.shipping_minor,
					o.shipping_basis,
					o.availability_state
				from items i
				left join item_candidates ic
					on ic.item_id = i.id and ic.is_planned = 1 and ic.archived_at is null
				left join products p on p.id = ic.product_id
				left join offers o on o.id = ic.planned_offer_id and o.archived_at is null
				left join merchants m on m.id = o.merchant_id
				where i.collection_id = ?1 and i.archived_at is null
				order by i.group_label is null, i.group_label, i.created_at, i.id`,
			)
			.bind(input.collectionId)
			.all<RollupRow>(),
		input.database
			.prepare(
				`select budget_minor, budget_currency
				from collection_briefs
				where collection_id = ?1`,
			)
			.bind(input.collectionId)
			.first<BudgetRow>(),
	]);

	const costsByItem = new Map<string, PlannedCost>();
	const lines: RollupLine[] = lineResult.results.map((row) => {
		if (row.candidate_id === null) {
			return {
				itemId: row.item_id,
				itemTitle: row.item_title,
				groupLabel: row.group_label,
				candidateId: row.candidate_id,
				productTitle: row.product_title,
				offerId: null,
				merchantName: null,
				plannedPurchaseQuantity: row.planned_purchase_quantity,
				state: "unplanned",
				cost: null,
			};
		}
		if (row.offer_id === null) {
			const cost: PlannedCost = {
				status: "incomplete",
				currency: null,
				merchandiseMinor: null,
				shippingMinor: null,
				totalMinor: null,
				missing: ["unit_price", "shipping"],
			};
			costsByItem.set(row.item_id, cost);
			return {
				itemId: row.item_id,
				itemTitle: row.item_title,
				groupLabel: row.group_label,
				candidateId: row.candidate_id,
				productTitle: row.product_title,
				offerId: null,
				merchantName: null,
				plannedPurchaseQuantity: row.planned_purchase_quantity,
				state: "incomplete",
				cost: plannedCostResource(cost),
			};
		}
		if (
			row.price_kind === null ||
			row.shipping_basis === null ||
			row.availability_state === null ||
			row.planned_purchase_quantity === null
		) {
			throw new Error("Stored planned Offer is incomplete");
		}
		const cost = calculatePlannedCost(
			offerTerms({
				priceKind: row.price_kind,
				unitPriceMinor: row.unit_price_minor,
				currency: row.currency,
				shippingMinor: row.shipping_minor,
				shippingBasis: row.shipping_basis,
				availability: row.availability_state,
			}),
			plannedPurchaseQuantity(row.planned_purchase_quantity),
		);
		costsByItem.set(row.item_id, cost);
		const state =
			cost.currency !== null && cost.currency !== "EUR"
				? "currency_mismatch"
				: cost.status === "incomplete"
					? "incomplete"
					: "planned";
		return {
			itemId: row.item_id,
			itemTitle: row.item_title,
			groupLabel: row.group_label,
			candidateId: row.candidate_id,
			productTitle: row.product_title,
			offerId: row.offer_id,
			merchantName: row.merchant_name,
			plannedPurchaseQuantity: row.planned_purchase_quantity,
			state,
			cost: plannedCostResource(cost),
		};
	});

	const groupLines = new Map<string, RollupLine[]>();
	for (const line of lines) {
		const key = line.groupLabel ?? "";
		const values = groupLines.get(key) ?? [];
		values.push(line);
		groupLines.set(key, values);
	}
	const groups = [...groupLines.entries()].map(([key, values]) => ({
		groupLabel: key || null,
		summary: rollupSummary(
			values.flatMap((line) => {
				const cost = costsByItem.get(line.itemId);
				return cost === undefined ? [] : [cost];
			}),
			values.filter((line) => line.state === "unplanned").length,
		),
	}));
	const summary = rollupSummary(
		[...costsByItem.values()],
		lines.filter((line) => line.state === "unplanned").length,
	);
	const budgetResource =
		budget?.budget_minor === null ||
		budget?.budget_minor === undefined ||
		budget.budget_currency === null
			? null
			: { minor: budget.budget_minor, currency: budget.budget_currency };
	const budgetComparison =
		budgetResource === null
			? null
			: summary.status === "incomplete"
				? { status: "incomplete" as const, differenceMinor: null }
				: summary.totalMinor > budgetResource.minor
					? {
							status: "over_budget" as const,
							differenceMinor: summary.totalMinor - budgetResource.minor,
						}
					: summary.status === "lower_bound"
						? {
								status: "lower_bound" as const,
								differenceMinor: budgetResource.minor - summary.totalMinor,
							}
						: {
								status: "within_budget" as const,
								differenceMinor: budgetResource.minor - summary.totalMinor,
							};

	return {
		collectionId: input.collectionId,
		budget: budgetResource,
		summary,
		budgetComparison,
		groups,
		lines,
	};
}
