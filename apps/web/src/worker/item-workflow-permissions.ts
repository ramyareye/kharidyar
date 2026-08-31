import type { ItemPermissions } from "@kharidyar/contracts";
import { hasCapability } from "@kharidyar/domain";

import type { ResourceAccess } from "./authorization";

export function itemPermissionsForAccess(
	access: ResourceAccess,
): ItemPermissions {
	return {
		canCreate: hasCapability(access.grants, access.target, "item_create"),
		canEdit: hasCapability(access.grants, access.target, "item_edit"),
		canArchive: hasCapability(access.grants, access.target, "item_archive"),
		canChangeNonPurchaseStatus: hasCapability(
			access.grants,
			access.target,
			"item_status_non_purchase",
		),
		canMarkPurchased: hasCapability(
			access.grants,
			access.target,
			"record_purchase",
		),
	};
}
