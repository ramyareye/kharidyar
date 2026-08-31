import {
	apiErrorResponseSchema,
	collectionListResponseSchema,
	collectionResponseSchema,
	itemListResponseSchema,
	itemResponseSchema,
	workspaceListResponseSchema,
	workspaceResponseSchema,
	type ApiErrorCode,
	type CollectionCreateInput,
	type CollectionResource,
	type CollectionUpdateInput,
	type ItemCreateInput,
	type ItemResource,
	type ItemUpdateInput,
	type WorkspaceCreateInput,
	type WorkspaceResource,
	type WorkspaceSummary,
	type WorkspaceUpdateInput,
} from "@kharidyar/contracts";
import { hc } from "hono/client";

import type { CoreWorkspaceRoutes } from "../worker/core-workspace-routes";

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

const client = hc<CoreWorkspaceRoutes>("/api", {
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
	listCollections: (workspaceId: string) => Promise<CollectionResource[]>;
	listItems: (collectionId: string) => Promise<ItemResource[]>;
	listWorkspaces: () => Promise<WorkspaceSummary[]>;
	restoreCollection: (collectionId: string) => Promise<CollectionResource>;
	restoreItem: (itemId: string) => Promise<ItemResource>;
	restoreWorkspace: (workspaceId: string) => Promise<WorkspaceResource>;
	updateCollection: (
		collectionId: string,
		value: CollectionUpdateInput,
	) => Promise<CollectionResource>;
	updateItem: (
		itemId: string,
		value: ItemUpdateInput,
	) => Promise<ItemResource>;
	updateWorkspace: (
		workspaceId: string,
		value: WorkspaceUpdateInput,
	) => Promise<WorkspaceResource>;
}

export const planningApi: PlanningApi = {
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

	async listItems(collectionId) {
		const response = await client.collections[":collectionId"].items.$get({
			param: { collectionId },
			query: { includeArchived: "true", limit: "100", offset: "0" },
		});
		return (await parsedResponse(response, itemListResponseSchema)).items;
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
