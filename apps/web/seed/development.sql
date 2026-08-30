-- Local development data only. All identifiers are fixed so rerunning this file is safe.

INSERT OR IGNORE INTO user (id, name, email, email_verified)
VALUES ('dev-user', 'Development Owner', 'dev@kharidyar.local', 1);

INSERT OR IGNORE INTO workspaces (id, name, created_by_user_id)
VALUES ('dev-workspace', 'My Home', 'dev-user');

INSERT OR IGNORE INTO workspace_memberships (id, workspace_id, user_id, role)
VALUES ('dev-workspace-owner', 'dev-workspace', 'dev-user', 'owner');

INSERT OR IGNORE INTO collections (
	id,
	workspace_id,
	name,
	description,
	created_by_user_id
)
VALUES (
	'dev-collection',
	'dev-workspace',
	'Japanese-modern home',
	'A shared plan for furnishing the bedroom and living room.',
	'dev-user'
);

INSERT OR IGNORE INTO collection_memberships (
	id,
	collection_id,
	user_id,
	role
)
VALUES ('dev-collection-owner', 'dev-collection', 'dev-user', 'owner');

INSERT OR IGNORE INTO collection_briefs (
	id,
	collection_id,
	title,
	description,
	budget_minor,
	budget_currency
)
VALUES (
	'dev-brief',
	'dev-collection',
	'Warm, quiet, Japanese-modern',
	'Natural wood, paper lighting, low profiles, and restrained decoration.',
	215000,
	'EUR'
);

INSERT OR IGNORE INTO collection_brief_colors (
	id,
	collection_brief_id,
	kind,
	position,
	hex,
	label,
	usage_note
)
VALUES
	('dev-color-core-1', 'dev-brief', 'core', 0, '#D8C3A5', 'Natural oak', 'Large wood surfaces'),
	('dev-color-core-2', 'dev-brief', 'core', 1, '#F1E9DA', 'Warm paper', 'Walls and lamps'),
	('dev-color-core-3', 'dev-brief', 'core', 2, '#6B705C', 'Muted olive', 'Textiles and one accent'),
	('dev-color-support-1', 'dev-brief', 'supporting', 0, '#2F312D', 'Charcoal', 'Small hardware and contrast'),
	('dev-color-support-2', 'dev-brief', 'supporting', 1, '#A2674A', 'Clay', 'Occasional warm accent');

INSERT OR IGNORE INTO items (
	id,
	workspace_id,
	collection_id,
	title,
	description,
	priority,
	status,
	quantity_needed,
	group_label,
	budget_minor,
	budget_currency,
	created_by_user_id
)
VALUES (
	'dev-item-chairs',
	'dev-workspace',
	'dev-collection',
	'Dining chairs',
	'Buy two now and leave room to add two later.',
	'essential',
	'comparing',
	4,
	'Living room',
	24000,
	'EUR',
	'dev-user'
);

INSERT OR IGNORE INTO products (
	id,
	workspace_id,
	title,
	brand,
	model,
	category,
	created_by_user_id
)
VALUES (
	'dev-product-lisabo-chair',
	'dev-workspace',
	'LISABO chair',
	'IKEA',
	'LISABO',
	'Dining chair',
	'dev-user'
);

INSERT OR IGNORE INTO offers (
	id,
	workspace_id,
	product_id,
	seller_name,
	source_url,
	price_kind,
	unit_price_minor,
	currency,
	shipping_minor,
	shipping_basis,
	availability_state,
	availability_channel,
	locale,
	last_checked_at,
	created_by_user_id
)
VALUES (
	'dev-offer-lisabo-chair-ikea-nl',
	'dev-workspace',
	'dev-product-lisabo-chair',
	'IKEA Netherlands',
	'https://www.ikea.com/nl/en/p/lisabo-chair-ash-00457235/',
	'exact',
	5999,
	'EUR',
	NULL,
	'unknown',
	'unknown',
	'online',
	'nl-NL',
	cast(unixepoch('subsecond') * 1000 as integer),
	'dev-user'
);

INSERT OR IGNORE INTO item_candidates (
	id,
	workspace_id,
	item_id,
	product_id,
	planned_purchase_quantity,
	is_planned,
	planned_offer_id,
	notes,
	created_by_user_id
)
VALUES (
	'dev-candidate-lisabo-chair',
	'dev-workspace',
	'dev-item-chairs',
	'dev-product-lisabo-chair',
	2,
	1,
	'dev-offer-lisabo-chair-ikea-nl',
	'The Item needs four chairs, while the current purchase plan is two units.',
	'dev-user'
);

INSERT OR IGNORE INTO price_checks (
	id,
	offer_id,
	price_kind,
	unit_price_minor,
	currency,
	shipping_minor,
	shipping_basis,
	availability_state,
	availability_qualifier,
	observed_at,
	observed_by_user_id
)
VALUES (
	'dev-price-check-lisabo-chair',
	'dev-offer-lisabo-chair-ikea-nl',
	'exact',
	5999,
	'EUR',
	NULL,
	'unknown',
	'unknown',
	'Availability depends on the selected store.',
	cast(unixepoch('subsecond') * 1000 as integer),
	'dev-user'
);
