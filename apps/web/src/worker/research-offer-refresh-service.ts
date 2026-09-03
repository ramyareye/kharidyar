import {
  priceCheckInputSchema,
  type ItemComparisonResponse,
} from "@kharidyar/contracts";
import type { BrowserWorker } from "@cloudflare/playwright";

import { badRequest, notFound, resourceArchived } from "./api-errors";
import { loadCollectionAccess, requireCapability } from "./authorization";
import { recordPriceCheck } from "./commerce-service";
import {
  extractPermittedProductPage,
  isResearchBrowserUrlAllowed,
} from "./research-browser";

interface RefreshTargetRow {
  collection_id: string;
  workspace_archived_at: number | null;
  collection_archived_at: number | null;
  item_archived_at: number | null;
  candidate_archived_at: number | null;
  offer_archived_at: number | null;
  source_url: string;
}

export async function refreshOfferFromPermittedSource(input: {
  allowedOrigin: string;
  browser: BrowserWorker;
  candidateId: string;
  database: D1Database;
  itemId: string;
  offerId: string;
  userId: string;
}): Promise<ItemComparisonResponse> {
  const target = await input.database
    .prepare(
      `select
				c.id as collection_id,
				w.archived_at as workspace_archived_at,
				c.archived_at as collection_archived_at,
				i.archived_at as item_archived_at,
				ic.archived_at as candidate_archived_at,
				o.archived_at as offer_archived_at,
				o.source_url
			from items i
			join collections c on c.id = i.collection_id
			join workspaces w on w.id = i.workspace_id
			join item_candidates ic
				on ic.id = ?1 and ic.item_id = i.id and ic.workspace_id = i.workspace_id
			join offers o
				on o.id = ?2 and o.product_id = ic.product_id and o.workspace_id = i.workspace_id
			where i.id = ?3`,
    )
    .bind(input.candidateId, input.offerId, input.itemId)
    .first<RefreshTargetRow>();
  if (target === null) throw notFound();
  const access = requireCapability(
    await loadCollectionAccess(
      input.database,
      input.userId,
      target.collection_id,
    ),
    "view",
  );
  requireCapability(access, "offer_refresh");
  // The final write reuses the ordinary Offer mutation guard as well.
  requireCapability(access, "offer_manage");
  if (target.workspace_archived_at !== null)
    throw resourceArchived("Workspace");
  if (target.collection_archived_at !== null)
    throw resourceArchived("Collection");
  if (target.item_archived_at !== null) throw resourceArchived("Item");
  if (target.candidate_archived_at !== null)
    throw resourceArchived("Candidate");
  if (target.offer_archived_at !== null) throw resourceArchived("Offer");
  if (!isResearchBrowserUrlAllowed(target.source_url, input.allowedOrigin)) {
    throw badRequest(
      "Automated refresh is not permitted for this source. Update it manually instead.",
    );
  }

  const extracted = await extractPermittedProductPage({
    allowedOrigin: input.allowedOrigin,
    browser: input.browser,
    url: target.source_url,
  });
  const value = priceCheckInputSchema.parse({
    facts: extracted.suggestion.offer.facts,
    observedAt: new Date().toISOString(),
  });
  return recordPriceCheck({
    candidateId: input.candidateId,
    database: input.database,
    itemId: input.itemId,
    offerId: input.offerId,
    userId: input.userId,
    value,
  });
}
