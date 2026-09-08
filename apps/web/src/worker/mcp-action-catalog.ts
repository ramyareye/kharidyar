import { prepareVisualRun, visualSelection } from "./visual-service";
import * as c from "@kharidyar/contracts";
import { z } from "zod";
import * as core from "./core-workspace-service";
import * as direction from "./collection-direction-service";
import * as commerce from "./commerce-service";
import * as discussion from "./collaboration-experience-service";
import * as research from "./research-service";
import * as imports from "./import-draft-service";
import * as floorPlans from "./floor-plan-service";
import * as media from "./concept-media-service";
import { prepareLocalRun } from "./local-codex-jobs";
import { changeItemStatus } from "./item-workflow-service";
import { collaborationRoutes } from "./collaboration-routes";
import { forbidden, conflict } from "./api-errors";
import type { McpActor } from "./mcp-auth-service";

export const mcpIdentifier = z
	.string()
	.trim()
	.min(1)
	.max(200)
	.regex(/^[A-Za-z0-9_-]+$/);
export interface ActionContext {
	env: Env;
	actor: McpActor;
	// Only the authenticated review route supplies this. Never stored or returned.
	approvalHeaders?: Headers;
}
type Scope = "workspace" | "collection" | "item" | "account";
const workspace = { workspaceId: mcpIdentifier };
const collection = { collectionId: mcpIdentifier };
const item = { itemId: mcpIdentifier };
const candidate = { ...item, candidateId: mcpIdentifier };
const offer = { ...candidate, offerId: mcpIdentifier };
const comment = { ...item, commentId: mcpIdentifier };
const draft = { ...collection, draftId: mcpIdentifier };
const common = (ctx: ActionContext) => ({
	database: ctx.env.DB,
	userId: ctx.actor.userId,
});
const researchCommon = (ctx: ActionContext) => ({
	...common(ctx),
	rateLimitSecret: ctx.env.BETTER_AUTH_SECRET,
	workflow: ctx.env.RESEARCH_WORKFLOW,
});
const mediaCommon = (ctx: ActionContext) => ({
	...common(ctx),
	bucket: ctx.env.CONCEPT_MEDIA,
	limits: media.conceptMediaLimits(ctx.env),
});

function action<S extends z.ZodRawShape>(
	name: string,
	title: string,
	shape: S,
	scope: Scope,
	run: (ctx: ActionContext, args: z.output<z.ZodObject<S>>) => Promise<unknown>,
	confirm: boolean | ((args: z.output<z.ZodObject<S>>) => boolean) = false,
) {
	const schema = z.object(shape).strict();
	return {
		name,
		title,
		scope,
		schema,
		destructive:
			name !== "prepare_visual_edit" &&
			!name.startsWith("create_") &&
			!name.startsWith("restore_"),
		description: `${title}. ${confirm || name === "update_concept_image" ? "May require the user's confirmation in WantKit; return the approval link and wait for its receipt." : "Applies immediately using the account's current permissions."} Reuse the same operationId when retrying; never retry an uncertain result with a new ID.`,
		parse: (args: unknown): Record<string, unknown> => schema.parse(args),
		requiresConfirmation: (args: unknown) =>
			typeof confirm === "boolean" ? confirm : confirm(schema.parse(args)),
		run: (ctx: ActionContext, args: unknown) => run(ctx, schema.parse(args)),
	};
}

// Sharing already has transactional Owner/last-Owner checks in this router.
// Reuse it with the approving browser's real cookie; no synthetic sessions,
// bearer-to-cookie conversion, external request or authentication bypass.
async function sharing(
	ctx: ActionContext,
	path: string,
	method: string,
	value?: unknown,
) {
	if (!ctx.approvalHeaders)
		throw forbidden("Sharing requires approval in WantKit.");
	const headers = new Headers();
	for (const key of ["cookie", "origin", "cf-connecting-ip"]) {
		const value = ctx.approvalHeaders.get(key);
		if (value) headers.set(key, value);
	}
	headers.set("content-type", "application/json");
	const response = await collaborationRoutes.fetch(
		new Request(`${ctx.env.BETTER_AUTH_URL}${path}`, {
			method,
			headers,
			body: value === undefined ? undefined : JSON.stringify(value),
		}),
		ctx.env,
	);
	if (!response.ok)
		throw conflict(
			"Sharing was not applied. Check your current access and the target in WantKit before retrying.",
		);
	return response.json();
}

export const mcpActionCatalog = [
	action(
		"prepare_visual_edit",
		"Approve selected private images and prompt for ChatGPT",
		{ ...collection, value: c.visualSelectionSchema },
		"collection",
		(ctx, a) => prepareVisualRun(ctx, a.collectionId, a.value),
		true,
	),
	action(
		"create_workspace",
		"Create a workspace",
		{ value: c.workspaceCreateInputSchema },
		"account",
		(ctx, a) =>
			core.createWorkspace({
				database: ctx.env.DB,
				actorUserId: ctx.actor.userId,
				...a,
			}),
	),
	action(
		"update_workspace",
		"Edit a workspace",
		{ ...workspace, value: c.workspaceUpdateInputSchema },
		"workspace",
		(ctx, a) => core.updateWorkspace({ ...common(ctx), ...a }),
	),
	action(
		"archive_workspace",
		"Archive a workspace and hide its collections",
		workspace,
		"workspace",
		(ctx, a) =>
			core.setWorkspaceArchived({ ...common(ctx), ...a, archived: true }),
		true,
	),
	action(
		"restore_workspace",
		"Restore an archived workspace",
		workspace,
		"workspace",
		(ctx, a) =>
			core.setWorkspaceArchived({ ...common(ctx), ...a, archived: false }),
	),
	action(
		"create_collection",
		"Create a collection",
		{ ...workspace, value: c.collectionCreateInputSchema },
		"workspace",
		(ctx, a) => core.createCollection({ ...common(ctx), ...a }),
	),
	action(
		"update_collection",
		"Edit a collection",
		{ ...collection, value: c.collectionUpdateInputSchema },
		"collection",
		(ctx, a) => core.updateCollection({ ...common(ctx), ...a }),
	),
	action(
		"archive_collection",
		"Archive a collection",
		collection,
		"collection",
		(ctx, a) =>
			core.setCollectionArchived({ ...common(ctx), ...a, archived: true }),
		true,
	),
	action(
		"restore_collection",
		"Restore an archived collection",
		collection,
		"collection",
		(ctx, a) =>
			core.setCollectionArchived({ ...common(ctx), ...a, archived: false }),
	),
	action(
		"create_item",
		"Add an item to a collection",
		{ ...collection, value: c.itemCreateInputSchema },
		"collection",
		(ctx, a) => core.createItem({ ...common(ctx), ...a }),
	),
	action(
		"update_item",
		"Edit an item's name, needs, quantity or budget",
		{ ...item, value: c.itemUpdateInputSchema },
		"item",
		(ctx, a) => core.updateItem({ ...common(ctx), ...a }),
	),
	action(
		"archive_item",
		"Archive an item",
		item,
		"item",
		(ctx, a) => core.setItemArchived({ ...common(ctx), ...a, archived: true }),
		true,
	),
	action("restore_item", "Restore an archived item", item, "item", (ctx, a) =>
		core.setItemArchived({ ...common(ctx), ...a, archived: false }),
	),
	action(
		"save_collection_brief",
		"Save the complete collection brief, replacing its previous fields",
		{ ...collection, value: c.collectionBriefInputSchema },
		"collection",
		(ctx, a) => direction.saveCollectionBrief({ ...common(ctx), ...a }),
	),
	action(
		"save_concept",
		"Save the complete concept title and description",
		{ ...collection, value: c.conceptInputSchema },
		"collection",
		(ctx, a) => direction.saveConcept({ ...common(ctx), ...a }),
	),
	action(
		"remove_concept",
		"Remove the concept and permanently delete its images",
		collection,
		"collection",
		async (ctx, a) => {
			const conceptId = await direction.removeConcept({ ...common(ctx), ...a });
			if (conceptId)
				await media.deleteAllConceptMedia({
					...common(ctx),
					bucket: ctx.env.CONCEPT_MEDIA,
					conceptId,
				});
			return { concept: null };
		},
		true,
	),
	action(
		"create_candidate",
		"Add a product candidate to an item",
		{ ...item, value: c.candidateCreateInputSchema },
		"item",
		(ctx, a) => commerce.createCandidate({ ...common(ctx), ...a }),
	),
	action(
		"update_candidate",
		"Edit candidate notes, rank or quantity",
		{ ...candidate, value: c.candidateUpdateInputSchema },
		"item",
		(ctx, a) => commerce.updateCandidate({ ...common(ctx), ...a }),
	),
	action(
		"archive_candidate",
		"Archive a product candidate",
		candidate,
		"item",
		(ctx, a) =>
			commerce.setCandidateArchived({ ...common(ctx), ...a, archived: true }),
		true,
	),
	action(
		"restore_candidate",
		"Restore a product candidate",
		candidate,
		"item",
		(ctx, a) =>
			commerce.setCandidateArchived({ ...common(ctx), ...a, archived: false }),
	),
	action(
		"update_product",
		"Edit a candidate's shared catalog product",
		{ ...candidate, value: c.productUpdateInputSchema },
		"item",
		(ctx, a) => commerce.updateCandidateProduct({ ...common(ctx), ...a }),
	),
	action(
		"create_merchant",
		"Add a merchant",
		{ ...item, value: c.merchantInputSchema },
		"item",
		(ctx, a) => commerce.createMerchant({ ...common(ctx), ...a }),
	),
	action(
		"create_offer",
		"Save a sourced offer with observed facts; never invent price or availability",
		{ ...candidate, value: c.offerInputSchema },
		"item",
		(ctx, a) => commerce.createOffer({ ...common(ctx), ...a }),
	),
	action(
		"update_offer",
		"Update a sourced offer with observed facts",
		{ ...offer, value: c.offerInputSchema },
		"item",
		(ctx, a) => commerce.updateOffer({ ...common(ctx), ...a }),
	),
	action(
		"record_price_check",
		"Record a price observation; this does not fetch or verify a website",
		{ ...offer, value: c.priceCheckInputSchema },
		"item",
		(ctx, a) => commerce.recordPriceCheck({ ...common(ctx), ...a }),
	),
	action(
		"set_planned_selection",
		"Choose or clear the product and offer planned for purchase",
		{ ...item, value: c.plannedSelectionInputSchema },
		"item",
		(ctx, a) => commerce.changePlannedSelection({ ...common(ctx), ...a }),
		true,
	),
	action(
		"record_purchase",
		"Record a purchase already made; this never places an order or transfers money",
		{ ...item, value: c.purchaseRecordInputSchema },
		"item",
		(ctx, a) => commerce.recordPurchase({ ...common(ctx), ...a }),
		true,
	),
	action(
		"change_item_status",
		"Change item progress or decision status",
		{ ...item, value: c.itemStatusChangeInputSchema },
		"item",
		(ctx, a) => changeItemStatus({ ...common(ctx), ...a }),
		(a) => ["decided", "purchased"].includes(a.value.status),
	),
	action(
		"create_comment",
		"Add a discussion comment attributed to this account",
		{
			...item,
			candidateId: mcpIdentifier.optional(),
			value: c.commentInputSchema,
		},
		"item",
		(ctx, a) => discussion.createComment({ ...common(ctx), ...a }),
	),
	action(
		"update_comment",
		"Edit a discussion comment",
		{ ...comment, value: c.commentInputSchema },
		"item",
		(ctx, a) => discussion.updateComment({ ...common(ctx), ...a }),
	),
	action(
		"remove_comment",
		"Remove a discussion comment",
		comment,
		"item",
		(ctx, a) => discussion.removeComment({ ...common(ctx), ...a }),
		true,
	),
	action(
		"resolve_comment",
		"Resolve or reopen a discussion comment",
		{ ...comment, value: c.commentResolutionInputSchema },
		"item",
		(ctx, a) => discussion.resolveComment({ ...common(ctx), ...a }),
	),
	action(
		"set_candidate_vote",
		"Set your preference for a candidate",
		{ ...candidate, selected: z.boolean() },
		"item",
		(ctx, a) => discussion.setCandidateVote({ ...common(ctx), ...a }),
	),
	action(
		"create_import_draft",
		"Parse pasted research into an editable import draft",
		{ ...collection, value: c.importDraftCreateInputSchema },
		"collection",
		(ctx, a) => imports.createImportDraft({ ...common(ctx), ...a }),
	),
	action(
		"correct_import_draft",
		"Correct the complete proposal in an import draft",
		{ ...draft, proposal: c.importProposalSchema },
		"collection",
		(ctx, a) => imports.correctImportDraft({ ...common(ctx), ...a }),
	),
	action(
		"apply_import_draft",
		"Apply a reviewed import draft to create items, candidates and offers",
		draft,
		"collection",
		(ctx, a) => imports.applyImportDraft({ ...common(ctx), ...a }),
	),
	action(
		"discard_import_draft",
		"Discard an import draft and erase its pasted input",
		draft,
		"collection",
		(ctx, a) => imports.discardImportDraft({ ...common(ctx), ...a }),
		true,
	),
	action(
		"start_research",
		"Start research with an explicitly selected provider; shares the query and uses its allowance",
		{
			...collection,
			value: c.researchRequestCreateInputSchema.extend({
				provider: z.enum(["tavily-basic-v1", "local-codex-v1"]),
			}),
		},
		"collection",
		async (ctx, a) => {
			await prepareLocalRun(ctx.env, ctx.actor.userId, a.value);
			return research.createResearchRequest({ ...researchCommon(ctx), ...a });
		},
		true,
	),
	action(
		"cancel_research",
		"Cancel a research run",
		{ ...collection, runId: mcpIdentifier },
		"collection",
		(ctx, a) => research.cancelResearchRun({ ...researchCommon(ctx), ...a }),
	),
	action(
		"promote_research_result",
		"Save a research finding as a candidate or offer",
		{
			...collection,
			resultId: mcpIdentifier,
			value: c.researchResultPromotionInputSchema,
		},
		"collection",
		(ctx, a) => research.promoteResearchResult({ ...common(ctx), ...a }),
	),
	action(
		"moderate_research_result",
		"Dismiss or restore a saved research finding",
		{ ...collection, resultId: mcpIdentifier, dismissed: z.boolean() },
		"collection",
		(ctx, a) => research.moderateResearchResult({ ...common(ctx), ...a }),
		(a) => a.dismissed,
	),
	action(
		"update_concept_image",
		"Edit a saved concept image's caption or cover setting",
		{
			...collection,
			imageId: mcpIdentifier,
			value: c.conceptImageUpdateInputSchema,
		},
		"collection",
		async (ctx, a) => {
			await requireImageInCollection(ctx, a.collectionId, a.imageId);
			return media.updateConceptImage({ ...mediaCommon(ctx), ...a });
		},
	),
	action(
		"reorder_concept_images",
		"Reorder saved reference images",
		{ ...collection, value: c.conceptImageReorderInputSchema },
		"collection",
		(ctx, a) => media.reorderConceptReferences({ ...mediaCommon(ctx), ...a }),
	),
	action(
		"update_floor_plan",
		"Edit a floor plan's title and user-provided measurements or room notes; does not alter its file",
		{ ...collection, planId: mcpIdentifier, value: c.floorPlanDetailsSchema },
		"collection",
		async (ctx, a) => {
			const { id, title, notes, contentType, updatedAt } =
				await floorPlans.updateFloorPlan({ ...common(ctx), ...a });
			return { id, title, notes, contentType, updatedAt };
		},
	),
	action(
		"delete_floor_plan",
		"Delete a saved floor plan and its room notes",
		{ ...collection, planId: mcpIdentifier },
		"collection",
		(ctx, a) =>
			floorPlans.deleteFloorPlan({
				...common(ctx),
				bucket: ctx.env.CONCEPT_MEDIA,
				...a,
			}),
		true,
	),
	action(
		"delete_concept_image",
		"Permanently delete a saved concept image",
		{ ...collection, imageId: mcpIdentifier },
		"collection",
		async (ctx, a) => {
			await requireImageInCollection(ctx, a.collectionId, a.imageId);
			return media.deleteConceptImage({ ...mediaCommon(ctx), ...a });
		},
		true,
	),
	action(
		"create_invitation",
		"Create a sharing link; does not send an email or message",
		{ ...workspace, value: c.invitationCreateInputSchema },
		"workspace",
		(ctx, a) =>
			sharing(ctx, `/workspaces/${a.workspaceId}/invitations`, "POST", a.value),
		true,
	),
	action(
		"revoke_invitation",
		"Revoke an unused sharing invitation",
		{ ...workspace, invitationId: mcpIdentifier },
		"workspace",
		(ctx, a) =>
			sharing(
				ctx,
				`/workspaces/${a.workspaceId}/invitations/${a.invitationId}/revoke`,
				"POST",
			),
		true,
	),
	action(
		"change_workspace_member",
		"Change an existing workspace member's role",
		{
			...workspace,
			memberId: mcpIdentifier,
			role: z.enum(["viewer", "commenter", "contributor", "editor", "owner"]),
		},
		"workspace",
		(ctx, a) =>
			sharing(
				ctx,
				`/workspaces/${a.workspaceId}/members/${a.memberId}`,
				"PATCH",
				{ role: a.role },
			),
		true,
	),
	action(
		"remove_workspace_member",
		"Remove a workspace member's access",
		{ ...workspace, memberId: mcpIdentifier },
		"workspace",
		(ctx, a) =>
			sharing(
				ctx,
				`/workspaces/${a.workspaceId}/members/${a.memberId}`,
				"DELETE",
			),
		true,
	),
	action(
		"change_collection_member",
		"Change an existing collection member's role",
		{
			...collection,
			memberId: mcpIdentifier,
			role: z.enum(["viewer", "commenter", "contributor", "editor", "owner"]),
		},
		"collection",
		(ctx, a) =>
			sharing(
				ctx,
				`/collections/${a.collectionId}/members/${a.memberId}`,
				"PATCH",
				{ role: a.role },
			),
		true,
	),
	action(
		"remove_collection_member",
		"Remove a collection member's access",
		{ ...collection, memberId: mcpIdentifier },
		"collection",
		(ctx, a) =>
			sharing(
				ctx,
				`/collections/${a.collectionId}/members/${a.memberId}`,
				"DELETE",
			),
		true,
	),
];
export type McpAction = (typeof mcpActionCatalog)[number];
export function findMcpAction(name: string): McpAction {
	const found = mcpActionCatalog.find((action) => action.name === name);
	if (!found) throw conflict("This action is not supported.");
	return found;
}
async function requireImageInCollection(
	ctx: ActionContext,
	collectionId: string,
	imageId: string,
) {
	const content = await media.readConceptMedia({
		...mediaCommon(ctx),
		collectionId,
	});
	if (!content.images.some((image) => image.id === imageId)) throw forbidden();
}

export async function actionTarget(
	ctx: ActionContext,
	definition: McpAction,
	args: Record<string, unknown>,
) {
	const base = common(ctx);
	if (definition.scope === "account")
		return {
			name: "Your account",
			version: ctx.actor.userId,
			confirmationRequired: false,
		};
	if (
		definition.name.includes("invitation") ||
		definition.name.endsWith("_member")
	) {
		const collectionId =
			definition.scope === "collection"
				? mcpIdentifier.parse(args.collectionId)
				: null;
		const collectionRow = collectionId
			? await core.readCollection({ ...base, collectionId })
			: null;
		const workspaceId =
			collectionRow?.workspaceId ?? mcpIdentifier.parse(args.workspaceId);
		const access = await discussion.readWorkspaceCollaboration({
			...base,
			workspaceId,
		});
		if (definition.name === "create_invitation") {
			const value = c.invitationCreateInputSchema.parse(args.value);
			if (
				value.scope.type === "workspace"
					? !access.permissions.canInviteWorkspace
					: value.scope.collectionIds.some(
							(id) =>
								!access.permissions.invitableCollections.some(
									(collection) => collection.id === id,
								),
						)
			)
				throw forbidden();
		}
		// The service above also permits collection-only owners to administer their
		// own collections without granting general Workspace access.
		const workspaceName = await ctx.env.DB.prepare(
			"select name from workspaces where id=?",
		)
			.bind(workspaceId)
			.first<string>("name");
		const member = args.memberId
			? access.members.find(
					(member) =>
						member.user.id === args.memberId &&
						(collectionId
							? member.scope.type === "collection" &&
								member.scope.collectionId === collectionId
							: member.scope.type === "workspace"),
				)
			: null;
		const invitation = args.invitationId
			? access.invitations.find(
					(invitation) => invitation.id === args.invitationId,
				)
			: null;
		if ((args.memberId && !member) || (args.invitationId && !invitation))
			throw forbidden();
		const name = [
			collectionRow?.name ?? workspaceName,
			member
				? `${member.user.name} (${member.user.email}), ${member.role}`
				: invitation?.invitedEmail,
		]
			.filter(Boolean)
			.join(" · ");
		return {
			name,
			version: JSON.stringify([member, invitation, access.permissions]),
			confirmationRequired: false,
		};
	}
	if (definition.scope === "workspace") {
		const row = await core.readWorkspace({
			...base,
			workspaceId: mcpIdentifier.parse(args.workspaceId),
		});
		return {
			name: row.name,
			version: JSON.stringify(row),
			confirmationRequired: false,
		};
	}
	if (definition.name === "prepare_visual_edit") {
		const selected = await visualSelection(
			ctx,
			mcpIdentifier.parse(args.collectionId),
			args.value,
		);
		return {
			name: [
				selected.state.name,
				...selected.sources.map((s) => s.label),
				...selected.products.map((p) => p.title),
			].join(" · "),
			version: JSON.stringify(selected),
			confirmationRequired: true,
		};
	}
	if (definition.scope === "collection") {
		const row = await core.readCollection({
			...base,
			collectionId: mcpIdentifier.parse(args.collectionId),
		});
		const extras = definition.name.includes("concept")
			? await direction.readConcept({ ...base, collectionId: row.id })
			: null;
		const images = definition.name.includes("concept")
			? await media.readConceptMedia({
					...mediaCommon(ctx),
					collectionId: row.id,
				})
			: null;
		const plans = definition.name.endsWith("floor_plan")
			? await floorPlans.readFloorPlanContext({ ...base, collectionId: row.id })
			: null;
		const importDraft = args.draftId
			? await imports.readImportDraft({
					...base,
					collectionId: row.id,
					draftId: mcpIdentifier.parse(args.draftId),
				})
			: null;
		const researchDesk =
			definition.name === "moderate_research_result"
				? await research.readResearchDeskContent({
						...base,
						collectionId: row.id,
					})
				: null;
		return {
			name: plans?.find((plan) => plan.id === args.planId)?.title ?? row.name,
			version: JSON.stringify(
				plans
					? [row, extras, images, importDraft, researchDesk, plans]
					: [row, extras, images, importDraft, researchDesk],
			),
			confirmationRequired:
				definition.name === "update_concept_image" &&
				c.conceptImageUpdateInputSchema.parse(args.value).isCover === true &&
				images?.images.some(
					(image) => image.id === args.imageId && image.role === "edited",
				) === true,
		};
	}
	const row = await core.readItem({
		...base,
		itemId: mcpIdentifier.parse(args.itemId),
	});
	const confirmationRequired =
		definition.name === "change_item_status" &&
		["decided", "purchased"].includes(row.status);
	const comparison =
		definition.requiresConfirmation(args) || confirmationRequired
			? await commerce.readItemComparison({ ...base, itemId: row.id })
			: null;
	const comments =
		definition.name === "remove_comment"
			? await discussion.readItemDiscussion({ ...base, itemId: row.id })
			: null;
	const selectedValue = z
		.object({
			candidateId: z.string().nullable().optional(),
			offerId: z.string().nullable().optional(),
		})
		.passthrough()
		.safeParse(args.value);
	const candidateId =
		args.candidateId ??
		(selectedValue.success ? selectedValue.data.candidateId : null);
	const selected = comparison?.candidates.find(
		(candidate) => candidate.id === candidateId,
	);
	const selectedOffer = selected?.offers.find(
		(offer) =>
			offer.id ===
			(args.offerId ??
				(selectedValue.success ? selectedValue.data.offerId : null)),
	);
	const name = [
		row.title,
		selected?.product.title,
		selectedOffer?.merchant.name,
	]
		.filter(Boolean)
		.join(" · ");
	return {
		name,
		version: JSON.stringify([row, comparison, comments]),
		confirmationRequired,
	};
}
