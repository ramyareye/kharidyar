export const researchRunStatuses = [
  "queued",
  "running",
  "partial",
  "completed",
  "failed",
  "cancelled",
] as const;

export type ResearchRunStatus = (typeof researchRunStatuses)[number];

export const researchResultStatuses = ["active", "dismissed"] as const;

export type ResearchResultStatus = (typeof researchResultStatuses)[number];

export const researchExtractionStatuses = [
  "not_requested",
  "not_allowed",
  "completed",
  "failed",
] as const;

export type ResearchExtractionStatus =
  (typeof researchExtractionStatuses)[number];

export const providerResearchRetentionMilliseconds = 30 * 24 * 60 * 60 * 1_000;

export function isResearchRunTerminal(status: ResearchRunStatus): boolean {
  return ["completed", "failed", "cancelled"].includes(status);
}

export function researchSnapshotExpiresAt(retrievedAt: number): number {
  if (!Number.isSafeInteger(retrievedAt) || retrievedAt < 0) {
    throw new TypeError(
      "Research retrieval time must be a non-negative integer.",
    );
  }

  return retrievedAt + providerResearchRetentionMilliseconds;
}
