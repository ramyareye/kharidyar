import type {
	ApiErrorCode,
  CollectionRollupResponse,
  CollectionBriefInput,
  CollectionBriefResource,
	CollectionCreateInput,
	CollectionResource,
	DecisionEventResource,
	ItemCreateInput,
	ItemComparisonResponse,
	ItemPermissions,
	ItemResource,
	ItemStatusChangeInput,
  ConceptInput,
  ConceptResource,
	WorkspaceCreateInput,
	WorkspaceResource,
	WorkspaceSummary,
} from "@kharidyar/contracts";
import {
	formatDate,
	formatMoney,
	formatNumber,
	type MessageKey,
} from "@kharidyar/i18n";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { useLocale } from "./locale-context";
import { CollectionDirection } from "./CollectionDirection";
import { ItemWorkflowDialog } from "./ItemWorkflowDialog";
import { ItemComparisonDialog } from "./ItemComparisonDialog";
import { CollectionBriefForm, ConceptForm } from "./collection-direction-forms";
import {
	PlanningApiError,
	planningApi,
	type PlanningApi,
} from "./planning-api";
import {
	CollectionForm,
	ItemForm,
	WorkspaceForm,
} from "./planning-forms";
import {
	resolvePlanningViewState,
	type LoadPhase,
} from "./planning-view-state";
import { BrandMark, LocaleSwitch, UserAvatar } from "./ui";

type EditorState =
  | { kind: "brief-edit" }
	| { kind: "collection-create" }
	| { kind: "collection-edit"; resource: CollectionResource }
	| { kind: "item-create" }
	| { kind: "item-comparison"; resource: ItemResource }
	| { kind: "item-edit"; resource: ItemResource }
	| { kind: "item-workflow"; resource: ItemResource }
  | { kind: "concept-edit" }
	| { kind: "workspace-create" }
	| { kind: "workspace-edit"; resource: WorkspaceSummary };

interface PlanningDashboardProps {
	api?: PlanningApi;
	isSigningOut: boolean;
	onDismissSignOutError: () => void;
	onSignOut: () => Promise<void>;
	signOutError: boolean;
	user: { email: string; image?: null | string; name: string };
}

const priorityMessage: Record<ItemResource["priority"], MessageKey> = {
	essential: "priority.essential",
	nice_to_have: "priority.nice_to_have",
	soon: "priority.soon",
};

const statusMessage: Record<ItemResource["status"], MessageKey> = {
	comparing: "status.comparing",
	decided: "status.decided",
	idea: "status.idea",
	purchased: "status.purchased",
	researching: "status.researching",
	skipped: "status.skipped",
};

const noItemPermissions: ItemPermissions = {
	canCreate: false,
	canEdit: false,
	canArchive: false,
	canChangeNonPurchaseStatus: false,
	canMarkPurchased: false,
};

function selectionFromLocation(key: "collection" | "workspace"): null | string {
	return new URLSearchParams(window.location.search).get(key);
}

function writeSelectionToLocation(
	workspaceId: null | string,
	collectionId: null | string,
): void {
	const url = new URL(window.location.href);
	if (workspaceId) {
		url.searchParams.set("workspace", workspaceId);
	} else {
		url.searchParams.delete("workspace");
	}
	if (collectionId) {
		url.searchParams.set("collection", collectionId);
	} else {
		url.searchParams.delete("collection");
	}
	url.searchParams.delete("error");
	window.history.replaceState(null, "", url);
}

function asWorkspaceSummary(workspace: WorkspaceResource): WorkspaceSummary {
	return {
		accessScope: "workspace",
		archivedAt: workspace.archivedAt,
		id: workspace.id,
		name: workspace.name,
	};
}

function replaceResource<T extends { id: string }>(
	resources: T[],
	resource: T,
): T[] {
	return resources.map((current) =>
		current.id === resource.id ? resource : current,
	);
}

function apiErrorCode(error: unknown): ApiErrorCode {
	return error instanceof PlanningApiError ? error.code : "INTERNAL_ERROR";
}

function InlineIcon({ children }: { children: ReactNode }) {
	return (
		<span className="inline-icon" aria-hidden="true">
			{children}
		</span>
	);
}

function EmptyPanel({
	action,
	body,
	eyebrow,
	onAction,
	title,
}: {
	action?: string;
	body: string;
	eyebrow: string;
	onAction?: () => void;
	title: string;
}) {
	return (
		<section className="folio-empty">
			<div className="folio-empty__index" aria-hidden="true">
				01
			</div>
			<div className="folio-empty__copy">
				<p className="eyebrow">{eyebrow}</p>
				<h2>{title}</h2>
				<p>{body}</p>
				{action && onAction ? (
					<button
						type="button"
						className="button button--primary"
						onClick={onAction}
					>
						{action}
						<span aria-hidden="true">↗</span>
					</button>
				) : null}
			</div>
			<div className="folio-empty__stamp" aria-hidden="true">
				<span>PRIVATE</span>
				<span>BY DEFAULT</span>
			</div>
		</section>
	);
}

function StatusPanel({
	body,
	eyebrow,
	onRetry,
	retryLabel,
	title,
}: {
	body: string;
	eyebrow: string;
	onRetry?: () => void;
	retryLabel?: string;
	title: string;
}) {
	return (
		<section className="status-panel" role={onRetry ? "alert" : "status"}>
			<div className="status-panel__glyph" aria-hidden="true">
				<span />
				<span />
				<span />
			</div>
			<div>
				<p className="eyebrow">{eyebrow}</p>
				<h2>{title}</h2>
				<p>{body}</p>
				{onRetry && retryLabel ? (
					<button type="button" className="button button--secondary" onClick={onRetry}>
						{retryLabel}
					</button>
				) : null}
			</div>
		</section>
	);
}

function ResourceActions({
	archived,
	busy,
	canArchive = true,
	canEdit = true,
	onArchive,
	onCompare,
	onEdit,
	onOpen,
	onRestore,
	resourceName,
}: {
	archived: boolean;
	busy: boolean;
	canArchive?: boolean;
	canEdit?: boolean;
	onArchive: () => void;
	onCompare?: () => void;
	onEdit: () => void;
	onOpen?: () => void;
	onRestore: () => void;
	resourceName: string;
}) {
	const { t } = useLocale();

	return (
		<div className="resource-actions">
		{onCompare ? (
			<button
				type="button"
				className="text-action"
				onClick={onCompare}
				disabled={busy}
				aria-label={t("commerce.open") + `: ${resourceName}`}
			>
				{t("commerce.open")}
			</button>
		) : null}
			{onOpen ? (
				<button
					type="button"
					className="text-action"
					onClick={onOpen}
					disabled={busy}
					aria-label={t("item.open") + `: ${resourceName}`}
				>
					{t("item.open")}
				</button>
			) : null}
			{archived ? (
				canArchive ? (
					<button
						type="button"
						className="text-action"
						onClick={onRestore}
						disabled={busy}
						aria-label={t("common.restoreNamed", { name: resourceName })}
					>
						{t("common.restore")}
					</button>
				) : null
			) : (
				<>
					{canEdit ? (
						<button
							type="button"
							className="text-action"
							onClick={onEdit}
							disabled={busy}
							aria-label={t("common.editNamed", { name: resourceName })}
						>
							{t("common.edit")}
						</button>
					) : null}
					{canArchive ? (
						<button
							type="button"
							className="text-action text-action--danger"
							onClick={onArchive}
							disabled={busy}
							aria-label={t("common.archiveNamed", { name: resourceName })}
						>
							{t("common.archive")}
						</button>
					) : null}
				</>
			)}
		</div>
	);
}

function CollectionCostSummary({
	rollup,
}: {
	rollup: CollectionRollupResponse;
}) {
	const { locale, t } = useLocale();
	const statusLabel =
		rollup.summary.status === "exact"
			? t("rollup.exact")
			: rollup.summary.status === "lower_bound"
				? t("rollup.lowerBound")
				: t("rollup.incomplete");
	const budgetMessage =
		rollup.budgetComparison?.differenceMinor === null ||
		rollup.budgetComparison === null
			? rollup.budgetComparison?.status === "incomplete"
				? t("rollup.budgetIncomplete")
				: null
			: rollup.budgetComparison.status === "over_budget"
				? t("rollup.overBudget", {
						amount: formatMoney(
							locale,
							rollup.budgetComparison.differenceMinor,
							rollup.summary.currency,
						),
					})
				: t("rollup.withinBudget", {
						amount: formatMoney(
							locale,
							rollup.budgetComparison.differenceMinor,
							rollup.summary.currency,
						),
					});
	const attentionLines = rollup.lines.filter((line) => line.state !== "planned");

	return (
		<section className={`cost-rollup cost-rollup--${rollup.summary.status}`}>
			<header className="cost-rollup__header">
				<div>
					<p className="eyebrow">{t("rollup.eyebrow")}</p>
					<h3>{t("rollup.title")}</h3>
				</div>
				<div className="cost-rollup__total">
					<span>{statusLabel}</span>
					<strong>
						{formatMoney(
							locale,
							rollup.summary.totalMinor,
							rollup.summary.currency,
						)}
					</strong>
				</div>
			</header>
			<div className="cost-rollup__meta">
				<span>
					{t("rollup.lines", {
						complete: formatNumber(locale, rollup.summary.completeLineCount),
						incomplete: formatNumber(
							locale,
							rollup.summary.incompleteLineCount,
						),
					})}
				</span>
				{rollup.summary.unplannedLineCount > 0 ? (
					<span>
						{t("rollup.unplanned", {
							count: formatNumber(locale, rollup.summary.unplannedLineCount),
						})}
					</span>
				) : null}
				{rollup.summary.currencyMismatchLineCount > 0 ? (
					<span>
						{t("rollup.currencyMismatch", {
							count: formatNumber(
								locale,
								rollup.summary.currencyMismatchLineCount,
							),
						})}
					</span>
				) : null}
				{budgetMessage ? <strong>{budgetMessage}</strong> : null}
			</div>
			{rollup.groups.length > 1 ? (
				<div className="cost-rollup__groups">
					{rollup.groups.map((group) => (
						<div key={group.groupLabel ?? "ungrouped"}>
							<span dir="auto">{group.groupLabel ?? t("item.noGroup")}</span>
							<strong>
								{formatMoney(
									locale,
									group.summary.totalMinor,
									group.summary.currency,
								)}
							</strong>
						</div>
					))}
				</div>
			) : null}
			{attentionLines.length > 0 ? (
				<ul className="cost-rollup__attention">
					{attentionLines.map((line) => (
						<li key={line.itemId}>
							<span dir="auto">{line.itemTitle}</span>
							<strong>{t(`rollup.state.${line.state}`)}</strong>
						</li>
					))}
				</ul>
			) : null}
		</section>
	);
}

function ItemLedger({
	busy,
	items,
	onArchive,
	onCompare,
	onEdit,
	onOpen,
	onRestore,
	permissions,
}: {
	busy: boolean;
	items: ItemResource[];
	onArchive: (item: ItemResource) => void;
	onCompare: (item: ItemResource) => void;
	onEdit: (item: ItemResource) => void;
	onOpen: (item: ItemResource) => void;
	onRestore: (item: ItemResource) => void;
	permissions: ItemPermissions;
}) {
	const { locale, t } = useLocale();
	const groups = useMemo(() => {
		const grouped = new Map<string, ItemResource[]>();
		for (const item of items) {
			const key = item.groupLabel ?? "";
			const group = grouped.get(key) ?? [];
			group.push(item);
			grouped.set(key, group);
		}
		return [...grouped.entries()].sort(([a], [b]) =>
			(a || t("item.noGroup")).localeCompare(b || t("item.noGroup"), locale),
		);
	}, [items, locale, t]);

	return (
		<div className="item-ledger">
			{groups.map(([groupLabel, groupItems], groupIndex) => (
				<section className="item-group" key={groupLabel || "ungrouped"}>
					<header className="item-group__header">
						<span className="item-group__index" aria-hidden="true">
							{String(groupIndex + 1).padStart(2, "0")}
						</span>
						<h3 dir="auto">{groupLabel || t("item.noGroup")}</h3>
						<span>{formatNumber(locale, groupItems.length)}</span>
					</header>

					<div className="item-group__rows">
						{groupItems.map((item, itemIndex) => (
							<article
								className={
									item.archivedAt ? "item-row item-row--archived" : "item-row"
								}
								key={item.id}
							>
								<div className="item-row__number" aria-hidden="true">
									{String(itemIndex + 1).padStart(2, "0")}
								</div>
								<div className="item-row__content">
									<div className="item-row__meta">
										<span className={`status-tag status-tag--${item.status}`}>
											{t(statusMessage[item.status])}
										</span>
										<span>{t(priorityMessage[item.priority])}</span>
										{item.archivedAt ? (
											<span>{t("common.archived")}</span>
										) : null}
									</div>
									<h4 dir="auto">{item.title}</h4>
									{item.description ? <p dir="auto">{item.description}</p> : null}
									<div className="item-row__facts">
										<span>
											{t("item.quantityShort", {
												quantity: formatNumber(locale, item.quantityNeeded),
											})}
										</span>
										<span>
											{t("item.created", {
												date: formatDate(locale, item.createdAt),
											})}
										</span>
										{item.deadlineAt ? (
											<span>
												{t("item.deadline", {
													date: formatDate(locale, item.deadlineAt),
												})}
											</span>
										) : null}
										{item.budget ? (
											<span>
												{t("item.budget", {
													amount: formatMoney(
														locale,
														item.budget.minor,
														item.budget.currency,
													),
												})}
											</span>
										) : null}
									</div>
								</div>
				<ResourceActions
					archived={Boolean(item.archivedAt)}
					busy={busy}
					canArchive={permissions.canArchive}
					canEdit={permissions.canEdit}
										onArchive={() => onArchive(item)}
										onCompare={() => onCompare(item)}
					onEdit={() => onEdit(item)}
					onOpen={() => onOpen(item)}
									onRestore={() => onRestore(item)}
									resourceName={item.title}
								/>
							</article>
						))}
					</div>
				</section>
			))}
		</div>
	);
}

export function PlanningDashboard({
	api = planningApi,
	isSigningOut,
	onDismissSignOutError,
	onSignOut,
	signOutError,
	user,
}: PlanningDashboardProps) {
	const { locale, t } = useLocale();
	const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
	const [collections, setCollections] = useState<CollectionResource[]>([]);
	const [items, setItems] = useState<ItemResource[]>([]);
	const [itemPermissions, setItemPermissions] =
		useState<ItemPermissions>(noItemPermissions);
	const [workflowEvents, setWorkflowEvents] = useState<DecisionEventResource[]>(
		[],
	);
	const [workflowPermissions, setWorkflowPermissions] =
		useState<ItemPermissions>(noItemPermissions);
	const [workflowLoading, setWorkflowLoading] = useState(false);
	const [workflowError, setWorkflowError] = useState<ApiErrorCode | null>(null);
	const [comparison, setComparison] =
		useState<ItemComparisonResponse | null>(null);
	const [comparisonLoading, setComparisonLoading] = useState(false);
	const [comparisonError, setComparisonError] =
		useState<ApiErrorCode | null>(null);
	const [collectionRollup, setCollectionRollup] =
		useState<CollectionRollupResponse | null>(null);
  const [brief, setBrief] = useState<CollectionBriefResource | null>(null);
  const [concept, setConcept] = useState<ConceptResource | null>(null);
  const [canEditBrief, setCanEditBrief] = useState(false);
  const [canEditConcept, setCanEditConcept] = useState(false);
	const [workspacePhase, setWorkspacePhase] =
		useState<LoadPhase>("loading");
	const [collectionPhase, setCollectionPhase] =
		useState<LoadPhase>("idle");
	const [itemPhase, setItemPhase] = useState<LoadPhase>("idle");
  const [directionPhase, setDirectionPhase] = useState<LoadPhase>("idle");
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<null | string>(
		() => selectionFromLocation("workspace"),
	);
	const [selectedCollectionId, setSelectedCollectionId] = useState<null | string>(
		() => selectionFromLocation("collection"),
	);
	const [showArchived, setShowArchived] = useState(false);
	const [selectedGroup, setSelectedGroup] = useState<string>("all");
	const [loadError, setLoadError] = useState<ApiErrorCode | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const [editor, setEditor] = useState<EditorState | null>(null);
	const [busy, setBusy] = useState(false);
	const [retryNonce, setRetryNonce] = useState(0);
	const workflowItemId =
		editor?.kind === "item-workflow" ? editor.resource.id : null;
	const comparisonItemId =
		editor?.kind === "item-comparison" ? editor.resource.id : null;

	useEffect(() => {
		let current = true;
		setWorkspacePhase("loading");
		setLoadError(null);

		void api
			.listWorkspaces()
			.then((result) => {
				if (!current) return;
				setWorkspaces(result);
				setWorkspacePhase("ready");
			})
			.catch((error: unknown) => {
				if (!current) return;
				setLoadError(apiErrorCode(error));
				setWorkspacePhase("ready");
			});

		return () => {
			current = false;
		};
	}, [api, retryNonce]);

	const visibleWorkspaces = useMemo(
		() =>
			workspaces.filter((workspace) => showArchived || !workspace.archivedAt),
		[showArchived, workspaces],
	);

	useEffect(() => {
		if (workspacePhase !== "ready") return;
		if (
			selectedWorkspaceId &&
			visibleWorkspaces.some((workspace) => workspace.id === selectedWorkspaceId)
		) {
			return;
		}

		setSelectedWorkspaceId(visibleWorkspaces[0]?.id ?? null);
		setSelectedCollectionId(null);
	}, [selectedWorkspaceId, visibleWorkspaces, workspacePhase]);

	useEffect(() => {
		let current = true;
		setCollections([]);
		setItems([]);
		setItemPermissions(noItemPermissions);
		setCollectionRollup(null);
    setBrief(null);
    setConcept(null);
    setCanEditBrief(false);
    setCanEditConcept(false);
		setSelectedGroup("all");
		if (!selectedWorkspaceId) {
			setCollectionPhase("ready");
			setItemPhase("ready");
      setDirectionPhase("ready");
			return () => {
				current = false;
			};
		}

		setCollectionPhase("loading");
		setLoadError(null);
		void api
			.listCollections(selectedWorkspaceId)
			.then((result) => {
				if (!current) return;
				setCollections(result);
				setCollectionPhase("ready");
			})
			.catch((error: unknown) => {
				if (!current) return;
				setLoadError(apiErrorCode(error));
				setCollectionPhase("ready");
			});

		return () => {
			current = false;
		};
	}, [api, retryNonce, selectedWorkspaceId]);

	const visibleCollections = useMemo(
		() =>
			collections.filter(
				(collection) => showArchived || !collection.archivedAt,
			),
		[collections, showArchived],
	);

	useEffect(() => {
		if (collectionPhase !== "ready") return;
		if (
			selectedCollectionId &&
			visibleCollections.some(
				(collection) => collection.id === selectedCollectionId,
			)
		) {
			return;
		}

		setSelectedCollectionId(visibleCollections[0]?.id ?? null);
	}, [collectionPhase, selectedCollectionId, visibleCollections]);

	useEffect(() => {
		let current = true;
		setItems([]);
		setItemPermissions(noItemPermissions);
		setCollectionRollup(null);
    setBrief(null);
    setConcept(null);
    setCanEditBrief(false);
    setCanEditConcept(false);
		setSelectedGroup("all");
		if (!selectedCollectionId) {
			setItemPhase("ready");
      setDirectionPhase("ready");
			return () => {
				current = false;
			};
		}

		setItemPhase("loading");
    setDirectionPhase("loading");
		setLoadError(null);
    void Promise.all([
      api.listItems(selectedCollectionId),
      api.readCollectionBrief(selectedCollectionId),
      api.readConcept(selectedCollectionId),
			api.readCollectionRollup(selectedCollectionId),
    ])
			.then(([itemResult, briefResult, conceptResult, rollupResult]) => {
				if (!current) return;
				setItems(itemResult.items);
				setItemPermissions(itemResult.permissions);
        setBrief(briefResult.resource);
        setCanEditBrief(briefResult.canEdit);
        setConcept(conceptResult.resource);
        setCanEditConcept(conceptResult.canEdit);
				setCollectionRollup(rollupResult);
				setItemPhase("ready");
        setDirectionPhase("ready");
			})
			.catch((error: unknown) => {
				if (!current) return;
				setLoadError(apiErrorCode(error));
				setItemPhase("ready");
        setDirectionPhase("ready");
			});

		return () => {
			current = false;
		};
	}, [api, retryNonce, selectedCollectionId]);

	useEffect(() => {
		writeSelectionToLocation(selectedWorkspaceId, selectedCollectionId);
	}, [selectedCollectionId, selectedWorkspaceId]);

	useEffect(() => {
		let current = true;
		if (!workflowItemId) {
			setWorkflowEvents([]);
			setWorkflowPermissions(noItemPermissions);
			setWorkflowLoading(false);
			setWorkflowError(null);
			return () => {
				current = false;
			};
		}

		setWorkflowLoading(true);
		setWorkflowError(null);
		void api
			.readItemWorkflow(workflowItemId)
			.then((result) => {
				if (!current) return;
				setWorkflowEvents(result.events);
				setWorkflowPermissions(result.permissions);
				setItems((items) => replaceResource(items, result.item));
				setEditor((openEditor) =>
					openEditor?.kind === "item-workflow" &&
					openEditor.resource.id === result.item.id
						? { kind: "item-workflow", resource: result.item }
						: openEditor,
				);
				setWorkflowLoading(false);
			})
			.catch((error: unknown) => {
				if (!current) return;
				setWorkflowError(apiErrorCode(error));
				setWorkflowLoading(false);
			});

		return () => {
			current = false;
		};
	}, [api, workflowItemId]);

	useEffect(() => {
		let current = true;
		if (!comparisonItemId) {
			setComparison(null);
			setComparisonLoading(false);
			setComparisonError(null);
			return () => {
				current = false;
			};
		}

		setComparison(null);
		setComparisonLoading(true);
		setComparisonError(null);
		void api
			.readItemComparison(comparisonItemId)
			.then((result) => {
				if (!current) return;
				setComparison(result);
				setComparisonLoading(false);
			})
			.catch((error: unknown) => {
				if (!current) return;
				setComparisonError(apiErrorCode(error));
				setComparisonLoading(false);
			});

		return () => {
			current = false;
		};
	}, [api, comparisonItemId]);

	useEffect(() => {
		if (!toast) return;
		const timer = window.setTimeout(() => setToast(null), 4_500);
		return () => window.clearTimeout(timer);
	}, [toast]);

	const selectedWorkspace = workspaces.find(
		(workspace) => workspace.id === selectedWorkspaceId,
	);
	const selectedCollection = collections.find(
		(collection) => collection.id === selectedCollectionId,
	);
	const visibleItems = useMemo(
		() => items.filter((item) => showArchived || !item.archivedAt),
		[items, showArchived],
	);
	const groupLabels = useMemo(
		() =>
			[...new Set(visibleItems.map((item) => item.groupLabel).filter(Boolean))]
				.filter((value): value is string => Boolean(value))
				.sort((a, b) => a.localeCompare(b, locale)),
		[locale, visibleItems],
	);
	const filteredItems =
		selectedGroup === "all"
			? visibleItems
			: visibleItems.filter((item) => item.groupLabel === selectedGroup);
	const activeItems = items.filter((item) => !item.archivedAt);
	const activeUnits = activeItems.reduce(
		(total, item) => total + item.quantityNeeded,
		0,
	);

	useEffect(() => {
		if (
			selectedGroup !== "all" &&
			!groupLabels.some((group) => group === selectedGroup)
		) {
			setSelectedGroup("all");
		}
	}, [groupLabels, selectedGroup]);

	const viewState = resolvePlanningViewState({
		collectionCount: visibleCollections.length,
		collectionPhase,
		errorCode: loadError,
		itemCount: visibleItems.length,
		itemPhase,
		selectedCollection: Boolean(selectedCollection),
		selectedWorkspace: Boolean(selectedWorkspace),
		workspaceCount: visibleWorkspaces.length,
		workspacePhase,
	});

	function errorMessageForCode(code: ApiErrorCode): string {
		const messages: Partial<Record<ApiErrorCode, MessageKey>> = {
			BAD_REQUEST: "status.validation",
			FORBIDDEN: "status.permissionDenied",
			NOT_FOUND: "status.notFound",
			RESOURCE_ARCHIVED: "status.archived",
			UNAUTHENTICATED: "status.unauthorizedTitle",
		};
		return t(messages[code] ?? "status.genericMutationError");
	}

	function errorMessage(error: unknown): string {
		return errorMessageForCode(apiErrorCode(error));
	}

	async function mutate<T>(
		operation: () => Promise<T>,
		onSuccess: (result: T) => void,
		messageKey: MessageKey,
		closeEditor = true,
	): Promise<boolean> {
		setBusy(true);
		setActionError(null);
		try {
			const result = await operation();
			onSuccess(result);
			setToast(t(messageKey));
			if (closeEditor) setEditor(null);
			return true;
		} catch (error) {
			setActionError(errorMessage(error));
			return false;
		} finally {
			setBusy(false);
		}
	}

	async function createWorkspace(value: WorkspaceCreateInput) {
		return mutate(
			() => api.createWorkspace(value),
			(workspace) => {
				const summary = asWorkspaceSummary(workspace);
				setWorkspaces((current) => [...current, summary]);
				setSelectedWorkspaceId(summary.id);
				setSelectedCollectionId(null);
			},
			"toast.workspaceCreated",
		);
	}

	async function updateWorkspace(value: WorkspaceCreateInput) {
		if (!editor || editor.kind !== "workspace-edit") return false;
		return mutate(
			() => api.updateWorkspace(editor.resource.id, value),
			(workspace) =>
				setWorkspaces((current) =>
					replaceResource(current, asWorkspaceSummary(workspace)),
				),
			"toast.workspaceUpdated",
		);
	}

	async function archiveWorkspace(workspace: WorkspaceSummary) {
		if (!window.confirm(t("workspace.archiveConfirm"))) return;
		await mutate(
			() => api.archiveWorkspace(workspace.id),
			(result) =>
				setWorkspaces((current) =>
					replaceResource(current, asWorkspaceSummary(result)),
				),
			"toast.workspaceArchived",
		);
	}

	async function restoreWorkspace(workspace: WorkspaceSummary) {
		await mutate(
			() => api.restoreWorkspace(workspace.id),
			(result) =>
				setWorkspaces((current) =>
					replaceResource(current, asWorkspaceSummary(result)),
				),
			"toast.workspaceRestored",
		);
	}

	async function createCollection(value: CollectionCreateInput) {
		if (!selectedWorkspaceId) return false;
		return mutate(
			() => api.createCollection(selectedWorkspaceId, value),
			(collection) => {
				setCollections((current) => [...current, collection]);
				setSelectedCollectionId(collection.id);
			},
			"toast.collectionCreated",
		);
	}

	async function updateCollection(value: CollectionCreateInput) {
		if (!editor || editor.kind !== "collection-edit") return false;
		return mutate(
			() => api.updateCollection(editor.resource.id, value),
			(collection) =>
				setCollections((current) => replaceResource(current, collection)),
			"toast.collectionUpdated",
		);
	}

	async function archiveCollection(collection: CollectionResource) {
		if (!window.confirm(t("collection.archiveConfirm"))) return;
		await mutate(
			() => api.archiveCollection(collection.id),
			(result) =>
				setCollections((current) => replaceResource(current, result)),
			"toast.collectionArchived",
		);
	}

	async function restoreCollection(collection: CollectionResource) {
		await mutate(
			() => api.restoreCollection(collection.id),
			(result) =>
				setCollections((current) => replaceResource(current, result)),
			"toast.collectionRestored",
		);
	}

	async function createItem(value: ItemCreateInput) {
		if (!selectedCollectionId) return false;
		return mutate(
			() => api.createItem(selectedCollectionId, value),
			(item) => setItems((current) => [...current, item]),
			"toast.itemCreated",
		);
	}

  async function saveBrief(value: CollectionBriefInput) {
    if (!selectedCollectionId) return false;
    return mutate(
      () => api.saveCollectionBrief(selectedCollectionId, value),
      (result) => {
        setBrief(result.resource);
        setCanEditBrief(result.canEdit);
      },
      "toast.briefSaved",
    );
  }

  async function saveTextConcept(value: ConceptInput) {
    if (!selectedCollectionId) return false;
    return mutate(
      () => api.saveConcept(selectedCollectionId, value),
      (result) => {
        setConcept(result.resource);
        setCanEditConcept(result.canEdit);
      },
      "toast.conceptSaved",
    );
  }

  async function removeTextConcept() {
    if (!selectedCollectionId) return;
    if (!window.confirm(t("concept.removeConfirm"))) return;
    await mutate(
      () => api.removeConcept(selectedCollectionId),
      (result) => {
        setConcept(result.resource);
        setCanEditConcept(result.canEdit);
      },
      "toast.conceptRemoved",
    );
  }

	async function updateItem(value: ItemCreateInput) {
		if (!editor || editor.kind !== "item-edit") return false;
		return mutate(
			() => api.updateItem(editor.resource.id, value),
			(item) => setItems((current) => replaceResource(current, item)),
			"toast.itemUpdated",
		);
	}

	function openItemWorkflow(item: ItemResource) {
		setWorkflowEvents([]);
		setWorkflowPermissions(itemPermissions);
		setWorkflowError(null);
		setWorkflowLoading(true);
		setEditor({ kind: "item-workflow", resource: item });
	}

	function openItemComparison(item: ItemResource) {
		setComparison(null);
		setComparisonError(null);
		setComparisonLoading(true);
		setEditor({ kind: "item-comparison", resource: item });
	}

	function comparisonChanged(
		value: ItemComparisonResponse,
		toastMessage: string,
	) {
		setComparison(value);
		setToast(toastMessage);
		if (selectedCollectionId) {
			void api
				.readCollectionRollup(selectedCollectionId)
				.then(setCollectionRollup)
				.catch((error: unknown) => setActionError(errorMessage(error)));
		}
	}

	async function changeItemStatus(value: ItemStatusChangeInput) {
		if (!editor || editor.kind !== "item-workflow") return false;
		return mutate(
			() => api.changeItemStatus(editor.resource.id, value),
			(result) => {
				setItems((current) => replaceResource(current, result.item));
				setWorkflowEvents((current) => [result.event, ...current]);
				setEditor({ kind: "item-workflow", resource: result.item });
			},
			"toast.itemStatusChanged",
			false,
		);
	}

	async function archiveItem(item: ItemResource) {
		if (!window.confirm(t("item.archiveConfirm"))) return;
		await mutate(
			() => api.archiveItem(item.id),
			(result) => setItems((current) => replaceResource(current, result)),
			"toast.itemArchived",
		);
	}

	async function restoreItem(item: ItemResource) {
		await mutate(
			() => api.restoreItem(item.id),
			(result) => setItems((current) => replaceResource(current, result)),
			"toast.itemRestored",
		);
	}

	const firstName = user.name.trim().split(/\s+/u)[0] || user.name;

	return (
		<div className="studio-shell">
			<a className="skip-link" href="#main-content">
				{t("nav.skipToContent")}
			</a>
			<header className="studio-header">
				<BrandMark compact />
				<div className="studio-header__actions">
					<LocaleSwitch />
					<div className="account-chip">
						<UserAvatar name={user.name} image={user.image} />
						<div className="account-chip__identity">
							<strong dir="auto">{user.name}</strong>
							<span>{user.email}</span>
						</div>
					</div>
					<button
						type="button"
						className="text-button"
						onClick={() => void onSignOut()}
						disabled={isSigningOut}
					>
						{isSigningOut ? t("account.signingOut") : t("account.signOut")}
					</button>
				</div>
			</header>

			<div className="studio-grid">
				<aside className="workspace-rail">
					<div className="workspace-rail__heading">
						<div>
							<p className="rail-index" aria-hidden="true">
								01
							</p>
							<h2>{t("workspace.label")}</h2>
						</div>
						<button
							type="button"
							className="icon-button"
							onClick={() => setEditor({ kind: "workspace-create" })}
							aria-label={t("workspace.new")}
							title={t("workspace.new")}
						>
							+
						</button>
					</div>
					<nav aria-label={t("nav.workspaceMenu")}>
						<ul className="workspace-list">
							{visibleWorkspaces.map((workspace, index) => (
								<li key={workspace.id}>
									<button
										type="button"
										className={
											workspace.id === selectedWorkspaceId
												? "workspace-link workspace-link--active"
												: "workspace-link"
										}
										onClick={() => {
											setSelectedWorkspaceId(workspace.id);
											setSelectedCollectionId(null);
										}}
										aria-current={
											workspace.id === selectedWorkspaceId ? "page" : undefined
										}
									>
										<span className="workspace-link__number" aria-hidden="true">
											{String(index + 1).padStart(2, "0")}
										</span>
										<span className="workspace-link__name" dir="auto">
											{workspace.name}
										</span>
										{workspace.archivedAt ? (
											<span className="workspace-link__archived">
												{t("common.archived")}
											</span>
										) : null}
									</button>
								</li>
							))}
						</ul>
					</nav>
					<div className="workspace-rail__footer">
						<button
							type="button"
							className="archive-toggle"
							onClick={() => setShowArchived((current) => !current)}
							aria-pressed={showArchived}
						>
							<span className="archive-toggle__box" aria-hidden="true" />
							{showArchived
								? t("dashboard.hideArchived")
								: t("dashboard.showArchived")}
						</button>
						<p>{t("account.signedInAs", { email: user.email })}</p>
					</div>
				</aside>

				<main className="studio-main" id="main-content">
					<section className="studio-intro">
						<div>
							<p className="eyebrow">{t("dashboard.privateWorkspace")}</p>
							<h1>{t("dashboard.greeting", { name: firstName })}</h1>
							<p>{t("dashboard.description")}</p>
						</div>
						<p className="studio-intro__workflow">{t("dashboard.workflow")}</p>
					</section>

					{viewState === "loading-workspaces" ? (
						<StatusPanel
							eyebrow={t("common.loading")}
							title={t("status.loadingWorkspaces")}
							body={t("dashboard.description")}
						/>
					) : viewState === "unauthorized" ? (
						<StatusPanel
							eyebrow={t("status.unauthorizedEyebrow")}
							title={t("status.unauthorizedTitle")}
							body={t("status.unauthorizedBody")}
							onRetry={() => window.location.reload()}
							retryLabel={t("common.retry")}
						/>
					) : viewState === "error" ? (
						<StatusPanel
							eyebrow={t("status.errorEyebrow")}
							title={t("status.errorTitle")}
							body={t("status.errorBody")}
							onRetry={() => setRetryNonce((current) => current + 1)}
							retryLabel={t("common.retry")}
						/>
					) : viewState === "empty-workspaces" ? (
						<EmptyPanel
							eyebrow={t("workspace.emptyEyebrow")}
							title={t("workspace.emptyTitle")}
							body={t("workspace.emptyBody")}
							action={t("workspace.emptyAction")}
							onAction={() => setEditor({ kind: "workspace-create" })}
						/>
					) : selectedWorkspace ? (
						<section className="workspace-folio">
							<header className="workspace-folio__header">
								<div>
									<p className="eyebrow">{t("workspace.singular")}</p>
									<h2 dir="auto">{selectedWorkspace.name}</h2>
								</div>
								<div className="workspace-folio__controls">
									{selectedWorkspace.accessScope === "workspace" ? (
										<ResourceActions
											archived={Boolean(selectedWorkspace.archivedAt)}
											busy={busy}
											onArchive={() => void archiveWorkspace(selectedWorkspace)}
											onEdit={() =>
												setEditor({
													kind: "workspace-edit",
													resource: selectedWorkspace,
												})
											}
											onRestore={() => void restoreWorkspace(selectedWorkspace)}
											resourceName={selectedWorkspace.name}
										/>
									) : null}
									{!selectedWorkspace.archivedAt &&
									selectedWorkspace.accessScope === "workspace" ? (
										<button
											type="button"
											className="button button--secondary"
											onClick={() => setEditor({ kind: "collection-create" })}
										>
											<InlineIcon>＋</InlineIcon>
											{t("collection.new")}
										</button>
									) : null}
								</div>
							</header>

							{viewState === "loading-collections" ? (
								<StatusPanel
									eyebrow={t("common.loading")}
									title={t("status.loadingCollections")}
									body={t("collection.createDescription")}
								/>
							) : viewState === "empty-collections" ? (
								<EmptyPanel
									eyebrow={t("collection.emptyEyebrow")}
									title={t("collection.emptyTitle")}
									body={t("collection.emptyBody")}
									action={t("collection.emptyAction")}
									onAction={() => setEditor({ kind: "collection-create" })}
								/>
							) : (
								<>
									<nav
										className="collection-strip"
										aria-label={t("nav.collectionMenu")}
									>
										{visibleCollections.map((collection, index) => (
											<button
												type="button"
												key={collection.id}
												className={
													collection.id === selectedCollectionId
														? "collection-tab collection-tab--active"
														: "collection-tab"
												}
												onClick={() => setSelectedCollectionId(collection.id)}
												aria-label={t("collection.select", {
													name: collection.name,
												})}
												aria-current={
													collection.id === selectedCollectionId
														? "page"
														: undefined
												}
											>
												<span aria-hidden="true">
													{String(index + 1).padStart(2, "0")}
												</span>
												<strong dir="auto">{collection.name}</strong>
												{collection.archivedAt ? (
													<small>{t("common.archived")}</small>
												) : null}
											</button>
										))}
									</nav>

									{selectedCollection ? (
										<section className="collection-folio">
											<header className="collection-folio__header">
												<div>
													<p className="eyebrow">{t("collection.singular")}</p>
													<h2 dir="auto">{selectedCollection.name}</h2>
													{selectedCollection.description ? (
														<p dir="auto">{selectedCollection.description}</p>
													) : null}
												</div>
												<div className="collection-folio__actions">
													<ResourceActions
														archived={Boolean(selectedCollection.archivedAt)}
														busy={busy}
														onArchive={() =>
															void archiveCollection(selectedCollection)
														}
														onEdit={() =>
															setEditor({
																kind: "collection-edit",
																resource: selectedCollection,
															})
														}
														onRestore={() =>
															void restoreCollection(selectedCollection)
														}
														resourceName={selectedCollection.name}
													/>
											{!selectedCollection.archivedAt &&
											itemPermissions.canCreate ? (
														<button
															type="button"
															className="button button--primary"
															onClick={() => setEditor({ kind: "item-create" })}
														>
															<InlineIcon>＋</InlineIcon>
															{t("item.new")}
														</button>
													) : null}
												</div>
											</header>

                      <CollectionDirection
                        brief={brief}
                        busy={busy}
                        canEditBrief={
                          canEditBrief && !selectedCollection.archivedAt
                        }
                        canEditConcept={
                          canEditConcept && !selectedCollection.archivedAt
                        }
                        concept={concept}
                        loading={directionPhase !== "ready"}
                        onEditBrief={() => setEditor({ kind: "brief-edit" })}
                        onEditConcept={() =>
                          setEditor({ kind: "concept-edit" })
                        }
                        onRemoveConcept={() => void removeTextConcept()}
                      />

											{collectionRollup && activeItems.length > 0 ? (
												<CollectionCostSummary rollup={collectionRollup} />
											) : null}

											{viewState === "loading-items" ? (
												<StatusPanel
													eyebrow={t("common.loading")}
													title={t("status.loadingItems")}
													body={t("item.createDescription")}
												/>
											) : viewState === "empty-items" ? (
												<EmptyPanel
													eyebrow={t("item.emptyEyebrow")}
													title={t("item.emptyTitle")}
													body={t("item.emptyBody")}
												action={
													itemPermissions.canCreate
														? t("item.emptyAction")
														: undefined
												}
												onAction={
													itemPermissions.canCreate
														? () => setEditor({ kind: "item-create" })
														: undefined
												}
												/>
											) : (
												<>
													<div className="collection-metrics">
														<div>
															<strong>{formatNumber(locale, activeItems.length)}</strong>
															<span>{t("metric.items")}</span>
														</div>
														<div>
															<strong>{formatNumber(locale, groupLabels.length)}</strong>
															<span>{t("metric.groups")}</span>
														</div>
														<div>
															<strong>{formatNumber(locale, activeUnits)}</strong>
															<span>{t("metric.units")}</span>
														</div>
													</div>

													{groupLabels.length > 0 ? (
														<nav
															className="group-filter"
															aria-label={t("nav.itemGroups")}
														>
															<button
																type="button"
																className={
																	selectedGroup === "all"
																		? "group-chip group-chip--active"
																		: "group-chip"
																}
																onClick={() => setSelectedGroup("all")}
															>
																{t("item.groupAll")}
															</button>
															{groupLabels.map((group) => (
																<button
																	type="button"
																	className={
																		selectedGroup === group
																			? "group-chip group-chip--active"
																			: "group-chip"
																	}
																	onClick={() => setSelectedGroup(group)}
																	key={group}
																	dir="auto"
																>
																	{group}
																</button>
															))}
														</nav>
													) : null}

												<ItemLedger
													busy={busy}
													items={filteredItems}
												onArchive={(item) => void archiveItem(item)}
												onCompare={openItemComparison}
												onEdit={(item) =>
														setEditor({ kind: "item-edit", resource: item })
													}
													onOpen={openItemWorkflow}
													onRestore={(item) => void restoreItem(item)}
													permissions={itemPermissions}
												/>
												</>
											)}
										</section>
									) : null}
								</>
							)}
						</section>
					) : null}

					{actionError || signOutError ? (
						<div className="action-notice action-notice--error" role="alert">
							<span aria-hidden="true">!</span>
							<p>
								{actionError ?? t("account.signOutError")}
							</p>
							<button
								type="button"
								onClick={() => {
									setActionError(null);
									onDismissSignOutError();
								}}
								aria-label={t("common.close")}
							>
								×
							</button>
						</div>
					) : null}
					{toast ? (
						<div className="action-notice action-notice--success" role="status">
							<span aria-hidden="true">✓</span>
							<p>{toast}</p>
						</div>
					) : null}
				</main>
			</div>

			{editor?.kind === "workspace-create" ? (
				<WorkspaceForm
					busy={busy}
					onClose={() => setEditor(null)}
					onSubmit={createWorkspace}
				/>
			) : editor?.kind === "workspace-edit" ? (
				<WorkspaceForm
					busy={busy}
					initial={editor.resource}
					onClose={() => setEditor(null)}
					onSubmit={updateWorkspace}
				/>
			) : editor?.kind === "collection-create" ? (
				<CollectionForm
					busy={busy}
					onClose={() => setEditor(null)}
					onSubmit={createCollection}
				/>
			) : editor?.kind === "collection-edit" ? (
				<CollectionForm
					busy={busy}
					initial={editor.resource}
					onClose={() => setEditor(null)}
					onSubmit={updateCollection}
				/>
			) : editor?.kind === "item-create" ? (
				<ItemForm
					busy={busy}
					onClose={() => setEditor(null)}
					onSubmit={createItem}
				/>
			) : editor?.kind === "item-workflow" ? (
				<ItemWorkflowDialog
					busy={busy}
					key={editor.resource.id}
					error={
						workflowError ? errorMessageForCode(workflowError) : null
					}
					events={workflowEvents}
					item={editor.resource}
					loading={workflowLoading}
					onChangeStatus={changeItemStatus}
					onClose={() => setEditor(null)}
					onEdit={() =>
						setEditor({ kind: "item-edit", resource: editor.resource })
					}
					permissions={workflowPermissions}
				/>
			) : editor?.kind === "item-comparison" ? (
				<ItemComparisonDialog
					api={api}
					comparison={comparison}
					error={
						comparisonError
							? errorMessageForCode(comparisonError)
							: null
					}
					item={editor.resource}
					loading={comparisonLoading}
					onChange={comparisonChanged}
					onClose={() => setEditor(null)}
				/>
			) : editor?.kind === "item-edit" ? (
				<ItemForm
					busy={busy}
					initial={editor.resource}
					onClose={() => setEditor(null)}
					onSubmit={updateItem}
				/>
      ) : editor?.kind === "brief-edit" ? (
        <CollectionBriefForm
          busy={busy}
          initial={brief}
          onClose={() => setEditor(null)}
          onSubmit={saveBrief}
        />
      ) : editor?.kind === "concept-edit" ? (
        <ConceptForm
          busy={busy}
          initial={concept}
          onClose={() => setEditor(null)}
          onSubmit={saveTextConcept}
        />
			) : null}
		</div>
	);
}
