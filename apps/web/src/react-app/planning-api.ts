import {
	apiErrorResponseSchema,
	collectionRollupResponseSchema,
  collectionBriefResponseSchema,
	collectionListResponseSchema,
	collectionResponseSchema,
	conceptResponseSchema,
	itemListResponseSchema,
	itemComparisonResponseSchema,
	itemResponseSchema,
	itemStatusChangeResponseSchema,
	itemWorkflowResponseSchema,
	workspaceListResponseSchema,
	workspaceResponseSchema,
	type ApiErrorCode,
	type CandidateCreateInput,
	type CandidateUpdateInput,
	type CollectionRollupResponse,
	type CollectionCreateInput,
  type CollectionBriefInput,
  type CollectionBriefResource,
	type CollectionResource,
	type CollectionUpdateInput,
  type ConceptInput,
  type ConceptResource,
	type ItemCreateInput,
	type ItemComparisonResponse,
	type ItemPermissions,
	type ItemResource,
	type ItemStatusChangeInput,
	type ItemStatusDecisionEvent,
	type ItemUpdateInput,
	type MerchantInput,
	type OfferInput,
	type PlannedSelectionInput,
	type PriceCheckInput,
	type ProductUpdateInput,
	type PurchaseRecordInput,
	type DecisionEventResource,
	type WorkspaceCreateInput,
	type WorkspaceResource,
	type WorkspaceSummary,
	type WorkspaceUpdateInput,
} from "@kharidyar/contracts";
import { hc } from "hono/client";

import type { AppType } from "../worker";

interface RuntimeSchema<T> {
	parse: (value: unknown) => T;
}

export class PlanningApiError extends Error {
	readonly code: ApiErrorCode;
	readonly status: number;

	constructor(code: ApiErrorCode, message: string, status: number) {
		super(message);
		this.name = "PlanningApiError";
		this.code = code;
		this.status = status;
	}
}

const client = hc<AppType>("/api", {
	init: { credentials: "same-origin" },
});

async function parsedResponse<T>(
	response: Response,
	schema: RuntimeSchema<T>,
): Promise<T> {
	const body: unknown = await response.json().catch(() => null);

	if (!response.ok) {
		const error = apiErrorResponseSchema.safeParse(body);
		if (error.success) {
			throw new PlanningApiError(
				error.data.error.code,
				error.data.error.message,
				response.status,
			);
		}

		throw new PlanningApiError(
			"INTERNAL_ERROR",
			"The server returned an unreadable response.",
			response.status,
		);
	}

	return schema.parse(body);
}

async function commerceRequest<T>(
	path: string,
	method: "GET" | "PATCH" | "POST" | "PUT",
	schema: RuntimeSchema<T>,
	value?: unknown,
): Promise<T> {
	const response = await fetch(`/api${path}`, {
		body: value === undefined ? undefined : JSON.stringify(value),
		credentials: "same-origin",
		headers:
			value === undefined ? undefined : { "content-type": "application/json" },
		method,
	});
	return parsedResponse(response, schema);
}

export interface PlanningApi {
	archiveCollection: (collectionId: string) => Promise<CollectionResource>;
	archiveItem: (itemId: string) => Promise<ItemResource>;
	archiveWorkspace: (workspaceId: string) => Promise<WorkspaceResource>;
	createCollection: (
		workspaceId: string,
		value: CollectionCreateInput,
	) => Promise<CollectionResource>;
	createItem: (
		collectionId: string,
		value: ItemCreateInput,
	) => Promise<ItemResource>;
	createWorkspace: (value: WorkspaceCreateInput) => Promise<WorkspaceResource>;
	createCandidate: (
		itemId: string,
		value: CandidateCreateInput,
	) => Promise<ItemComparisonResponse>;
	createMerchant: (
		itemId: string,
		value: MerchantInput,
	) => Promise<ItemComparisonResponse>;
	createOffer: (
		itemId: string,
		candidateId: string,
		value: OfferInput,
	) => Promise<ItemComparisonResponse>;
  readCollectionBrief: (
    collectionId: string,
  ) => Promise<EditableResource<CollectionBriefResource>>;
  readConcept: (
    collectionId: string,
  ) => Promise<EditableResource<ConceptResource>>;
	listCollections: (workspaceId: string) => Promise<CollectionResource[]>;
	listItems: (collectionId: string) => Promise<ItemListResult>;
	listWorkspaces: () => Promise<WorkspaceSummary[]>;
	restoreCollection: (collectionId: string) => Promise<CollectionResource>;
	restoreItem: (itemId: string) => Promise<ItemResource>;
	restoreWorkspace: (workspaceId: string) => Promise<WorkspaceResource>;
	readItemWorkflow: (itemId: string) => Promise<ItemWorkflowResult>;
	readItemComparison: (itemId: string) => Promise<ItemComparisonResponse>;
	readCollectionRollup: (
		collectionId: string,
	) => Promise<CollectionRollupResponse>;
	archiveCandidate: (
		itemId: string,
		candidateId: string,
	) => Promise<ItemComparisonResponse>;
	restoreCandidate: (
		itemId: string,
		candidateId: string,
	) => Promise<ItemComparisonResponse>;
	changePlannedSelection: (
		itemId: string,
		value: PlannedSelectionInput,
	) => Promise<ItemComparisonResponse>;
	recordPriceCheck: (
		itemId: string,
		candidateId: string,
		offerId: string,
		value: PriceCheckInput,
	) => Promise<ItemComparisonResponse>;
	recordPurchase: (
		itemId: string,
		value: PurchaseRecordInput,
	) => Promise<ItemComparisonResponse>;
  removeConcept: (
    collectionId: string,
  ) => Promise<EditableResource<ConceptResource>>;
  saveCollectionBrief: (
    collectionId: string,
    value: CollectionBriefInput,
  ) => Promise<EditableResource<CollectionBriefResource>>;
  saveConcept: (
    collectionId: string,
    value: ConceptInput,
  ) => Promise<EditableResource<ConceptResource>>;
	updateCollection: (
		collectionId: string,
		value: CollectionUpdateInput,
	) => Promise<CollectionResource>;
	updateItem: (
		itemId: string,
		value: ItemUpdateInput,
	) => Promise<ItemResource>;
	updateCandidate: (
		itemId: string,
		candidateId: string,
		value: CandidateUpdateInput,
	) => Promise<ItemComparisonResponse>;
	updateCandidateProduct: (
		itemId: string,
		candidateId: string,
		value: ProductUpdateInput,
	) => Promise<ItemComparisonResponse>;
	updateOffer: (
		itemId: string,
		candidateId: string,
		offerId: string,
		value: OfferInput,
	) => Promise<ItemComparisonResponse>;
	changeItemStatus: (
		itemId: string,
		value: ItemStatusChangeInput,
	) => Promise<{ item: ItemResource; event: ItemStatusDecisionEvent }>;
	updateWorkspace: (
		workspaceId: string,
		value: WorkspaceUpdateInput,
	) => Promise<WorkspaceResource>;
}

export interface ItemListResult {
	items: ItemResource[];
	permissions: ItemPermissions;
}

export interface ItemWorkflowResult {
	item: ItemResource;
	events: DecisionEventResource[];
	permissions: ItemPermissions;
}

export interface EditableResource<T> {
  canEdit: boolean;
  resource: T | null;
}

export const planningApi: PlanningApi = {
	async readItemComparison(itemId) {
		return commerceRequest(
			`/items/${encodeURIComponent(itemId)}/comparison`,
			"GET",
			itemComparisonResponseSchema,
		);
	},

	async readCollectionRollup(collectionId) {
		return commerceRequest(
			`/collections/${encodeURIComponent(collectionId)}/planned-cost`,
			"GET",
			collectionRollupResponseSchema,
		);
	},

	async createCandidate(itemId, value) {
		return commerceRequest(
			`/items/${encodeURIComponent(itemId)}/candidates`,
			"POST",
			itemComparisonResponseSchema,
			value,
		);
	},

	async updateCandidate(itemId, candidateId, value) {
		return commerceRequest(
			`/items/${encodeURIComponent(itemId)}/candidates/${encodeURIComponent(candidateId)}`,
			"PATCH",
			itemComparisonResponseSchema,
			value,
		);
	},

	async archiveCandidate(itemId, candidateId) {
		return commerceRequest(
			`/items/${encodeURIComponent(itemId)}/candidates/${encodeURIComponent(candidateId)}/archive`,
			"POST",
			itemComparisonResponseSchema,
		);
	},

	async restoreCandidate(itemId, candidateId) {
		return commerceRequest(
			`/items/${encodeURIComponent(itemId)}/candidates/${encodeURIComponent(candidateId)}/restore`,
			"POST",
			itemComparisonResponseSchema,
		);
	},

	async updateCandidateProduct(itemId, candidateId, value) {
		return commerceRequest(
			`/items/${encodeURIComponent(itemId)}/candidates/${encodeURIComponent(candidateId)}/product`,
			"PATCH",
			itemComparisonResponseSchema,
			value,
		);
	},

	async createMerchant(itemId, value) {
		return commerceRequest(
			`/items/${encodeURIComponent(itemId)}/merchants`,
			"POST",
			itemComparisonResponseSchema,
			value,
		);
	},

	async createOffer(itemId, candidateId, value) {
		return commerceRequest(
			`/items/${encodeURIComponent(itemId)}/candidates/${encodeURIComponent(candidateId)}/offers`,
			"POST",
			itemComparisonResponseSchema,
			value,
		);
	},

	async updateOffer(itemId, candidateId, offerId, value) {
		return commerceRequest(
			`/items/${encodeURIComponent(itemId)}/candidates/${encodeURIComponent(candidateId)}/offers/${encodeURIComponent(offerId)}`,
			"PUT",
			itemComparisonResponseSchema,
			value,
		);
	},

	async recordPriceCheck(itemId, candidateId, offerId, value) {
		return commerceRequest(
			`/items/${encodeURIComponent(itemId)}/candidates/${encodeURIComponent(candidateId)}/offers/${encodeURIComponent(offerId)}/price-checks`,
			"POST",
			itemComparisonResponseSchema,
			value,
		);
	},

	async changePlannedSelection(itemId, value) {
		return commerceRequest(
			`/items/${encodeURIComponent(itemId)}/plan`,
			"PUT",
			itemComparisonResponseSchema,
			value,
		);
	},

	async recordPurchase(itemId, value) {
		return commerceRequest(
			`/items/${encodeURIComponent(itemId)}/purchases`,
			"POST",
			itemComparisonResponseSchema,
			value,
		);
	},

	async listWorkspaces() {
		const response = await client.workspaces.$get({
			query: { includeArchived: "true" },
		});
		return (await parsedResponse(response, workspaceListResponseSchema)).workspaces;
	},

	async createWorkspace(value) {
		const response = await client.workspaces.$post({ json: value });
		return (await parsedResponse(response, workspaceResponseSchema)).workspace;
	},

	async updateWorkspace(workspaceId, value) {
		const response = await client.workspaces[":workspaceId"].$patch({
			json: value,
			param: { workspaceId },
		});
		return (await parsedResponse(response, workspaceResponseSchema)).workspace;
	},

	async archiveWorkspace(workspaceId) {
		const response = await client.workspaces[":workspaceId"].archive.$post({
			param: { workspaceId },
		});
		return (await parsedResponse(response, workspaceResponseSchema)).workspace;
	},

	async restoreWorkspace(workspaceId) {
		const response = await client.workspaces[":workspaceId"].restore.$post({
			param: { workspaceId },
		});
		return (await parsedResponse(response, workspaceResponseSchema)).workspace;
	},

	async listCollections(workspaceId) {
		const response = await client.workspaces[":workspaceId"].collections.$get({
			param: { workspaceId },
			query: { includeArchived: "true" },
		});
		return (await parsedResponse(response, collectionListResponseSchema))
			.collections;
	},

	async createCollection(workspaceId, value) {
		const response = await client.workspaces[":workspaceId"].collections.$post({
			json: value,
			param: { workspaceId },
		});
		return (await parsedResponse(response, collectionResponseSchema)).collection;
	},

	async updateCollection(collectionId, value) {
		const response = await client.collections[":collectionId"].$patch({
			json: value,
			param: { collectionId },
		});
		return (await parsedResponse(response, collectionResponseSchema)).collection;
	},

	async archiveCollection(collectionId) {
		const response = await client.collections[":collectionId"].archive.$post({
			param: { collectionId },
		});
		return (await parsedResponse(response, collectionResponseSchema)).collection;
	},

	async restoreCollection(collectionId) {
		const response = await client.collections[":collectionId"].restore.$post({
			param: { collectionId },
		});
		return (await parsedResponse(response, collectionResponseSchema)).collection;
  },

  async readCollectionBrief(collectionId) {
    const response = await client.collections[":collectionId"].brief.$get({
      param: { collectionId },
    });
    const body = await parsedResponse(response, collectionBriefResponseSchema);
    return { canEdit: body.permissions.canEdit, resource: body.brief };
  },

  async saveCollectionBrief(collectionId, value) {
    const response = await client.collections[":collectionId"].brief.$put({
      json: value,
      param: { collectionId },
    });
    const body = await parsedResponse(response, collectionBriefResponseSchema);
    return { canEdit: body.permissions.canEdit, resource: body.brief };
  },

  async readConcept(collectionId) {
    const response = await client.collections[":collectionId"].concept.$get({
      param: { collectionId },
    });
    const body = await parsedResponse(response, conceptResponseSchema);
    return { canEdit: body.permissions.canEdit, resource: body.concept };
  },

  async saveConcept(collectionId, value) {
    const response = await client.collections[":collectionId"].concept.$put({
      json: value,
      param: { collectionId },
    });
    const body = await parsedResponse(response, conceptResponseSchema);
    return { canEdit: body.permissions.canEdit, resource: body.concept };
  },

  async removeConcept(collectionId) {
    const response = await client.collections[":collectionId"].concept.$delete({
      param: { collectionId },
    });
    const body = await parsedResponse(response, conceptResponseSchema);
    return { canEdit: body.permissions.canEdit, resource: body.concept };
	},

	async listItems(collectionId) {
		const response = await client.collections[":collectionId"].items.$get({
			param: { collectionId },
			query: { includeArchived: "true", limit: "100", offset: "0" },
		});
		const body = await parsedResponse(response, itemListResponseSchema);
		return { items: body.items, permissions: body.permissions };
	},

	async readItemWorkflow(itemId) {
		const response = await client.items[":itemId"].workflow.$get({
			param: { itemId },
		});
		return parsedResponse(response, itemWorkflowResponseSchema);
	},

	async changeItemStatus(itemId, value) {
		const response = await client.items[":itemId"].status.$post({
			json: value,
			param: { itemId },
		});
		return parsedResponse(response, itemStatusChangeResponseSchema);
	},

	async createItem(collectionId, value) {
		const response = await client.collections[":collectionId"].items.$post({
			json: value,
			param: { collectionId },
		});
		return (await parsedResponse(response, itemResponseSchema)).item;
	},

	async updateItem(itemId, value) {
		const response = await client.items[":itemId"].$patch({
			json: value,
			param: { itemId },
		});
		return (await parsedResponse(response, itemResponseSchema)).item;
	},

	async archiveItem(itemId) {
		const response = await client.items[":itemId"].archive.$post({
			param: { itemId },
		});
		return (await parsedResponse(response, itemResponseSchema)).item;
	},

	async restoreItem(itemId) {
		const response = await client.items[":itemId"].restore.$post({
			param: { itemId },
		});
		return (await parsedResponse(response, itemResponseSchema)).item;
	},
};
