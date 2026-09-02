import {
	importProposalSchema,
	type ImportProposal,
	type ImportProposalLine,
	type ImportReconciliation,
	type ImportSourceKind,
	type ImportWarning,
} from "@kharidyar/contracts";

export const importParserVersion = "deterministic-v1";

export class ImportParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ImportParseError";
	}
}

export interface ReviewedImportProposal {
	proposal: ImportProposal;
	warnings: ImportWarning[];
	reconciliations: ImportReconciliation[];
}

const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const arabicDigits = "٠١٢٣٤٥٦٧٨٩";
const numberWords = new Map<string, number>([
	["one", 1],
	["two", 2],
	["three", 3],
	["four", 4],
	["five", 5],
	["six", 6],
	["seven", 7],
	["eight", 8],
	["nine", 9],
	["ten", 10],
	["یک", 1],
	["دو", 2],
	["سه", 3],
	["چهار", 4],
	["پنج", 5],
	["شش", 6],
	["هفت", 7],
	["هشت", 8],
	["نه", 9],
	["ده", 10],
]);

function asciiDigits(value: string): string {
	return [...value]
		.map((character) => {
			const persianIndex = persianDigits.indexOf(character);
			if (persianIndex >= 0) return String(persianIndex);
			const arabicIndex = arabicDigits.indexOf(character);
			return arabicIndex >= 0 ? String(arabicIndex) : character;
		})
		.join("");
}

function compact(value: string): string {
	return value.replace(/\s+/gu, " ").trim();
}

function withoutMarkdown(value: string): string {
	return compact(
		value
			.replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
			.replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
			.replace(/[*_`~]/gu, ""),
	);
}

function splitMarkdownRow(value: string): string[] {
	const row = value.trim().replace(/^\|/u, "").replace(/\|$/u, "");
	const cells: string[] = [];
	let current = "";
	let escaped = false;
	for (const character of row) {
		if (escaped) {
			current += character;
			escaped = false;
			continue;
		}
		if (character === "\\") {
			escaped = true;
			continue;
		}
		if (character === "|") {
			cells.push(current.trim());
			current = "";
			continue;
		}
		current += character;
	}
	cells.push(current.trim());
	return cells;
}

function isTableDivider(value: string): boolean {
	return splitMarkdownRow(value).every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function firstHttpsLink(
	value: string,
): { title: string | null; url: string } | null {
	const markdown = /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/iu.exec(value);
	if (markdown) return { title: compact(markdown[1]!), url: markdown[2]! };
	const plain = /https:\/\/[^\s)>]+/iu.exec(value);
	return plain ? { title: null, url: plain[0] } : null;
}

function sourceKind(url: string): ImportSourceKind {
	const parsed = new URL(url);
	const path = parsed.pathname.toLowerCase();
	const query = parsed.search.toLowerCase();
	if (
		/\/(search|zoeken|zoek)(\/|$)/u.test(path) ||
		/[?&](q|query|search)=/u.test(query)
	) {
		return "search";
	}
	if (/\/(cat|category|categories|collectie|collection)(\/|$)/u.test(path)) {
		return "category";
	}
	if (/\/(p|product|products)\//u.test(path)) return "product";
	if (query.length > 0 || path.endsWith("/products")) return "listing";
	return "unknown";
}

function merchantName(url: string): string {
	const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./u, "");
	if (hostname.includes("ikea.")) return "IKEA";
	if (hostname.includes("jysk.")) return "JYSK";
	const token = hostname.split(".")[0] ?? hostname;
	return token
		.split(/[-_]/u)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ")
		.slice(0, 160);
}

function priceTokenToMinor(token: string): number | null {
	let normalized = asciiDigits(token).replace(/\s/gu, "");
	if (normalized.includes(",") && normalized.includes(".")) {
		const finalComma = normalized.lastIndexOf(",");
		const finalDot = normalized.lastIndexOf(".");
		const decimal = finalComma > finalDot ? "," : ".";
		normalized = normalized
			.replace(decimal === "," ? /\./gu : /,/gu, "")
			.replace(decimal, ".");
	} else if (normalized.includes(",")) {
		const trailing = normalized.length - normalized.lastIndexOf(",") - 1;
		normalized =
			trailing === 2
				? normalized.replace(",", ".")
				: normalized.replace(/,/gu, "");
	} else if (normalized.includes(".")) {
		const trailing = normalized.length - normalized.lastIndexOf(".") - 1;
		if (trailing !== 2) normalized = normalized.replace(/\./gu, "");
	}
	const amount = Number(normalized);
	if (!Number.isFinite(amount) || amount < 0) return null;
	return Math.round(amount * 100);
}

function parsePrice(value: string): {
	minor: number | null;
	priceKind: "exact" | "starting_at" | "unknown";
} {
	const normalized = asciiDigits(withoutMarkdown(value));
	const match = /(?:€|EUR\s*)([0-9][0-9.,\s]*)/iu.exec(normalized);
	if (!match) return { minor: null, priceKind: "unknown" };
	return {
		minor: priceTokenToMinor(match[1]!),
		priceKind: /\bfrom\b|\bstarting\b|از\s/iu.test(normalized)
			? "starting_at"
			: "exact",
	};
}

function explicitQuantity(value: string): number | null {
	const normalized = asciiDigits(value);
	const match = /(?:×|\bx)\s*(\d{1,4})\b/iu.exec(normalized);
	if (!match) return null;
	const quantity = Number(match[1]);
	return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
}

function numberInText(value: string): number | null {
	const normalized = asciiDigits(value.toLowerCase());
	const digit = /\b(\d{1,4})\b/u.exec(normalized);
	if (digit) return Number(digit[1]);
	for (const [word, number] of numberWords) {
		if (new RegExp(`(?:^|\\s)${word}(?:\\s|$)`, "u").test(normalized))
			return number;
	}
	return null;
}

function futureQuantity(
	value: string,
): { note: string; quantity: number } | null {
	const marker = /\b(?:later|future|eventually)\b|بعداً|بعدا|آینده/iu.exec(
		value,
	);
	if (!marker) return null;
	const afterMarker = value.slice(marker.index);
	const nearbyBefore = value.slice(
		Math.max(0, marker.index - 40),
		marker.index,
	);
	const note = compact(value.slice(Math.max(0, marker.index - 40)));
	const quantity = numberInText(afterMarker) ?? numberInText(nearbyBefore);
	return quantity && quantity > 0
		? { note: note.slice(0, 500), quantity }
		: null;
}

function cleanTitle(value: string): string {
	return withoutMarkdown(asciiDigits(value))
		.replace(/\s*(?:×|\bx)\s*\d{1,4}\b/giu, "")
		.trim()
		.slice(0, 200);
}

function findColumn(
	headers: string[],
	patterns: RegExp[],
	fallback: number,
): number {
	const found = headers.findIndex((header) =>
		patterns.some((pattern) => pattern.test(header)),
	);
	return found >= 0 ? found : fallback;
}

function looksQualifiedAvailability(value: string): boolean {
	return /branch|store|location|variant|size|colour|color|شعبه|فروشگاه|سایز|رنگ/iu.test(
		value,
	);
}

function lineFromCells(input: {
	cells: string[];
	groupLabel: string | null;
	headers: string[];
	index: number;
}): ImportProposalLine | null {
	const titleIndex = findColumn(
		input.headers,
		[/product/u, /item/u, /name/u, /محصول/u, /کالا/u],
		0,
	);
	let priceIndex = findColumn(
		input.headers,
		[/price/u, /cost/u, /قیمت/u, /هزینه/u],
		1,
	);
	let noteIndex = findColumn(
		input.headers,
		[/use/u, /note/u, /detail/u, /کاربرد/u, /یادداشت/u, /توضیح/u],
		2,
	);
	if (priceIndex === titleIndex && input.cells.length > 1) priceIndex = 1;
	if (
		(noteIndex === titleIndex || noteIndex === priceIndex) &&
		input.cells.length > 2
	)
		noteIndex = 2;
	const titleCell = input.cells[titleIndex] ?? "";
	const title = cleanTitle(titleCell);
	if (!title || /^[-–—]+$/u.test(title)) return null;

	const note = compact(withoutMarkdown(input.cells[noteIndex] ?? ""));
	const link =
		firstHttpsLink(titleCell) ?? firstHttpsLink(input.cells.join(" "));
	const quantity = explicitQuantity(titleCell) ?? 1;
	const quantityOrigin = explicitQuantity(titleCell) ? "source" : "inferred";
	const parsedPrice = parsePrice(input.cells[priceIndex] ?? "");
	const suppliedLineTotal =
		quantity > 1 && parsedPrice.minor !== null
			? { minor: parsedPrice.minor, currency: "EUR" as const }
			: null;
	const unitPriceMinor = suppliedLineTotal
		? Math.round(suppliedLineTotal.minor / quantity)
		: parsedPrice.minor;
	const kind = link ? sourceKind(link.url) : null;
	const canCreateOffer = link !== null && kind === "product";
	const availabilityNote = looksQualifiedAvailability(note)
		? note.slice(0, 1_000)
		: null;
	const source = link
		? { kind: kind!, title: link.title, url: link.url }
		: null;
	const offer = canCreateOffer
		? {
				merchant: {
					name: merchantName(link.url),
					salesChannel: "both" as const,
					websiteUrl: new URL(link.url).origin,
					notes: null,
				},
				sourceUrl: link.url,
				locale: "nl-NL",
				facts: {
					priceKind: parsedPrice.priceKind,
					unitPriceMinor,
					currency: unitPriceMinor === null ? null : "EUR",
					shippingMinor: null,
					shippingBasis: "unknown" as const,
					availabilityState: "unknown" as const,
					availabilityChannel: availabilityNote ? "qualified" : null,
					availabilityLocation: null,
					availabilityVariant: null,
					availabilityNote,
				},
				observedAt: null,
			}
		: null;

	return {
		key: `line-${String(input.index).padStart(3, "0")}`,
		groupLabel: input.groupLabel,
		item: {
			title,
			description: null,
			requirements: null,
			quantityNeeded: quantity,
			quantityOrigin,
		},
		futureQuantity: futureQuantity(note),
		product: {
			title: title.slice(0, 240),
			brand: null,
			model: null,
			category: null,
			attributes: [],
		},
		candidate: {
			plannedPurchaseQuantity: quantity,
			quantityOrigin,
			notes: note || null,
		},
		source,
		offer,
		suppliedLineTotal,
		exclusions: [],
		unmappedFacts: [],
	};
}

function parseSummary(value: string, groupLabel: string | null, index: number) {
	if (!/\b(?:total|subtotal|sum)\b|جمع/iu.test(value)) return null;
	const price = parsePrice(value);
	if (price.minor === null) return null;
	return {
		key: `summary-${String(index).padStart(3, "0")}`,
		groupLabel: /\b(?:overall|grand total)\b|جمع\s+کل/iu.test(value)
			? null
			: groupLabel,
		label: withoutMarkdown(value).slice(0, 240),
		amount: { minor: price.minor, currency: "EUR" as const },
	};
}

function parseMarkdown(rawInput: string): ImportProposal {
	const rows = rawInput.replace(/\r\n?/gu, "\n").split("\n");
	const lines: ImportProposalLine[] = [];
	const summaryTotals: ImportProposal["summaryTotals"] = [];
	const exclusions: string[] = [];
	const unmappedFacts: string[] = [];
	let groupLabel: string | null = null;
	let tableHeaders: string[] | null = null;
	let waitingForDivider = false;

	for (let index = 0; index < rows.length; index += 1) {
		const row = rows[index]!.trim();
		if (!row) continue;
		const heading = /^#{2,6}\s+(.+)$/u.exec(row);
		if (heading) {
			groupLabel = withoutMarkdown(heading[1]!).slice(0, 80) || null;
			tableHeaders = null;
			waitingForDivider = false;
			continue;
		}

		if (row.includes("|") && !isTableDivider(row)) {
			if (tableHeaders === null) {
				tableHeaders = splitMarkdownRow(row).map((cell) =>
					withoutMarkdown(cell).toLowerCase(),
				);
				waitingForDivider = true;
				continue;
			}
			const cells = splitMarkdownRow(row);
			const line = lineFromCells({
				cells,
				groupLabel,
				headers: tableHeaders,
				index: lines.length + 1,
			});
			if (line) lines.push(line);
			else unmappedFacts.push(withoutMarkdown(row).slice(0, 1_000));
			waitingForDivider = false;
			continue;
		}
		if (waitingForDivider && isTableDivider(row)) {
			waitingForDivider = false;
			continue;
		}
		if (isTableDivider(row)) continue;
		tableHeaders = null;
		waitingForDivider = false;

		const summaries = row
			.split(/؛|[.](?=\s|$)/u)
			.map((part) => parseSummary(part, groupLabel, summaryTotals.length + 1))
			.filter(
				(summary): summary is NonNullable<typeof summary> => summary !== null,
			);
		if (summaries.length > 0) {
			for (const summary of summaries) {
				summaryTotals.push({
					...summary,
					key: `summary-${String(summaryTotals.length + 1).padStart(3, "0")}`,
				});
			}
			continue;
		}
		const fact = withoutMarkdown(row.replace(/^[-*+]\s+/u, "")).slice(0, 1_000);
		if (/not included|excluding|excluded|حساب نشده|بدون/iu.test(fact)) {
			exclusions.push(fact);
		} else if (fact) {
			unmappedFacts.push(fact);
		}
	}

	return importProposalSchema.parse({
		schemaVersion: "1",
		lines: lines.slice(0, 100),
		summaryTotals: summaryTotals.slice(0, 30),
		exclusions: exclusions.slice(0, 50),
		unmappedFacts: unmappedFacts.slice(0, 100),
	});
}

function reconciliationFor(
	proposal: ImportProposal,
	summary: ImportProposal["summaryTotals"][number],
): ImportReconciliation {
	const included = proposal.lines.filter((line) =>
		summary.groupLabel === null ? true : line.groupLabel === summary.groupLabel,
	);
	let computedMinor = 0;
	let complete = included.length > 0;
	for (const line of included) {
		const facts = line.offer?.facts;
		if (
			!facts ||
			facts.unitPriceMinor === null ||
			facts.currency !== summary.amount.currency ||
			facts.priceKind !== "exact"
		) {
			complete = false;
			continue;
		}
		computedMinor +=
			facts.unitPriceMinor * line.candidate.plannedPurchaseQuantity;
	}
	const differenceMinor = computedMinor - summary.amount.minor;
	return {
		summaryKey: summary.key,
		status: complete
			? differenceMinor === 0
				? "matched"
				: "mismatch"
			: "incomplete",
		supplied: summary.amount,
		computedMinor,
		differenceMinor,
	};
}

export function reviewImportProposal(
	value: ImportProposal,
): ReviewedImportProposal {
	const proposal = importProposalSchema.parse(value);
	const warnings: ImportWarning[] = [];
	for (const line of proposal.lines) {
		if (
			line.item.quantityOrigin === "inferred" ||
			line.candidate.quantityOrigin === "inferred"
		) {
			warnings.push({
				code: "inferred_quantity",
				severity: "info",
				lineKey: line.key,
				detail: null,
			});
		}
		if (
			line.suppliedLineTotal !== null &&
			line.candidate.plannedPurchaseQuantity > 1
		) {
			warnings.push({
				code: "inferred_unit_price",
				severity: "warning",
				lineKey: line.key,
				detail: null,
			});
		}
		if (line.futureQuantity !== null) {
			warnings.push({
				code: "future_quantity_requires_choice",
				severity:
					line.candidate.quantityOrigin === "reviewed" ? "info" : "error",
				lineKey: line.key,
				detail: line.futureQuantity.note,
			});
		}
		if (line.source !== null && line.source.kind !== "product") {
			warnings.push({
				code: "non_product_source",
				severity: "warning",
				lineKey: line.key,
				detail: line.source.url,
			});
		}
		if (
			line.source !== null &&
			line.offer === null &&
			line.source.kind === "unknown"
		) {
			warnings.push({
				code: "partial_row",
				severity: "warning",
				lineKey: line.key,
				detail: line.source.url,
			});
		}
		if (line.offer?.facts.shippingBasis === "unknown") {
			warnings.push({
				code: "unknown_shipping",
				severity: "info",
				lineKey: line.key,
				detail: null,
			});
		}
		if (
			line.offer?.facts.availabilityNote ||
			line.offer?.facts.availabilityChannel ||
			line.offer?.facts.availabilityLocation ||
			line.offer?.facts.availabilityVariant
		) {
			warnings.push({
				code: "qualified_availability",
				severity: "info",
				lineKey: line.key,
				detail: line.offer.facts.availabilityNote,
			});
		}
		if (line.offer?.facts.currency && line.offer.facts.currency !== "EUR") {
			warnings.push({
				code: "unsupported_currency",
				severity: "error",
				lineKey: line.key,
				detail: line.offer.facts.currency,
			});
		}
		for (const fact of line.unmappedFacts) {
			warnings.push({
				code: "unmapped_fact",
				severity: "info",
				lineKey: line.key,
				detail: fact,
			});
		}
	}
	for (const fact of proposal.unmappedFacts) {
		warnings.push({
			code: "unmapped_fact",
			severity: "info",
			lineKey: null,
			detail: fact,
		});
	}

	const reconciliations = proposal.summaryTotals.map((summary) =>
		reconciliationFor(proposal, summary),
	);
	for (const reconciliation of reconciliations) {
		if (reconciliation.status !== "matched") {
			warnings.push({
				code:
					reconciliation.status === "mismatch"
						? "summary_total_mismatch"
						: "summary_total_incomplete",
				severity: "warning",
				lineKey: reconciliation.summaryKey,
				detail: String(reconciliation.differenceMinor),
			});
		}
	}
	return { proposal, warnings, reconciliations };
}

export function parseImportInput(
	format: "json" | "markdown",
	rawInput: string,
): ReviewedImportProposal {
	if (format === "markdown")
		return reviewImportProposal(parseMarkdown(rawInput));
	let decoded: unknown;
	try {
		decoded = JSON.parse(rawInput);
	} catch {
		throw new ImportParseError("The JSON import is malformed.");
	}
	const parsed = importProposalSchema.safeParse(decoded);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		const field = issue?.path.length ? `${issue.path.join(".")}: ` : "";
		throw new ImportParseError(
			`The JSON import does not match schema version 1. ${field}${issue?.message ?? "Check the proposal."}`,
		);
	}
	return reviewImportProposal(parsed.data);
}
