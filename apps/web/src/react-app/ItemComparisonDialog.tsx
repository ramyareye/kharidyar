import type {
	CandidateComparison,
	CandidateCreateInput,
	CandidateUpdateInput,
	ItemComparisonResponse,
	ItemResource,
	MerchantInput,
	OfferFacts,
	OfferInput,
	OfferResource,
	PlannedSelectionInput,
	ProductUpdateInput,
	PurchaseRecordInput,
} from "@kharidyar/contracts";
import {
	formatDateTime,
	formatMoney,
	formatNumber,
	type MessageKey,
} from "@kharidyar/i18n";
import { useState, type FormEvent, type ReactNode } from "react";

import {
	euroInputFromMinor,
	parseEuroAmount,
} from "./collection-direction-state";
import { useLocale } from "./locale-context";
import {
	PlanningApiError,
	type PlanningApi,
} from "./planning-api";
import { EditorDialog } from "./planning-forms";

function optionalText(value: string): string | null {
	return value.trim() || null;
}

function positiveInteger(value: string): number | null {
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

function errorKey(error: unknown): MessageKey {
	if (error instanceof PlanningApiError) {
		if (error.code === "FORBIDDEN") return "status.permissionDenied";
		if (error.code === "NOT_FOUND") return "status.notFound";
		if (error.code === "RESOURCE_ARCHIVED") return "status.archived";
		if (error.code === "BAD_REQUEST") return "status.validation";
	}
	return "status.genericMutationError";
}

function CompactActions({ children }: { children: ReactNode }) {
	return <div className="commerce-actions">{children}</div>;
}

function CandidateForm({
	busy,
	comparison,
	onSubmit,
}: {
	busy: boolean;
	comparison: ItemComparisonResponse;
	onSubmit: (value: CandidateCreateInput) => Promise<boolean>;
}) {
	const { t } = useLocale();
	const [mode, setMode] = useState<"existing" | "new">("new");
	const [productId, setProductId] = useState("");
	const [title, setTitle] = useState("");
	const [brand, setBrand] = useState("");
	const [model, setModel] = useState("");
	const [category, setCategory] = useState("");
	const [quantity, setQuantity] = useState("1");
	const [notes, setNotes] = useState("");
	const [rank, setRank] = useState("");
	const [validation, setValidation] = useState<string | null>(null);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const parsedQuantity = positiveInteger(quantity);
		const parsedRank = rank.trim() ? Number(rank) : null;
		if (parsedQuantity === null) {
			setValidation(t("commerce.validation.quantity"));
			return;
		}
		if (
			(mode === "new" && !title.trim()) ||
			(mode === "existing" && !productId) ||
			(parsedRank !== null &&
				(!Number.isInteger(parsedRank) || parsedRank < 0 || parsedRank > 1_000))
		) {
			setValidation(t("commerce.validation.required"));
			return;
		}
		setValidation(null);
		const saved = await onSubmit({
			product:
				mode === "existing"
					? { kind: "existing", productId }
					: {
							kind: "new",
							value: {
								attributes: [],
								brand: optionalText(brand),
								category: optionalText(category),
								model: optionalText(model),
								title,
							},
						},
			plannedPurchaseQuantity: parsedQuantity,
			notes: optionalText(notes),
			rank: parsedRank,
		});
		if (saved) {
			setTitle("");
			setBrand("");
			setModel("");
			setCategory("");
			setNotes("");
			setRank("");
			setProductId("");
		}
	}

	return (
		<form className="commerce-form" onSubmit={submit} noValidate>
			<div className="commerce-choice" role="group">
				<button
					type="button"
					className={mode === "new" ? "group-chip group-chip--active" : "group-chip"}
					onClick={() => setMode("new")}
				>
					{t("commerce.newProduct")}
				</button>
				{comparison.catalogProducts.length > 0 ? (
					<button
						type="button"
						className={
							mode === "existing" ? "group-chip group-chip--active" : "group-chip"
						}
						onClick={() => setMode("existing")}
					>
						{t("commerce.existingProduct")}
					</button>
				) : null}
			</div>
			{mode === "existing" ? (
				<label className="field">
					<span className="field__label">{t("commerce.chooseProduct")}</span>
					<select value={productId} onChange={(event) => setProductId(event.target.value)}>
						<option value="">—</option>
						{comparison.catalogProducts.map((product) => (
							<option value={product.id} key={product.id}>
								{[product.brand, product.title].filter(Boolean).join(" · ")}
							</option>
						))}
					</select>
				</label>
			) : (
				<div className="commerce-form__grid">
					<label className="field commerce-form__wide">
						<span className="field__label">{t("commerce.productTitle")}</span>
						<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} />
					</label>
					<label className="field">
						<span className="field__label">{t("commerce.brand")}</span>
						<input value={brand} onChange={(event) => setBrand(event.target.value)} maxLength={160} />
					</label>
					<label className="field">
						<span className="field__label">{t("commerce.model")}</span>
						<input value={model} onChange={(event) => setModel(event.target.value)} maxLength={160} />
					</label>
					<label className="field commerce-form__wide">
						<span className="field__label">{t("commerce.category")}</span>
						<input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={120} />
					</label>
				</div>
			)}
			<div className="commerce-form__grid">
				<label className="field">
					<span className="field__label">{t("commerce.quantity")}</span>
					<input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
				</label>
				<label className="field">
					<span className="field__label">{t("commerce.rank")}</span>
					<input type="number" min="0" max="1000" step="1" value={rank} onChange={(event) => setRank(event.target.value)} />
				</label>
				<label className="field commerce-form__wide">
					<span className="field__label">{t("commerce.notes")}</span>
					<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={4_000} rows={2} />
				</label>
			</div>
			{validation ? <p className="field-error">{validation}</p> : null}
			<button type="submit" className="button button--secondary" disabled={busy}>
				{t("commerce.addCandidate")}
			</button>
		</form>
	);
}

function CandidateSettingsForm({
	busy,
	candidate,
	onSubmit,
}: {
	busy: boolean;
	candidate: CandidateComparison;
	onSubmit: (value: CandidateUpdateInput) => Promise<boolean>;
}) {
	const { t } = useLocale();
	const [quantity, setQuantity] = useState(String(candidate.plannedPurchaseQuantity));
	const [notes, setNotes] = useState(candidate.notes ?? "");
	const [rank, setRank] = useState(candidate.rank === null ? "" : String(candidate.rank));
	const [validation, setValidation] = useState<string | null>(null);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const parsedQuantity = positiveInteger(quantity);
		const parsedRank = rank.trim() ? Number(rank) : null;
		if (
			parsedQuantity === null ||
			(parsedRank !== null &&
				(!Number.isInteger(parsedRank) || parsedRank < 0 || parsedRank > 1_000))
		) {
			setValidation(t("commerce.validation.quantity"));
			return;
		}
		setValidation(null);
		await onSubmit({
			plannedPurchaseQuantity: parsedQuantity,
			notes: optionalText(notes),
			rank: parsedRank,
		});
	}

	return (
		<form className="commerce-form commerce-form--compact" onSubmit={submit}>
			<label className="field">
				<span className="field__label">{t("commerce.quantity")}</span>
				<input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
			</label>
			<label className="field">
				<span className="field__label">{t("commerce.rank")}</span>
				<input type="number" min="0" max="1000" step="1" value={rank} onChange={(event) => setRank(event.target.value)} />
			</label>
			<label className="field commerce-form__wide">
				<span className="field__label">{t("commerce.notes")}</span>
				<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={4_000} rows={2} />
			</label>
			{validation ? <p className="field-error commerce-form__wide">{validation}</p> : null}
			<button type="submit" className="button button--quiet" disabled={busy}>
				{t("common.save")}
			</button>
		</form>
	);
}

function ProductForm({
	busy,
	candidate,
	onSubmit,
}: {
	busy: boolean;
	candidate: CandidateComparison;
	onSubmit: (value: ProductUpdateInput) => Promise<boolean>;
}) {
	const { t } = useLocale();
	const [title, setTitle] = useState(candidate.product.title);
	const [brand, setBrand] = useState(candidate.product.brand ?? "");
	const [model, setModel] = useState(candidate.product.model ?? "");
	const [category, setCategory] = useState(candidate.product.category ?? "");

	return (
		<form
			className="commerce-form commerce-form--compact"
			onSubmit={(event) => {
				event.preventDefault();
				if (!title.trim()) return;
				void onSubmit({
					title,
					brand: optionalText(brand),
					model: optionalText(model),
					category: optionalText(category),
				});
			}}
		>
			<label className="field commerce-form__wide">
				<span className="field__label">{t("commerce.productTitle")}</span>
				<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} />
			</label>
			<label className="field">
				<span className="field__label">{t("commerce.brand")}</span>
				<input value={brand} onChange={(event) => setBrand(event.target.value)} maxLength={160} />
			</label>
			<label className="field">
				<span className="field__label">{t("commerce.model")}</span>
				<input value={model} onChange={(event) => setModel(event.target.value)} maxLength={160} />
			</label>
			<label className="field commerce-form__wide">
				<span className="field__label">{t("commerce.category")}</span>
				<input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={120} />
			</label>
			<button type="submit" className="button button--quiet" disabled={busy || !title.trim()}>
				{t("common.save")}
			</button>
		</form>
	);
}

function MerchantForm({
	busy,
	onSubmit,
}: {
	busy: boolean;
	onSubmit: (value: MerchantInput) => Promise<boolean>;
}) {
	const { t } = useLocale();
	const [name, setName] = useState("");
	const [salesChannel, setSalesChannel] = useState<MerchantInput["salesChannel"]>("online");
	const [websiteUrl, setWebsiteUrl] = useState("");
	const [notes, setNotes] = useState("");
	return (
		<form
			className="commerce-form"
			onSubmit={async (event) => {
				event.preventDefault();
				if (!name.trim()) return;
				const saved = await onSubmit({
					name,
					salesChannel,
					websiteUrl: optionalText(websiteUrl),
					notes: optionalText(notes),
				});
				if (saved) {
					setName("");
					setWebsiteUrl("");
					setNotes("");
				}
			}}
		>
			<div className="commerce-form__grid">
				<label className="field">
					<span className="field__label">{t("commerce.merchantName")}</span>
					<input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} />
				</label>
				<label className="field">
					<span className="field__label">{t("commerce.salesChannel")}</span>
					<select value={salesChannel} onChange={(event) => setSalesChannel(event.target.value as MerchantInput["salesChannel"])}>
						<option value="online">{t("commerce.channel.online")}</option>
						<option value="in_person">{t("commerce.channel.inPerson")}</option>
						<option value="both">{t("commerce.channel.both")}</option>
					</select>
				</label>
				<label className="field commerce-form__wide">
					<span className="field__label">{t("commerce.website")}</span>
					<input type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} maxLength={2_048} />
				</label>
				<label className="field commerce-form__wide">
					<span className="field__label">{t("commerce.notes")}</span>
					<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2_000} rows={2} />
				</label>
			</div>
			<button type="submit" className="button button--secondary" disabled={busy || !name.trim()}>
				{t("commerce.addMerchant")}
			</button>
		</form>
	);
}

interface OfferDraft {
	merchantId: string;
	sourceUrl: string;
	locale: string;
	priceKind: OfferFacts["priceKind"];
	price: string;
	shipping: string;
	shippingBasis: OfferFacts["shippingBasis"];
	availabilityState: OfferFacts["availabilityState"];
	availabilityChannel: string;
	availabilityLocation: string;
	availabilityVariant: string;
	availabilityNote: string;
}

function offerDraft(initial: OfferResource | undefined, merchantId: string): OfferDraft {
	return {
		merchantId: initial?.merchant.id ?? merchantId,
		sourceUrl: initial?.sourceUrl ?? "",
		locale: initial?.locale ?? "nl-NL",
		priceKind: initial?.facts.priceKind ?? "exact",
		price: euroInputFromMinor(initial?.facts.unitPriceMinor),
		shipping: euroInputFromMinor(initial?.facts.shippingMinor),
		shippingBasis: initial?.facts.shippingBasis ?? "unknown",
		availabilityState: initial?.facts.availabilityState ?? "unknown",
		availabilityChannel: initial?.facts.availabilityChannel ?? "",
		availabilityLocation: initial?.facts.availabilityLocation ?? "",
		availabilityVariant: initial?.facts.availabilityVariant ?? "",
		availabilityNote: initial?.facts.availabilityNote ?? "",
	};
}

function OfferForm({
	busy,
	initial,
	merchants,
	onSubmit,
}: {
	busy: boolean;
	initial?: OfferResource;
	merchants: ItemComparisonResponse["merchants"];
	onSubmit: (value: OfferInput) => Promise<boolean>;
}) {
	const { t } = useLocale();
	const [draft, setDraft] = useState(() => offerDraft(initial, merchants[0]?.id ?? ""));
	const [validation, setValidation] = useState<string | null>(null);
	function field<K extends keyof OfferDraft>(key: K, value: OfferDraft[K]) {
		setDraft((current) => ({ ...current, [key]: value }));
	}

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const price = parseEuroAmount(draft.price);
		const shipping = parseEuroAmount(draft.shipping);
		let url: URL | null = null;
		try {
			url = new URL(draft.sourceUrl);
		} catch {
			url = null;
		}
		if (!draft.merchantId || url?.protocol !== "https:") {
			setValidation(t("commerce.validation.url"));
			return;
		}
		if (
			!price.valid ||
			!shipping.valid ||
			(draft.priceKind !== "unknown" && price.minor === null) ||
			(shipping.minor !== null && draft.shippingBasis === "unknown")
		) {
			setValidation(t("commerce.validation.amount"));
			return;
		}
		const unitPriceMinor = draft.priceKind === "unknown" ? null : price.minor;
		const shippingBasis = shipping.minor === null ? "unknown" : draft.shippingBasis;
		setValidation(null);
		await onSubmit({
			merchantId: draft.merchantId,
			sourceUrl: draft.sourceUrl,
			locale: optionalText(draft.locale),
			facts: {
				priceKind: draft.priceKind,
				unitPriceMinor,
				currency:
					unitPriceMinor !== null || shipping.minor !== null ? "EUR" : null,
				shippingMinor: shipping.minor,
				shippingBasis,
				availabilityState: draft.availabilityState,
				availabilityChannel: optionalText(draft.availabilityChannel),
				availabilityLocation: optionalText(draft.availabilityLocation),
				availabilityVariant: optionalText(draft.availabilityVariant),
				availabilityNote: optionalText(draft.availabilityNote),
			},
		});
	}

	return (
		<form className="commerce-form" onSubmit={submit} noValidate>
			<div className="commerce-form__grid">
				<label className="field">
					<span className="field__label">{t("commerce.merchants")}</span>
					<select value={draft.merchantId} onChange={(event) => field("merchantId", event.target.value)}>
						<option value="">—</option>
						{merchants.map((merchant) => (
							<option value={merchant.id} key={merchant.id}>{merchant.name}</option>
						))}
					</select>
				</label>
				<label className="field">
					<span className="field__label">{t("commerce.locale")}</span>
					<input value={draft.locale} onChange={(event) => field("locale", event.target.value)} maxLength={35} />
				</label>
				<label className="field commerce-form__wide">
					<span className="field__label">{t("commerce.sourceUrl")}</span>
					<input type="url" value={draft.sourceUrl} onChange={(event) => field("sourceUrl", event.target.value)} maxLength={2_048} />
				</label>
				<label className="field">
					<span className="field__label">{t("commerce.priceKind")}</span>
					<select value={draft.priceKind} onChange={(event) => field("priceKind", event.target.value as OfferDraft["priceKind"])}>
						<option value="exact">{t("commerce.priceKind.exact")}</option>
						<option value="starting_at">{t("commerce.priceKind.starting_at")}</option>
						<option value="unknown">{t("commerce.priceKind.unknown")}</option>
					</select>
				</label>
				<label className="field">
					<span className="field__label">{t("commerce.price")}</span>
					<input inputMode="decimal" value={draft.price} disabled={draft.priceKind === "unknown"} onChange={(event) => field("price", event.target.value)} />
				</label>
				<label className="field">
					<span className="field__label">{t("commerce.shipping")}</span>
					<input inputMode="decimal" value={draft.shipping} onChange={(event) => field("shipping", event.target.value)} />
				</label>
				<label className="field">
					<span className="field__label">{t("commerce.shippingBasis")}</span>
					<select value={draft.shippingBasis} onChange={(event) => field("shippingBasis", event.target.value as OfferDraft["shippingBasis"])}>
						<option value="unknown">{t("commerce.shippingBasis.unknown")}</option>
						<option value="per_line">{t("commerce.shippingBasis.per_line")}</option>
						<option value="per_unit">{t("commerce.shippingBasis.per_unit")}</option>
					</select>
				</label>
				<label className="field">
					<span className="field__label">{t("commerce.availability")}</span>
					<select value={draft.availabilityState} onChange={(event) => field("availabilityState", event.target.value as OfferDraft["availabilityState"])}>
						<option value="available">{t("commerce.availability.available")}</option>
						<option value="unavailable">{t("commerce.availability.unavailable")}</option>
						<option value="unknown">{t("commerce.availability.unknown")}</option>
					</select>
				</label>
				<label className="field">
					<span className="field__label">{t("commerce.availabilityChannel")}</span>
					<input value={draft.availabilityChannel} onChange={(event) => field("availabilityChannel", event.target.value)} maxLength={80} />
				</label>
				<label className="field">
					<span className="field__label">{t("commerce.availabilityLocation")}</span>
					<input value={draft.availabilityLocation} onChange={(event) => field("availabilityLocation", event.target.value)} maxLength={160} />
				</label>
				<label className="field">
					<span className="field__label">{t("commerce.availabilityVariant")}</span>
					<input value={draft.availabilityVariant} onChange={(event) => field("availabilityVariant", event.target.value)} maxLength={160} />
				</label>
				<label className="field commerce-form__wide">
					<span className="field__label">{t("commerce.availabilityNote")}</span>
					<textarea value={draft.availabilityNote} onChange={(event) => field("availabilityNote", event.target.value)} maxLength={1_000} rows={2} />
				</label>
			</div>
			{validation ? <p className="field-error">{validation}</p> : null}
			<button type="submit" className="button button--secondary" disabled={busy || merchants.length === 0}>
				{initial ? t("commerce.saveOffer") : t("commerce.addOffer")}
			</button>
		</form>
	);
}

function PlanControl({
	busy,
	candidate,
	offerId,
	onSubmit,
}: {
	busy: boolean;
	candidate: CandidateComparison;
	offerId: string | null;
	onSubmit: (value: PlannedSelectionInput) => Promise<boolean>;
}) {
	const { t } = useLocale();
	const [quantity, setQuantity] = useState(String(candidate.plannedPurchaseQuantity));
	const selected = candidate.isPlanned && candidate.plannedOfferId === offerId;
	return (
		<form
			className="plan-control"
			onSubmit={(event) => {
				event.preventDefault();
				const parsed = positiveInteger(quantity);
				if (parsed === null) return;
				void onSubmit({
					candidateId: candidate.id,
					offerId,
					plannedPurchaseQuantity: parsed,
				});
			}}
		>
			<input aria-label={t("commerce.quantity")} type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
			<button type="submit" className={selected ? "button button--primary" : "button button--quiet"} disabled={busy || selected}>
				{selected ? t("commerce.planned") : offerId ? t("commerce.planOffer") : t("commerce.planCandidate")}
			</button>
		</form>
	);
}

function PurchaseForm({
	busy,
	candidate,
	offer,
	onSubmit,
}: {
	busy: boolean;
	candidate: CandidateComparison;
	offer: OfferResource;
	onSubmit: (value: PurchaseRecordInput) => Promise<boolean>;
}) {
	const { t } = useLocale();
	const remaining = Math.max(1, candidate.plannedPurchaseQuantity - candidate.purchasedQuantity);
	const [quantity, setQuantity] = useState(String(remaining));
	const [price, setPrice] = useState(euroInputFromMinor(offer.facts.unitPriceMinor));
	const [shipping, setShipping] = useState(euroInputFromMinor(offer.facts.shippingMinor));
	const [shippingBasis, setShippingBasis] = useState(offer.facts.shippingBasis);
	const [note, setNote] = useState("");
	const [validation, setValidation] = useState<string | null>(null);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const parsedQuantity = positiveInteger(quantity);
		const parsedPrice = parseEuroAmount(price);
		const parsedShipping = parseEuroAmount(shipping);
		if (parsedQuantity === null) {
			setValidation(t("commerce.validation.quantity"));
			return;
		}
		if (!parsedPrice.valid || parsedPrice.minor === null || !parsedShipping.valid) {
			setValidation(t("commerce.validation.amount"));
			return;
		}
		setValidation(null);
		await onSubmit({
			candidateId: candidate.id,
			offerId: offer.id,
			purchasedQuantity: parsedQuantity,
			unitPriceMinor: parsedPrice.minor,
			currency: "EUR",
			shippingMinor: parsedShipping.minor,
			shippingBasis: parsedShipping.minor === null ? "unknown" : shippingBasis,
			note: optionalText(note),
		});
	}

	return (
		<form className="commerce-form commerce-form--purchase" onSubmit={submit}>
			<div className="commerce-form__grid">
				<label className="field">
					<span className="field__label">{t("commerce.purchaseQuantity")}</span>
					<input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
				</label>
				<label className="field">
					<span className="field__label">{t("commerce.price")}</span>
					<input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
				</label>
				<label className="field">
					<span className="field__label">{t("commerce.shipping")}</span>
					<input inputMode="decimal" value={shipping} onChange={(event) => setShipping(event.target.value)} />
				</label>
				<label className="field">
					<span className="field__label">{t("commerce.shippingBasis")}</span>
					<select value={shippingBasis} onChange={(event) => setShippingBasis(event.target.value as OfferFacts["shippingBasis"])}>
						<option value="unknown">{t("commerce.shippingBasis.unknown")}</option>
						<option value="per_line">{t("commerce.shippingBasis.per_line")}</option>
						<option value="per_unit">{t("commerce.shippingBasis.per_unit")}</option>
					</select>
				</label>
				<label className="field commerce-form__wide">
					<span className="field__label">{t("commerce.purchaseNote")}</span>
					<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1_000} rows={2} />
				</label>
			</div>
			{validation ? <p className="field-error">{validation}</p> : null}
			<button type="submit" className="button button--light" disabled={busy}>
				{t("commerce.recordPurchase")}
			</button>
		</form>
	);
}

function OfferCost({
	offer,
}: {
	offer: CandidateComparison["offers"][number];
}) {
	const { locale, t } = useLocale();
	const { plannedCost } = offer;
	if (plannedCost.totalMinor === null || plannedCost.currency === null) {
		return <strong>{t("commerce.incomplete")}</strong>;
	}
	const amount = formatMoney(locale, plannedCost.totalMinor, plannedCost.currency);
	return (
		<strong>
			{plannedCost.status === "lower_bound"
				? t("commerce.lowerBound", { amount })
				: t("commerce.total", { amount })}
		</strong>
	);
}

export function ItemComparisonDialog({
	api,
	comparison,
	error,
	item,
	loading,
	onChange,
	onClose,
}: {
	api: PlanningApi;
	comparison: ItemComparisonResponse | null;
	error: string | null;
	item: ItemResource;
	loading: boolean;
	onChange: (value: ItemComparisonResponse, toast: string) => void;
	onClose: () => void;
}) {
	const { locale, t } = useLocale();
	const [busy, setBusy] = useState(false);
	const [mutationError, setMutationError] = useState<string | null>(null);

	async function mutate(
		operation: () => Promise<ItemComparisonResponse>,
		message: MessageKey,
	): Promise<boolean> {
		setBusy(true);
		setMutationError(null);
		try {
			const value = await operation();
			onChange(value, t(message));
			return true;
		} catch (caught) {
			setMutationError(t(errorKey(caught)));
			return false;
		} finally {
			setBusy(false);
		}
	}

	const planned = comparison?.candidates.find((candidate) => candidate.isPlanned);

	return (
		<EditorDialog busy={busy} description={t("commerce.description")} onClose={onClose} size="wide" title={`${t("commerce.title")} · ${item.title}`}>
			<div className="commerce-dialog">
				{error || mutationError ? <p className="field-error" role="alert">{error ?? mutationError}</p> : null}
				{loading || comparison === null ? (
					<p className="commerce-loading">{t("commerce.loading")}</p>
				) : (
					<>
						<header className="commerce-toolbar">
							<div>
								<span>{formatNumber(locale, comparison.candidates.filter((candidate) => !candidate.archivedAt).length)}</span>
								<strong>{t("commerce.candidate")}</strong>
							</div>
							{planned && comparison.permissions.canManageCandidates ? (
								<button type="button" className="button button--quiet" disabled={busy} onClick={() => void mutate(() => api.changePlannedSelection(item.id, { candidateId: null, offerId: null, plannedPurchaseQuantity: null }), "commerce.toast.plan")}>
									{t("commerce.clearPlan")}
								</button>
							) : null}
						</header>

						{comparison.permissions.canManageOffers ? (
							<details className="commerce-disclosure">
								<summary>{t("commerce.addMerchant")}</summary>
								<MerchantForm busy={busy} onSubmit={(value) => mutate(() => api.createMerchant(item.id, value), "commerce.toast.merchant")} />
							</details>
						) : null}
						{comparison.permissions.canManageCandidates ? (
							<details className="commerce-disclosure">
								<summary>{t("commerce.addCandidate")}</summary>
								<CandidateForm busy={busy} comparison={comparison} onSubmit={(value) => mutate(() => api.createCandidate(item.id, value), "commerce.toast.candidate")} />
							</details>
						) : null}

						{comparison.candidates.length === 0 ? (
							<p className="commerce-empty">{t("commerce.empty")}</p>
						) : (
							<div className="candidate-comparison">
								{comparison.candidates.map((candidate, index) => {
									const plannedOffer = candidate.offers.find((offer) => offer.id === candidate.plannedOfferId);
									return (
										<article className={candidate.archivedAt ? "candidate-card candidate-card--archived" : candidate.isPlanned ? "candidate-card candidate-card--planned" : "candidate-card"} key={candidate.id}>
											<header className="candidate-card__header">
												<span className="candidate-card__index">{String(index + 1).padStart(2, "0")}</span>
												<div>
													<p>{candidate.product.brand ?? candidate.product.category ?? t("commerce.candidate")}</p>
													<h3 dir="auto">{candidate.product.title}</h3>
													{candidate.product.model ? <span dir="auto">{candidate.product.model}</span> : null}
												</div>
												{candidate.isPlanned ? <strong className="commerce-badge commerce-badge--planned">{t("commerce.planned")}</strong> : null}
											</header>
											<div className="candidate-card__meta">
												<span>{t("commerce.quantity")}: {formatNumber(locale, candidate.plannedPurchaseQuantity)}</span>
												<span>{t("commerce.purchasedToDate", { quantity: formatNumber(locale, candidate.purchasedQuantity) })}</span>
											</div>
											{candidate.notes ? <p className="candidate-card__notes" dir="auto">{candidate.notes}</p> : null}
											<CompactActions>
												{comparison.permissions.canManageCandidates && !candidate.archivedAt ? <details><summary>{t("commerce.editCandidate")}</summary><CandidateSettingsForm busy={busy} candidate={candidate} onSubmit={(value) => mutate(() => api.updateCandidate(item.id, candidate.id, value), "commerce.toast.candidate")} /></details> : null}
												{comparison.permissions.canManageProducts && !candidate.archivedAt ? <details><summary>{t("commerce.editProduct")}</summary><ProductForm busy={busy} candidate={candidate} onSubmit={(value) => mutate(() => api.updateCandidateProduct(item.id, candidate.id, value), "commerce.toast.product")} /></details> : null}
												{comparison.permissions.canArchiveCandidates ? <button type="button" className="text-action" disabled={busy || candidate.isPlanned} onClick={() => void mutate(() => candidate.archivedAt ? api.restoreCandidate(item.id, candidate.id) : api.archiveCandidate(item.id, candidate.id), "commerce.toast.candidate")}>{candidate.archivedAt ? t("commerce.restoreCandidate") : t("commerce.archiveCandidate")}</button> : null}
											</CompactActions>

											<section className="offer-list">
												<header><h4>{t("commerce.offers")}</h4><span>{formatNumber(locale, candidate.offers.length)}</span></header>
												{candidate.offers.length === 0 ? <p>{t("commerce.noOffers")}</p> : candidate.offers.map((offer) => (
													<article className={offer.id === candidate.plannedOfferId ? "offer-card offer-card--planned" : "offer-card"} key={offer.id}>
														<header>
															<div><strong dir="auto">{offer.merchant.name}</strong><a href={offer.sourceUrl} target="_blank" rel="noreferrer">↗</a></div>
															<span className={`commerce-badge commerce-badge--${offer.freshness}`}>{t(`commerce.${offer.freshness}`)}</span>
														</header>
												<div className="offer-card__facts">
													<span>{t(`commerce.priceKind.${offer.facts.priceKind}`)}</span>
													<span>{offer.facts.unitPriceMinor !== null && offer.facts.currency ? t("commerce.unitPrice", { amount: formatMoney(locale, offer.facts.unitPriceMinor, offer.facts.currency) }) : t("commerce.priceKind.unknown")}</span>
													<span className={`commerce-availability commerce-availability--${offer.facts.availabilityState}`}>{t(`commerce.availability.${offer.facts.availabilityState}`)}</span>
													<span>{offer.facts.shippingMinor !== null && offer.facts.currency ? t("commerce.shippingSummary", { amount: formatMoney(locale, offer.facts.shippingMinor, offer.facts.currency), basis: t(`commerce.shippingBasis.${offer.facts.shippingBasis}`) }) : t("commerce.shippingUnknown")}</span>
													<OfferCost offer={offer} />
												</div>
												{offer.facts.availabilityChannel || offer.facts.availabilityLocation || offer.facts.availabilityVariant || offer.facts.availabilityNote ? (
													<dl className="offer-card__qualifiers">
														{offer.facts.availabilityChannel ? <div><dt>{t("commerce.availabilityChannel")}</dt><dd dir="auto">{offer.facts.availabilityChannel}</dd></div> : null}
														{offer.facts.availabilityLocation ? <div><dt>{t("commerce.availabilityLocation")}</dt><dd dir="auto">{offer.facts.availabilityLocation}</dd></div> : null}
														{offer.facts.availabilityVariant ? <div><dt>{t("commerce.availabilityVariant")}</dt><dd dir="auto">{offer.facts.availabilityVariant}</dd></div> : null}
														{offer.facts.availabilityNote ? <div><dt>{t("commerce.availabilityNote")}</dt><dd dir="auto">{offer.facts.availabilityNote}</dd></div> : null}
													</dl>
												) : null}
												<p>{t("commerce.lastChecked", { date: formatDateTime(locale, offer.lastCheckedAt) })} · {t("commerce.priceChecks", { count: formatNumber(locale, offer.priceChecks.length) })}</p>
														{comparison.permissions.canManageCandidates && !candidate.archivedAt && !offer.archivedAt ? <PlanControl busy={busy} candidate={candidate} offerId={offer.id} onSubmit={(value) => mutate(() => api.changePlannedSelection(item.id, value), "commerce.toast.plan")} /> : null}
														{comparison.permissions.canManageOffers && !candidate.archivedAt && !offer.archivedAt ? <details className="commerce-disclosure commerce-disclosure--nested"><summary>{t("commerce.editOffer")}</summary><OfferForm busy={busy} initial={offer} merchants={comparison.merchants} onSubmit={(value) => mutate(() => api.updateOffer(item.id, candidate.id, offer.id, value), "commerce.toast.offer")} /></details> : null}
													</article>
												))}
												{comparison.permissions.canManageCandidates && !candidate.archivedAt ? <PlanControl busy={busy} candidate={candidate} offerId={null} onSubmit={(value) => mutate(() => api.changePlannedSelection(item.id, value), "commerce.toast.plan")} /> : null}
												{comparison.permissions.canManageOffers && !candidate.archivedAt ? <details className="commerce-disclosure commerce-disclosure--nested"><summary>{t("commerce.addOffer")}</summary>{comparison.merchants.length === 0 ? <p>{t("commerce.addMerchant")}</p> : <OfferForm busy={busy} merchants={comparison.merchants} onSubmit={(value) => mutate(() => api.createOffer(item.id, candidate.id, value), "commerce.toast.offer")} />}</details> : null}
											</section>
											{candidate.isPlanned && plannedOffer && comparison.permissions.canRecordPurchase ? <details className="purchase-disclosure"><summary>{t("commerce.purchase")}</summary><PurchaseForm busy={busy} candidate={candidate} offer={plannedOffer} onSubmit={(value) => mutate(() => api.recordPurchase(item.id, value), "commerce.toast.purchase")} /></details> : null}
										</article>
									);
								})}
							</div>
						)}
					</>
				)}
			</div>
		</EditorDialog>
	);
}
