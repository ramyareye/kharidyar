import type { CandidateComparison } from "@kharidyar/contracts";

export function safeProductLink(value?: string | null): string | null {
	try {
		const url = new URL(value ?? "");
		return url.protocol === "https:" && !url.username && !url.password
			? url.href
			: null;
	} catch {
		return null;
	}
}

// Comparison responses use the same rank/creation order as collection previews.
export function detailCandidate(candidates: CandidateComparison[]) {
	const active = candidates.filter((candidate) => !candidate.archivedAt);
	const planned = active.find((candidate) => candidate.isPlanned);
	if (planned) return planned;
	const available = active.filter((candidate) => !candidate.product.archivedAt);
	return (
		available.find((candidate) => candidate.product.imageUrl) ?? available[0]
	);
}
