import {
	candidateCreateInputSchema,
	importDraftResourceSchema,
	itemCreateInputSchema,
	merchantInputSchema,
	offerInputSchema,
	priceCheckInputSchema,
	productInputSchema,
	type ImportApplicationRecord,
	type ImportDraftCreateInput,
	type ImportDraftResource,
	type ImportProposal,
	type ImportWarning,
} from "@kharidyar/contracts";
import { hasCapability, type Capability } from "@kharidyar/domain";

import { badRequest, conflict, notFound, resourceArchived } from "./api-errors";
import {
	loadCollectionAccess,
	requireCapability,
	type ResourceAccess,
} from "./authorization";
import {
	ImportParseError,
	importParserVersion,
	parseImportInput,
	reviewImportProposal,
} from "./import-draft-parser";

interface CollectionStateRow {
	id: string;
	workspace_id: string;
	archived_at: number | null;
	workspace_archived_at: number | null;
}

interface ImportDraftRow {
	id: string;
	workspace_id: string;
	collection_id: string;
	format: "json" | "markdown";
	parser_version: string;
	proposal_json: string;
	warnings_json: string;
	status: "applied" | "discarded" | "draft";
	raw_input: string | null;
	created_by_user_id: string;
	applied_by_user_id: string | null;
	applied_at: number | null;
	discarded_by_user_id: string | null;
	discarded_at: number | null;
	created_at: number;
	updated_at: number;
}

interface ImportApplicationRow {
	draft_id: string;
	proposal_key: string;
	record_type: ImportApplicationRecord["recordType"];
	record_id: string;
	action: ImportApplicationRecord["action"];
}

function timestamp(value: number): string {
	return new Date(value).toISOString();
}

function nullableTimestamp(value: number | null): string | null {
	return value === null ? null : timestamp(value);
}

async function collectionState(
	database: D1Database,
	collectionId: string,
): Promise<CollectionStateRow | null> {
	return database
		.prepare(
			`select
				c.id,
				c.workspace_id,
				c.archived_at,
				w.archived_at as workspace_archived_at
			from collections c
			join workspaces w on w.id = c.workspace_id
			where c.id = ?1`,
		)
		.bind(collectionId)
		.first<CollectionStateRow>();
}

function requireMutableCollection(row: CollectionStateRow): void {
	if (row.workspace_archived_at !== null) throw resourceArchived("Workspace");
	if (row.archived_at !== null) throw resourceArchived("Collection");
}

async function importAccess(input: {
	collectionId: string;
	database: D1Database;
	userId: string;
}): Promise<{ access: ResourceAccess; collection: CollectionStateRow }> {
	const collection = await collectionState(input.database, input.collectionId);
	if (collection === null) throw notFound();
	const access = requireCapability(
		await loadCollectionAccess(
			input.database,
			input.userId,
			input.collectionId,
		),
		"view",
	);
	return { access, collection };
}

function can(access: ResourceAccess, capability: Capability): boolean {
	return hasCapability(access.grants, access.target, capability);
}

function permissions(
	access: ResourceAccess,
	collection: CollectionStateRow,
	status: ImportDraftRow["status"],
) {
	const mutable =
		status === "draft" &&
		collection.archived_at === null &&
		collection.workspace_archived_at === null;
	return {
		canEdit: mutable && can(access, "research_manage"),
		canApply:
			mutable &&
			[
				"research_manage",
				"item_create",
				"candidate_manage",
				"product_manage",
				"offer_manage",
			].every((capability) => can(access, capability as Capability)),
	};
}

function applicationResource(
	row: ImportApplicationRow,
): ImportApplicationRecord {
	return {
		proposalKey: row.proposal_key,
		recordType: row.record_type,
		recordId: row.record_id,
		action: row.action,
	};
}

function draftResource(input: {
	access: ResourceAccess;
	application: ImportApplicationRow[];
	collection: CollectionStateRow;
	row: ImportDraftRow;
}): ImportDraftResource {
	const proposal = JSON.parse(input.row.proposal_json) as unknown;
	const warnings = JSON.parse(input.row.warnings_json) as unknown;
	const reviewed = reviewImportProposal(
		importDraftResourceSchema.shape.proposal.parse(proposal),
	);
	return importDraftResourceSchema.parse({
		id: input.row.id,
		workspaceId: input.row.workspace_id,
		collectionId: input.row.collection_id,
		format: input.row.format,
		parserVersion: input.row.parser_version,
		proposal: reviewed.proposal,
		warnings,
		reconciliations: reviewed.reconciliations,
		status: input.row.status,
		rawInput: input.row.raw_input,
		createdByUserId: input.row.created_by_user_id,
		appliedByUserId: input.row.applied_by_user_id,
		appliedAt: nullableTimestamp(input.row.applied_at),
		discardedByUserId: input.row.discarded_by_user_id,
		discardedAt: nullableTimestamp(input.row.discarded_at),
		application: input.application.map(applicationResource),
		permissions: permissions(input.access, input.collection, input.row.status),
		createdAt: timestamp(input.row.created_at),
		updatedAt: timestamp(input.row.updated_at),
	});
}

async function draftRow(
	database: D1Database,
	collectionId: string,
	draftId: string,
): Promise<ImportDraftRow | null> {
	return database
		.prepare(`select * from import_drafts where id = ?1 and collection_id = ?2`)
		.bind(draftId, collectionId)
		.first<ImportDraftRow>();
}

async function applicationRows(
	database: D1Database,
	draftIds: string[],
): Promise<ImportApplicationRow[]> {
	if (draftIds.length === 0) return [];
	const result = await database
		.prepare(
			`select draft_id, proposal_key, record_type, record_id, action
			from import_draft_applications
			where draft_id in (select value from json_each(?1))
			order by created_at, proposal_key, record_type`,
		)
		.bind(JSON.stringify(draftIds))
		.all<ImportApplicationRow>();
	return result.results;
}

export async function listImportDrafts(input: {
	collectionId: string;
	database: D1Database;
	userId: string;
}): Promise<ImportDraftResource[]> {
	const { access, collection } = await importAccess(input);
	const result = await input.database
		.prepare(
			`select * from import_drafts
			where collection_id = ?1
			order by created_at desc, id desc
			limit 20`,
		)
		.bind(collection.id)
		.all<ImportDraftRow>();
	const applications = await applicationRows(
		input.database,
		result.results.map(({ id }) => id),
	);
	return result.results.map((row) =>
		draftResource({
			access,
			application: applications.filter(({ draft_id }) => draft_id === row.id),
			collection,
			row,
		}),
	);
}

export async function readImportDraft(input: {
	collectionId: string;
	database: D1Database;
	draftId: string;
	userId: string;
}): Promise<ImportDraftResource> {
	const { access, collection } = await importAccess(input);
	const row = await draftRow(input.database, collection.id, input.draftId);
	if (row === null) throw notFound();
	const application = await applicationRows(input.database, [row.id]);
	return draftResource({ access, application, collection, row });
}

export async function createImportDraft(input: {
	collectionId: string;
	database: D1Database;
	userId: string;
	value: ImportDraftCreateInput;
}): Promise<ImportDraftResource> {
	const { access, collection } = await importAccess(input);
	requireCapability(access, "research_manage");
	requireMutableCollection(collection);
	let reviewed;
	try {
		reviewed = parseImportInput(input.value.format, input.value.rawInput);
	} catch (error) {
		if (error instanceof ImportParseError) throw badRequest(error.message);
		throw error;
	}
	const id = crypto.randomUUID();
	const now = Date.now();
	await input.database
		.prepare(
			`insert into import_drafts (
				id, workspace_id, collection_id, format, parser_version,
				proposal_json, warnings_json, status, raw_input,
				created_by_user_id, created_at, updated_at
			) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'draft', ?8, ?9, ?10, ?10)`,
		)
		.bind(
			id,
			collection.workspace_id,
			collection.id,
			input.value.format,
			importParserVersion,
			JSON.stringify(reviewed.proposal),
			JSON.stringify(reviewed.warnings),
			input.value.rawInput,
			input.userId,
			now,
		)
		.run();
	return readImportDraft({ ...input, draftId: id });
}

export async function correctImportDraft(input: {
	collectionId: string;
	database: D1Database;
	draftId: string;
	proposal: ImportProposal;
	userId: string;
}): Promise<ImportDraftResource> {
	const { access, collection } = await importAccess(input);
	requireCapability(access, "research_manage");
	requireMutableCollection(collection);
	const row = await draftRow(input.database, collection.id, input.draftId);
	if (row === null) throw notFound();
	if (row.status !== "draft")
		throw conflict("Only an open Import Draft can be corrected.");
	const reviewed = reviewImportProposal(input.proposal);
	await input.database
		.prepare(
			`update import_drafts
			set proposal_json = ?1, warnings_json = ?2, parser_version = ?3, updated_at = ?4
			where id = ?5 and collection_id = ?6 and status = 'draft'`,
		)
		.bind(
			JSON.stringify(reviewed.proposal),
			JSON.stringify(reviewed.warnings),
			importParserVersion,
			Date.now(),
			row.id,
			collection.id,
		)
		.run();
	return readImportDraft(input);
}

function validatedApplicationPlan(draftId: string, proposal: ImportProposal) {
	const items = [];
	const products = [];
	const candidates = [];
	const merchantByName = new Map<string, Record<string, unknown>>();
	const offers = [];
	const priceChecks = [];
	const mappings: Array<{
		action: "created";
		proposalKey: string;
		recordId: string;
		recordType: Exclude<ImportApplicationRecord["recordType"], "merchant">;
	}> = [];
	const merchantMappings: Array<{
		desiredId: string;
		lineKey: string;
		merchantName: string;
	}> = [];

	for (const [index, line] of proposal.lines.entries()) {
		const prefix = `import-${draftId}-${String(index + 1).padStart(3, "0")}`;
		const itemId = `${prefix}-item`;
		const productId = `${prefix}-product`;
		const candidateId = `${prefix}-candidate`;
		const item = itemCreateInputSchema.parse({
			title: line.item.title,
			description: line.item.description,
			requirements: line.item.requirements,
			priority: "nice_to_have",
			quantityNeeded: line.item.quantityNeeded,
			groupLabel: line.groupLabel,
			budget: null,
			deadlineAt: null,
		});
		const product = productInputSchema.parse(line.product);
		candidateCreateInputSchema.parse({
			product: { kind: "new", value: product },
			plannedPurchaseQuantity: line.candidate.plannedPurchaseQuantity,
			notes: line.candidate.notes,
			rank: null,
		});
		items.push({ id: itemId, ...item });
		products.push({ id: productId, ...product });
		candidates.push({
			id: candidateId,
			itemId,
			productId,
			plannedPurchaseQuantity: line.candidate.plannedPurchaseQuantity,
			notes: line.candidate.notes,
		});
		for (const [recordType, recordId] of [
			["item", itemId],
			["product", productId],
			["candidate", candidateId],
		] as const) {
			mappings.push({
				action: "created",
				proposalKey: line.key,
				recordId,
				recordType,
			});
		}

		if (line.offer === null) continue;
		const merchant = merchantInputSchema.parse(line.offer.merchant);
		let merchantPlan = merchantByName.get(merchant.name);
		if (!merchantPlan) {
			merchantPlan = {
				desiredId: `import-${draftId}-merchant-${String(merchantByName.size + 1).padStart(3, "0")}`,
				...merchant,
			};
			merchantByName.set(merchant.name, merchantPlan);
		}
		const desiredMerchantId = String(merchantPlan.desiredId);
		const offerId = `${prefix}-offer`;
		const priceCheckId = `${prefix}-price-check`;
		const offer = offerInputSchema.parse({
			merchantId: desiredMerchantId,
			sourceUrl: line.offer.sourceUrl,
			locale: line.offer.locale,
			facts: line.offer.facts,
			observedAt: line.offer.observedAt ?? undefined,
		});
		priceCheckInputSchema.parse({
			facts: line.offer.facts,
			observedAt: line.offer.observedAt ?? undefined,
		});
		offers.push({
			id: offerId,
			productId,
			merchantName: merchant.name,
			desiredMerchantId,
			sourceUrl: offer.sourceUrl,
			locale: offer.locale,
			...offer.facts,
			observedAt: offer.observedAt
				? new Date(offer.observedAt).getTime()
				: null,
		});
		priceChecks.push({
			id: priceCheckId,
			offerId,
			...offer.facts,
			observedAt: offer.observedAt
				? new Date(offer.observedAt).getTime()
				: null,
		});
		merchantMappings.push({
			desiredId: desiredMerchantId,
			lineKey: line.key,
			merchantName: merchant.name,
		});
		mappings.push(
			{
				action: "created",
				proposalKey: line.key,
				recordId: offerId,
				recordType: "offer",
			},
			{
				action: "created",
				proposalKey: line.key,
				recordId: priceCheckId,
				recordType: "price_check",
			},
		);
	}

	return {
		items,
		products,
		candidates,
		merchants: [...merchantByName.values()],
		offers,
		priceChecks,
		mappings,
		merchantMappings,
	};
}

function activeDraftGate(alias = "d"): string {
	return `${alias}.id = ?2 and ${alias}.status = 'draft'`;
}

export async function applyImportDraft(input: {
	collectionId: string;
	database: D1Database;
	draftId: string;
	userId: string;
}): Promise<ImportDraftResource> {
	const { access, collection } = await importAccess(input);
	for (const capability of [
		"research_manage",
		"item_create",
		"candidate_manage",
		"product_manage",
		"offer_manage",
	] as const) {
		requireCapability(access, capability);
	}
	requireMutableCollection(collection);
	const row = await draftRow(input.database, collection.id, input.draftId);
	if (row === null) throw notFound();
	if (row.status === "applied") return readImportDraft(input);
	if (row.status === "discarded")
		throw conflict("A discarded Import Draft cannot be applied.");
	const proposal = importDraftResourceSchema.shape.proposal.parse(
		JSON.parse(row.proposal_json),
	);
	const warnings = importDraftResourceSchema.shape.warnings.parse(
		JSON.parse(row.warnings_json),
	) as ImportWarning[];
	if (proposal.lines.length === 0)
		throw badRequest("The Import Draft has no valid lines to apply.");
	if (warnings.some(({ severity }) => severity === "error")) {
		throw badRequest(
			"Resolve the blocking Import Draft warnings before applying it.",
		);
	}
	const plan = validatedApplicationPlan(row.id, proposal);
	const now = Date.now();
	const statements: D1PreparedStatement[] = [
		input.database
			.prepare(
				`insert into items (
					id, workspace_id, collection_id, title, description, requirements,
					priority, status, quantity_needed, group_label, budget_minor,
					budget_currency, deadline_at, created_by_user_id, created_at, updated_at
				)
				select
					json_extract(value, '$.id'), d.workspace_id, d.collection_id,
					json_extract(value, '$.title'), json_extract(value, '$.description'),
					json_extract(value, '$.requirements'), json_extract(value, '$.priority'),
					'idea', json_extract(value, '$.quantityNeeded'),
					json_extract(value, '$.groupLabel'), null, null, null, ?3, ?4, ?4
				from json_each(?1), import_drafts d
				where ${activeDraftGate()}`,
			)
			.bind(JSON.stringify(plan.items), row.id, input.userId, now),
		input.database
			.prepare(
				`insert into products (
					id, workspace_id, title, brand, model, category, attributes_json,
					created_by_user_id, created_at, updated_at
				)
				select
					json_extract(value, '$.id'), d.workspace_id, json_extract(value, '$.title'),
					json_extract(value, '$.brand'), json_extract(value, '$.model'),
					json_extract(value, '$.category'), json_extract(value, '$.attributes'),
					?3, ?4, ?4
				from json_each(?1), import_drafts d
				where ${activeDraftGate()}`,
			)
			.bind(JSON.stringify(plan.products), row.id, input.userId, now),
		input.database
			.prepare(
				`insert into item_candidates (
					id, workspace_id, item_id, product_id, planned_purchase_quantity,
					notes, rank, created_by_user_id, created_at, updated_at
				)
				select
					json_extract(value, '$.id'), d.workspace_id,
					json_extract(value, '$.itemId'), json_extract(value, '$.productId'),
					json_extract(value, '$.plannedPurchaseQuantity'), json_extract(value, '$.notes'),
					null, ?3, ?4, ?4
				from json_each(?1), import_drafts d
				where ${activeDraftGate()}`,
			)
			.bind(JSON.stringify(plan.candidates), row.id, input.userId, now),
		input.database
			.prepare(
				`insert into merchants (
					id, workspace_id, name, sales_channel, website_url, notes,
					created_by_user_id, created_at, updated_at
				)
				select
					json_extract(value, '$.desiredId'), d.workspace_id,
					json_extract(value, '$.name'), json_extract(value, '$.salesChannel'),
					json_extract(value, '$.websiteUrl'), json_extract(value, '$.notes'),
					?3, ?4, ?4
				from json_each(?1), import_drafts d
				where ${activeDraftGate()}
				on conflict(workspace_id, name) where archived_at is null do nothing`,
			)
			.bind(JSON.stringify(plan.merchants), row.id, input.userId, now),
		input.database
			.prepare(
				`insert into offers (
					id, workspace_id, product_id, merchant_id, source_url, price_kind,
					unit_price_minor, currency, shipping_minor, shipping_basis,
					availability_state, availability_channel, availability_location,
					availability_variant, availability_note, locale, last_checked_at,
					created_by_user_id, created_at, updated_at
				)
				select
					json_extract(value, '$.id'), d.workspace_id,
					json_extract(value, '$.productId'), m.id, json_extract(value, '$.sourceUrl'),
					json_extract(value, '$.priceKind'), json_extract(value, '$.unitPriceMinor'),
					json_extract(value, '$.currency'), json_extract(value, '$.shippingMinor'),
					json_extract(value, '$.shippingBasis'), json_extract(value, '$.availabilityState'),
					json_extract(value, '$.availabilityChannel'), json_extract(value, '$.availabilityLocation'),
					json_extract(value, '$.availabilityVariant'), json_extract(value, '$.availabilityNote'),
					json_extract(value, '$.locale'), coalesce(json_extract(value, '$.observedAt'), ?4),
					?3, ?4, ?4
				from json_each(?1), import_drafts d
				join merchants m on m.workspace_id = d.workspace_id
					and m.name = json_extract(value, '$.merchantName') and m.archived_at is null
				where ${activeDraftGate()}`,
			)
			.bind(JSON.stringify(plan.offers), row.id, input.userId, now),
		input.database
			.prepare(
				`insert into price_checks (
					id, offer_id, price_kind, unit_price_minor, currency, shipping_minor,
					shipping_basis, availability_state, availability_channel,
					availability_location, availability_variant, availability_note,
					observed_at, observed_by_user_id, created_at
				)
				select
					json_extract(value, '$.id'), json_extract(value, '$.offerId'),
					json_extract(value, '$.priceKind'), json_extract(value, '$.unitPriceMinor'),
					json_extract(value, '$.currency'), json_extract(value, '$.shippingMinor'),
					json_extract(value, '$.shippingBasis'), json_extract(value, '$.availabilityState'),
					json_extract(value, '$.availabilityChannel'), json_extract(value, '$.availabilityLocation'),
					json_extract(value, '$.availabilityVariant'), json_extract(value, '$.availabilityNote'),
					coalesce(json_extract(value, '$.observedAt'), ?4), ?3, ?4
				from json_each(?1), import_drafts d
				where ${activeDraftGate()}`,
			)
			.bind(JSON.stringify(plan.priceChecks), row.id, input.userId, now),
		input.database
			.prepare(
				`insert into import_draft_applications (
					draft_id, workspace_id, collection_id, proposal_key,
					record_type, record_id, action, created_at
				)
				select
					d.id, d.workspace_id, d.collection_id, json_extract(value, '$.proposalKey'),
					json_extract(value, '$.recordType'), json_extract(value, '$.recordId'),
					json_extract(value, '$.action'), ?3
				from json_each(?1), import_drafts d
				where ${activeDraftGate()}`,
			)
			.bind(JSON.stringify(plan.mappings), row.id, now),
		input.database
			.prepare(
				`insert into import_draft_applications (
					draft_id, workspace_id, collection_id, proposal_key,
					record_type, record_id, action, created_at
				)
				select
					d.id, d.workspace_id, d.collection_id, json_extract(value, '$.lineKey'),
					'merchant', m.id,
					case when m.id = json_extract(value, '$.desiredId') then 'created' else 'reused' end,
					?3
				from json_each(?1), import_drafts d
				join merchants m on m.workspace_id = d.workspace_id
					and m.name = json_extract(value, '$.merchantName') and m.archived_at is null
				where ${activeDraftGate()}`,
			)
			.bind(JSON.stringify(plan.merchantMappings), row.id, now),
		input.database
			.prepare(
				`update import_drafts
				set status = 'applied', raw_input = null, applied_by_user_id = ?1,
					applied_at = ?2, updated_at = ?2
				where id = ?3 and collection_id = ?4 and status = 'draft'`,
			)
			.bind(input.userId, now, row.id, collection.id),
	];

	try {
		await input.database.batch(statements);
	} catch (error) {
		if (
			error instanceof Error &&
			/constraint|unique|foreign key/iu.test(error.message)
		) {
			throw conflict(
				"The Import Draft could not be applied because its planning records conflict with current data.",
			);
		}
		throw error;
	}
	return readImportDraft(input);
}

export async function discardImportDraft(input: {
	collectionId: string;
	database: D1Database;
	draftId: string;
	userId: string;
}): Promise<ImportDraftResource> {
	const { access, collection } = await importAccess(input);
	requireCapability(access, "research_manage");
	requireMutableCollection(collection);
	const row = await draftRow(input.database, collection.id, input.draftId);
	if (row === null) throw notFound();
	if (row.status === "discarded") return readImportDraft(input);
	if (row.status === "applied")
		throw conflict("An applied Import Draft cannot be discarded.");
	const now = Date.now();
	await input.database
		.prepare(
			`update import_drafts
			set status = 'discarded', raw_input = null, discarded_by_user_id = ?1,
				discarded_at = ?2, updated_at = ?2
			where id = ?3 and collection_id = ?4 and status = 'draft'`,
		)
		.bind(input.userId, now, row.id, collection.id)
		.run();
	return readImportDraft(input);
}
