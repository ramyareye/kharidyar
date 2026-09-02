import type {
	CollaborationMember,
	InvitationCreateInput,
	WorkspaceCollaborationResponse,
	WorkspaceSummary,
} from "@kharidyar/contracts";
import { formatDateTime, type MessageKey } from "@kharidyar/i18n";
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type FormEvent,
} from "react";

import { useLocale } from "./locale-context";
import { PlanningApiError, type PlanningApi } from "./planning-api";
import { EditorDialog } from "./planning-forms";

const roles = [
	"viewer",
	"commenter",
	"contributor",
	"editor",
	"owner",
] as const;

const roleMessages: Record<(typeof roles)[number], MessageKey> = {
	viewer: "collaboration.role.viewer",
	commenter: "collaboration.role.commenter",
	contributor: "collaboration.role.contributor",
	editor: "collaboration.role.editor",
	owner: "collaboration.role.owner",
};

function memberScope(member: CollaborationMember): {
	id: string;
	type: "collection" | "workspace";
} {
	return member.scope.type === "workspace"
		? { id: member.scope.workspaceId, type: "workspace" }
		: { id: member.scope.collectionId, type: "collection" };
}

export function CollaborationAdminDialog({
	api,
	onClose,
	workspace,
}: {
	api: PlanningApi;
	onClose: () => void;
	workspace: WorkspaceSummary;
}) {
	const { locale, t } = useLocale();
	const [data, setData] = useState<WorkspaceCollaborationResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [scopeType, setScopeType] = useState<"collections" | "workspace">(
		"workspace",
	);
	const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>(
		[],
	);
	const [role, setRole] = useState<(typeof roles)[number]>("commenter");
	const [email, setEmail] = useState("");
	const [restrictToEmail, setRestrictToEmail] = useState(false);
	const [expiryDays, setExpiryDays] = useState("7");
	const [createdLink, setCreatedLink] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const explainError = useCallback(
		(value: unknown) =>
			value instanceof PlanningApiError && value.code === "FORBIDDEN"
				? t("status.permissionDenied")
				: t("status.genericMutationError"),
		[t],
	);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await api.readWorkspaceCollaboration(workspace.id);
			setData(result);
			setScopeType(
				result.permissions.canInviteWorkspace ? "workspace" : "collections",
			);
			setSelectedCollectionIds((current) =>
				current.length > 0
					? current.filter((id) =>
							result.permissions.invitableCollections.some(
								(collection) => collection.id === id,
							),
						)
					: result.permissions.invitableCollections[0]
						? [result.permissions.invitableCollections[0].id]
						: [],
			);
		} catch (value) {
			setError(explainError(value));
		} finally {
			setLoading(false);
		}
	}, [api, explainError, workspace.id]);

	useEffect(() => {
		void load();
	}, [load]);

	const canInvite = Boolean(
		data &&
			(data.permissions.canInviteWorkspace ||
				data.permissions.invitableCollections.length > 0),
	);
	const availableRoles = useMemo(
		() =>
			roles.filter(
				(candidate) => candidate !== "owner" || data?.permissions.canGrantOwner,
			),
		[data?.permissions.canGrantOwner],
	);

	async function run(
		operation: () => Promise<void>,
		successMessage: MessageKey,
	): Promise<void> {
		setBusy(true);
		setError(null);
		setNotice(null);
		try {
			await operation();
			setNotice(t(successMessage));
			await load();
		} catch (value) {
			setError(explainError(value));
		} finally {
			setBusy(false);
		}
	}

	async function createInvitation(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (scopeType === "collections" && selectedCollectionIds.length === 0) {
			setError(t("collaboration.selectCollectionError"));
			return;
		}
		const normalizedEmail = email.trim();
		const value: InvitationCreateInput = {
			expiresAt: new Date(
				Date.now() + Number(expiryDays) * 86_400_000,
			).toISOString(),
			invitedEmail: normalizedEmail || null,
			restrictToEmail: Boolean(normalizedEmail && restrictToEmail),
			role,
			scope:
				scopeType === "workspace"
					? { type: "workspace" }
					: { collectionIds: selectedCollectionIds, type: "collections" },
		};
		setBusy(true);
		setError(null);
		setNotice(null);
		setCopied(false);
		try {
			const result = await api.createInvitation(workspace.id, value);
			setCreatedLink(result.invitation.url);
			setNotice(t("collaboration.invitationCreated"));
			await load();
		} catch (value) {
			setError(explainError(value));
		} finally {
			setBusy(false);
		}
	}

	async function copyLink() {
		if (!createdLink) return;
		try {
			await navigator.clipboard.writeText(createdLink);
			setCopied(true);
			setError(null);
		} catch {
			setError(t("collaboration.copyError"));
		}
	}

	function toggleCollection(collectionId: string) {
		setSelectedCollectionIds((current) =>
			current.includes(collectionId)
				? current.filter((id) => id !== collectionId)
				: [...current, collectionId],
		);
	}

	return (
		<EditorDialog
			busy={busy}
			description={t("collaboration.description")}
			onClose={onClose}
			size="wide"
			title={t("collaboration.title")}
		>
			<div className="collaboration-admin">
				{loading && !data ? (
					<p className="collaboration-state" role="status">
						{t("collaboration.loading")}
					</p>
				) : error && !data ? (
					<div className="collaboration-state" role="alert">
						<p>{error}</p>
						<button
							type="button"
							className="button button--secondary"
							onClick={() => void load()}
						>
							{t("common.retry")}
						</button>
					</div>
				) : data ? (
					<>
						{canInvite ? (
							<section className="access-section access-section--invitation">
								<header className="access-section__heading">
									<span aria-hidden="true">01</span>
									<div>
										<p className="eyebrow">
											{t("collaboration.inviteEyebrow")}
										</p>
										<h3>{t("collaboration.inviteTitle")}</h3>
										<p>{t("collaboration.inviteBody")}</p>
									</div>
								</header>
								<form className="invitation-form" onSubmit={createInvitation}>
									<div className="field-row">
										<label className="field">
											<span className="field__label">
												{t("collaboration.scope")}
											</span>
											<select
												value={scopeType}
												onChange={(event) =>
													setScopeType(
														event.target.value as "collections" | "workspace",
													)
												}
											>
												{data.permissions.canInviteWorkspace ? (
													<option value="workspace">
														{t("collaboration.scopeWorkspace")}
													</option>
												) : null}
												{data.permissions.invitableCollections.length > 0 ? (
													<option value="collections">
														{t("collaboration.scopeCollections")}
													</option>
												) : null}
											</select>
										</label>
										<label className="field">
											<span className="field__label">
												{t("collaboration.role")}
											</span>
											<select
												value={role}
												onChange={(event) =>
													setRole(event.target.value as typeof role)
												}
											>
												{availableRoles.map((candidate) => (
													<option value={candidate} key={candidate}>
														{t(roleMessages[candidate])}
													</option>
												))}
											</select>
										</label>
									</div>

									{scopeType === "collections" ? (
										<fieldset className="collection-picker">
											<legend>{t("collaboration.selectCollections")}</legend>
											{data.permissions.invitableCollections.map(
												(collection) => (
													<label key={collection.id}>
														<input
															type="checkbox"
															checked={selectedCollectionIds.includes(
																collection.id,
															)}
															onChange={() => toggleCollection(collection.id)}
														/>
														<span dir="auto">{collection.name}</span>
													</label>
												),
											)}
										</fieldset>
									) : null}

									<div className="field-row">
										<label className="field">
											<span className="field__label">
												{t("collaboration.email")}
											</span>
											<input
												type="email"
												value={email}
												placeholder={t("collaboration.emailPlaceholder")}
												onChange={(event) => {
													const next = event.target.value;
													if (!email.trim() && next.trim())
														setRestrictToEmail(true);
													if (!next.trim()) setRestrictToEmail(false);
													setEmail(next);
												}}
											/>
										</label>
										<label className="field">
											<span className="field__label">
												{t("collaboration.expiry")}
											</span>
											<select
												value={expiryDays}
												onChange={(event) => setExpiryDays(event.target.value)}
											>
												<option value="1">
													{t("collaboration.expiryOne")}
												</option>
												<option value="7">
													{t("collaboration.expirySeven")}
												</option>
												<option value="30">
													{t("collaboration.expiryThirty")}
												</option>
											</select>
										</label>
									</div>
									<label className="restriction-option">
										<input
											type="checkbox"
											checked={restrictToEmail}
											disabled={!email.trim()}
											onChange={(event) =>
												setRestrictToEmail(event.target.checked)
											}
										/>
										<span>{t("collaboration.emailRestriction")}</span>
									</label>
									<button
										className="button button--primary"
										type="submit"
										disabled={busy}
									>
										{t("collaboration.createLink")}
										<span aria-hidden="true">↗</span>
									</button>
								</form>
								{createdLink ? (
									<div className="invitation-result" role="status">
										<div>
											<strong>{t("collaboration.linkTitle")}</strong>
											<p>{t("collaboration.linkBody")}</p>
										</div>
										<code dir="ltr">{createdLink}</code>
										<button
											type="button"
											className="button button--secondary"
											onClick={() => void copyLink()}
										>
											{copied
												? t("collaboration.copied")
												: t("collaboration.copy")}
										</button>
										<small>{t("collaboration.linkWarning")}</small>
									</div>
								) : null}
							</section>
						) : (
							<section className="access-empty">
								<p className="eyebrow">{t("collaboration.privateAccess")}</p>
								<h3>{t("collaboration.noAccessTitle")}</h3>
								<p>{t("collaboration.noAccessBody")}</p>
							</section>
						)}

						{canInvite ? (
							<div className="access-ledger">
								<section className="access-section">
									<header className="access-section__heading access-section__heading--compact">
										<span aria-hidden="true">02</span>
										<div>
											<h3>{t("collaboration.membersTitle")}</h3>
											<p>{t("collaboration.membersBody")}</p>
										</div>
									</header>
									<div className="member-list">
										{data.members.length === 0 ? (
											<p className="ledger-empty">
												{t("collaboration.noMembers")}
											</p>
										) : (
											data.members.map((member) => (
												<article className="member-row" key={member.id}>
													<span
														className="member-row__initial"
														aria-hidden="true"
													>
														{member.user.name.trim().charAt(0).toUpperCase() ||
															"?"}
													</span>
													<div className="member-row__identity">
														<strong dir="auto">{member.user.name}</strong>
														<span>{member.user.email}</span>
														<small dir="auto">
															{member.scope.type === "workspace"
																? member.scope.workspaceName
																: member.scope.collectionName}
														</small>
													</div>
													{member.canManage ? (
														<div className="member-row__actions">
															<select
																aria-label={t("collaboration.changeRole", {
																	name: member.user.name,
																})}
																value={member.role}
																disabled={busy}
																onChange={(event) =>
																	void run(
																		() =>
																			api.updateMembership(
																				memberScope(member),
																				member.user.id,
																				event.target
																					.value as CollaborationMember["role"],
																			),
																		"collaboration.memberUpdated",
																	)
																}
															>
																{roles
																	.filter(
																		(candidate) =>
																			candidate !== "owner" ||
																			data.permissions.canGrantOwner,
																	)
																	.map((candidate) => (
																		<option value={candidate} key={candidate}>
																			{t(roleMessages[candidate])}
																		</option>
																	))}
															</select>
															<button
																type="button"
																className="text-action text-action--danger"
																disabled={busy}
																onClick={() => {
																	if (
																		!window.confirm(
																			t("collaboration.removeConfirm", {
																				name: member.user.name,
																			}),
																		)
																	)
																		return;
																	void run(
																		() =>
																			api.removeMembership(
																				memberScope(member),
																				member.user.id,
																			),
																		"collaboration.memberRemoved",
																	);
																}}
															>
																{t("collaboration.removeMember")}
															</button>
														</div>
													) : (
														<span className="role-stamp">
															{t(roleMessages[member.role])}
														</span>
													)}
												</article>
											))
										)}
									</div>
								</section>

								<section className="access-section">
									<header className="access-section__heading access-section__heading--compact">
										<span aria-hidden="true">03</span>
										<div>
											<h3>{t("collaboration.invitationsTitle")}</h3>
											<p>{t("collaboration.invitationsBody")}</p>
										</div>
									</header>
									<div className="invitation-list">
										{data.invitations.length === 0 ? (
											<p className="ledger-empty">
												{t("collaboration.noInvitations")}
											</p>
										) : (
											data.invitations.map((invitation) => (
												<article className="invitation-row" key={invitation.id}>
													<header>
														<strong>{t(roleMessages[invitation.role])}</strong>
														<span
															className={`invitation-status invitation-status--${invitation.status}`}
														>
															{t(`collaboration.status.${invitation.status}`)}
														</span>
													</header>
													<p dir="auto">
														{invitation.scope.type === "workspace"
															? invitation.scope.workspaceName
															: invitation.scope.collections
																	.map(({ name }) => name)
																	.join(" · ")}
													</p>
													<small>
														{invitation.emailRestrictionEnabled &&
														invitation.invitedEmail
															? t("collaboration.restrictedTo", {
																	email: invitation.invitedEmail,
																})
															: t("collaboration.openLink")}
													</small>
													<small>
														{t("collaboration.expires", {
															date: formatDateTime(
																locale,
																invitation.expiresAt,
															),
														})}
													</small>
													{invitation.canRevoke ? (
														<button
															type="button"
															className="text-action text-action--danger"
															disabled={busy}
															onClick={() => {
																if (
																	!window.confirm(
																		t("collaboration.revokeConfirm"),
																	)
																)
																	return;
																void run(
																	() =>
																		api.revokeInvitation(
																			workspace.id,
																			invitation.id,
																		),
																	"collaboration.invitationRevoked",
																);
															}}
														>
															{t("collaboration.revoke")}
														</button>
													) : null}
												</article>
											))
										)}
									</div>
								</section>
							</div>
						) : null}
					</>
				) : null}

				{error && data ? (
					<p className="field-error" role="alert">
						{error}
					</p>
				) : null}
				{notice ? (
					<p className="collaboration-notice" role="status">
						{notice}
					</p>
				) : null}
			</div>
		</EditorDialog>
	);
}
