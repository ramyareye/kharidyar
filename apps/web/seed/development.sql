-- Local development data only. All identifiers are fixed so rerunning this file is safe.

INSERT OR IGNORE INTO user (id, name, email, email_verified)
VALUES ('dev-user', 'Development Owner', 'dev@kharidyar.local', 1);

INSERT OR IGNORE INTO user (id, name, email, email_verified)
VALUES ('dev-collaborator', 'Mina Collaborator', 'mina@kharidyar.local', 1);

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

INSERT OR IGNORE INTO collection_memberships (
	id,
	collection_id,
	user_id,
	role
)
VALUES (
	'dev-collection-commenter',
	'dev-collection',
	'dev-collaborator',
	'commenter'
);

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
	requirements,
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
	'Natural wood, comfortable enough to test in person, and suitable for the Japanese-modern palette.',
	'essential',
	'comparing',
	4,
	'Dining room',
	24000,
	'EUR',
	'dev-user'
);

-- Bring an older copy of this fixed fixture forward without overwriting user edits.
UPDATE items
SET requirements = coalesce(
	requirements,
	'Natural wood, comfortable enough to test in person, and suitable for the Japanese-modern palette.'
)
WHERE id = 'dev-item-chairs';

INSERT OR IGNORE INTO decision_events (
	id,
	item_id,
	kind,
	actor_user_id,
	from_status,
	to_status,
	transition_kind,
	note,
	created_at
)
VALUES
	(
		'dev-decision-chairs-researching',
		'dev-item-chairs',
		'item_status_changed',
		'dev-user',
		'idea',
		'researching',
		'progression',
		'Compare natural-wood chairs that fit the shared Japanese-modern direction.',
		cast(unixepoch('subsecond') * 1000 as integer) - 172800000
	),
	(
		'dev-decision-chairs-comparing',
		'dev-item-chairs',
		'item_status_changed',
		'dev-user',
		'researching',
		'comparing',
		'progression',
		'LISABO is the current lead; test comfort in person before deciding.',
		cast(unixepoch('subsecond') * 1000 as integer) - 86400000
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

INSERT OR IGNORE INTO merchants (
	id,
	workspace_id,
	name,
	sales_channel,
	website_url,
	notes,
	created_by_user_id
)
VALUES (
	'dev-merchant-ikea-netherlands',
	'dev-workspace',
	'IKEA Netherlands',
	'both',
	'https://www.ikea.com/nl/en/',
	'Online ordering and store-dependent pickup or availability.',
	'dev-user'
);

INSERT OR IGNORE INTO offers (
	id,
	workspace_id,
	product_id,
	merchant_id,
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
	(
		SELECT id FROM merchants
		WHERE workspace_id = 'dev-workspace' AND name = 'IKEA Netherlands'
		LIMIT 1
	),
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
	availability_channel,
	availability_note,
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
	'online',
	'Availability depends on the selected store.',
	cast(unixepoch('subsecond') * 1000 as integer),
	'dev-user'
);

INSERT OR IGNORE INTO comments (
	id,
	workspace_id,
	item_id,
	candidate_id,
	body,
	author_user_id
)
VALUES
	(
		'dev-comment-item-chairs',
		'dev-workspace',
		'dev-item-chairs',
		NULL,
		'Should all four chairs match, or can the later pair be a supporting wood tone?',
		'dev-collaborator'
	),
	(
		'dev-comment-lisabo-chair',
		'dev-workspace',
		'dev-item-chairs',
		'dev-candidate-lisabo-chair',
		'I prefer this shape, but I would still test the seat in person.',
		'dev-collaborator'
	);

INSERT OR IGNORE INTO candidate_votes (
	workspace_id,
	item_id,
	candidate_id,
	user_id
)
VALUES (
	'dev-workspace',
	'dev-item-chairs',
	'dev-candidate-lisabo-chair',
	'dev-collaborator'
);
