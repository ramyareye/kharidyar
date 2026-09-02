import type {
	CommentResource,
	ItemDiscussionResponse,
	ItemResource,
} from "@kharidyar/contracts";
import { formatDateTime } from "@kharidyar/i18n";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { useLocale } from "./locale-context";
import { PlanningApiError, type PlanningApi } from "./planning-api";
import { EditorDialog } from "./planning-forms";

function CommentComposer({
	busy,
	onSubmit,
	placeholder,
}: {
	busy: boolean;
	onSubmit: (body: string) => Promise<boolean>;
	placeholder: string;
}) {
	const { t } = useLocale();
	const [body, setBody] = useState("");

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!body.trim()) return;
		if (await onSubmit(body)) setBody("");
	}

	return (
		<form className="comment-composer" onSubmit={submit}>
			<label>
				<span className="sr-only">{placeholder}</span>
				<textarea
					value={body}
					maxLength={2_000}
					placeholder={placeholder}
					onChange={(event) => setBody(event.target.value)}
				/>
			</label>
			<button
				type="submit"
				className="button button--secondary"
				disabled={busy || !body.trim()}
			>
				{t("discussion.post")}
			</button>
		</form>
	);
}

function CommentCard({
	busy,
	comment,
	onEdit,
	onRemove,
	onResolve,
}: {
	busy: boolean;
	comment: CommentResource;
	onEdit: (commentId: string, body: string) => Promise<boolean>;
	onRemove: (commentId: string) => void;
	onResolve: (commentId: string, resolved: boolean) => void;
}) {
	const { locale, t } = useLocale();
	const [editing, setEditing] = useState(false);
	const [body, setBody] = useState(comment.body ?? "");

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!body.trim()) return;
		if (await onEdit(comment.id, body)) setEditing(false);
	}

	return (
		<article
			className={
				comment.resolvedAt
					? "comment-card comment-card--resolved"
					: "comment-card"
			}
		>
			<header>
				<span className="comment-card__avatar" aria-hidden="true">
					{comment.author.name.trim().charAt(0).toUpperCase() || "?"}
				</span>
				<div>
					<strong dir="auto">{comment.author.name}</strong>
					<small>{formatDateTime(locale, comment.createdAt)}</small>
				</div>
				{comment.resolvedAt ? (
					<span className="comment-card__resolved">
						{t("discussion.resolved")}
					</span>
				) : null}
			</header>

			{comment.removedAt ? (
				<p className="comment-card__removed">{t("discussion.removed")}</p>
			) : editing ? (
				<form className="comment-edit" onSubmit={submit}>
					<textarea
						autoFocus
						value={body}
						maxLength={2_000}
						onChange={(event) => setBody(event.target.value)}
					/>
					<div>
						<button
							type="button"
							className="text-action"
							onClick={() => setEditing(false)}
						>
							{t("common.cancel")}
						</button>
						<button
							type="submit"
							className="text-action"
							disabled={busy || !body.trim()}
						>
							{t("common.save")}
						</button>
					</div>
				</form>
			) : (
				<p dir="auto">{comment.body}</p>
			)}

			{comment.body && !editing ? (
				<footer>
					{comment.permissions.canEdit ? (
						<button
							type="button"
							className="text-action"
							disabled={busy}
							onClick={() => setEditing(true)}
						>
							{t("common.edit")}
						</button>
					) : null}
					{comment.permissions.canResolve ? (
						<button
							type="button"
							className="text-action"
							disabled={busy}
							onClick={() => onResolve(comment.id, !comment.resolvedAt)}
						>
							{comment.resolvedAt
								? t("discussion.reopen")
								: t("discussion.resolve")}
						</button>
					) : null}
					{comment.permissions.canRemove ? (
						<button
							type="button"
							className="text-action text-action--danger"
							disabled={busy}
							onClick={() => onRemove(comment.id)}
						>
							{t("discussion.remove")}
						</button>
					) : null}
				</footer>
			) : null}
		</article>
	);
}

function CommentThread({
	busy,
	comments,
	emptyLabel,
	onEdit,
	onRemove,
	onResolve,
}: {
	busy: boolean;
	comments: CommentResource[];
	emptyLabel: string;
	onEdit: (commentId: string, body: string) => Promise<boolean>;
	onRemove: (commentId: string) => void;
	onResolve: (commentId: string, resolved: boolean) => void;
}) {
	return comments.length > 0 ? (
		<div className="comment-thread">
			{comments.map((comment) => (
				<CommentCard
					busy={busy}
					comment={comment}
					key={comment.id}
					onEdit={onEdit}
					onRemove={onRemove}
					onResolve={onResolve}
				/>
			))}
		</div>
	) : (
		<p className="discussion-empty">{emptyLabel}</p>
	);
}

export function ItemDiscussionDialog({
	api,
	item,
	onClose,
}: {
	api: PlanningApi;
	item: ItemResource;
	onClose: () => void;
}) {
	const { locale, t } = useLocale();
	const [discussion, setDiscussion] = useState<ItemDiscussionResponse | null>(
		null,
	);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const explainError = useCallback(
		(value: unknown) => {
			if (value instanceof PlanningApiError) {
				if (value.code === "FORBIDDEN") return t("status.permissionDenied");
				if (value.code === "NOT_FOUND") return t("status.notFound");
				if (value.code === "RESOURCE_ARCHIVED") return t("status.archived");
			}
			return t("status.genericMutationError");
		},
		[t],
	);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			setDiscussion(await api.readItemDiscussion(item.id));
		} catch (value) {
			setError(explainError(value));
		} finally {
			setLoading(false);
		}
	}, [api, explainError, item.id]);

	useEffect(() => {
		void load();
	}, [load]);

	async function mutate(
		operation: () => Promise<ItemDiscussionResponse>,
	): Promise<boolean> {
		setBusy(true);
		setError(null);
		try {
			setDiscussion(await operation());
			return true;
		} catch (value) {
			setError(explainError(value));
			return false;
		} finally {
			setBusy(false);
		}
	}

	function remove(commentId: string) {
		if (!window.confirm(t("discussion.removeConfirm"))) return;
		void mutate(() => api.removeComment(item.id, commentId));
	}

	function resolve(commentId: string, resolved: boolean) {
		void mutate(() => api.resolveComment(item.id, commentId, { resolved }));
	}

	return (
		<EditorDialog
			busy={busy}
			description={t("discussion.description")}
			onClose={onClose}
			size="wide"
			title={t("discussion.title")}
		>
			<div className="discussion-board">
				<header className="discussion-board__item">
					<p className="eyebrow">{t("discussion.itemEyebrow")}</p>
					<h3 dir="auto">{item.title}</h3>
					{discussion && !discussion.permissions.isMutable ? (
						<span>{t("discussion.readOnly")}</span>
					) : null}
				</header>

				{loading ? (
					<p className="collaboration-state" role="status">
						{t("discussion.loading")}
					</p>
				) : error && !discussion ? (
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
				) : discussion ? (
					<>
						<section className="discussion-section discussion-section--item">
							<header>
								<span aria-hidden="true">01</span>
								<div>
									<h4>{t("discussion.itemThread")}</h4>
									<p>{t("discussion.itemThreadBody")}</p>
								</div>
							</header>
							<CommentThread
								busy={busy}
								comments={discussion.itemComments}
								emptyLabel={t("discussion.itemEmpty")}
								onEdit={(commentId, body) =>
									mutate(() => api.updateComment(item.id, commentId, { body }))
								}
								onRemove={remove}
								onResolve={resolve}
							/>
							{discussion.permissions.canComment ? (
								<CommentComposer
									busy={busy}
									placeholder={t("discussion.itemPlaceholder")}
									onSubmit={(body) =>
										mutate(() => api.createComment(item.id, { body }))
									}
								/>
							) : null}
						</section>

						<section className="discussion-section discussion-section--candidates">
							<header>
								<span aria-hidden="true">02</span>
								<div>
									<h4>{t("discussion.candidateThreads")}</h4>
									<p>{t("discussion.candidateThreadsBody")}</p>
								</div>
							</header>
							{discussion.candidates.length === 0 ? (
								<p className="discussion-empty">
									{t("discussion.noCandidates")}
								</p>
							) : (
								<div className="candidate-discussions">
									{discussion.candidates.map((candidate, index) => (
										<article
											className={
												candidate.archived
													? "candidate-discussion candidate-discussion--archived"
													: "candidate-discussion"
											}
											key={candidate.candidateId}
										>
											<header>
												<span>{String(index + 1).padStart(2, "0")}</span>
												<div>
													<h5 dir="auto">{candidate.productTitle}</h5>
													<small>
														{t("discussion.voteCount", {
															count: candidate.voteCount,
														})}
													</small>
												</div>
												{discussion.permissions.canVote &&
												!candidate.archived ? (
													<button
														type="button"
														className={
															candidate.currentUserVoted
																? "preference-button preference-button--active"
																: "preference-button"
														}
														aria-pressed={candidate.currentUserVoted}
														disabled={busy}
														title={candidate.voters
															.map(({ name }) => name)
															.join(", ")}
														onClick={() =>
															void mutate(() =>
																api.setCandidateVote(
																	item.id,
																	candidate.candidateId,
																	{
																		selected: !candidate.currentUserVoted,
																	},
																),
															)
														}
													>
														<span aria-hidden="true">◆</span>
														{candidate.currentUserVoted
															? t("discussion.preferred")
															: t("discussion.prefer")}
													</button>
												) : null}
											</header>
											{candidate.voters.length > 0 ? (
												<p className="candidate-voters">
													{t("discussion.preferredBy", {
														names: candidate.voters
															.map(({ name }) => name)
															.join(", "),
													})}
												</p>
											) : null}
											<CommentThread
												busy={busy}
												comments={candidate.comments}
												emptyLabel={t("discussion.candidateEmpty")}
												onEdit={(commentId, body) =>
													mutate(() =>
														api.updateComment(item.id, commentId, { body }),
													)
												}
												onRemove={remove}
												onResolve={resolve}
											/>
											{discussion.permissions.canComment &&
											!candidate.archived ? (
												<CommentComposer
													busy={busy}
													placeholder={t("discussion.candidatePlaceholder")}
													onSubmit={(body) =>
														mutate(() =>
															api.createComment(
																item.id,
																{ body },
																candidate.candidateId,
															),
														)
													}
												/>
											) : null}
										</article>
									))}
								</div>
							)}
						</section>
					</>
				) : null}
				{error && discussion ? (
					<p className="field-error" role="alert">
						{error}
					</p>
				) : null}
				{discussion ? (
					<footer className="discussion-board__note">
						{t("discussion.updated", {
							date: formatDateTime(locale, new Date()),
						})}
					</footer>
				) : null}
			</div>
		</EditorDialog>
	);
}
