export const conceptImageRoles = ["base", "reference", "edited"] as const;

export type ConceptImageRole = (typeof conceptImageRoles)[number];

export const conceptSubjectKinds = ["space", "person"] as const;

export type ConceptSubjectKind = (typeof conceptSubjectKinds)[number];

export const uploadableConceptImageRoles = ["base", "reference"] as const;

export type UploadableConceptImageRole =
	(typeof uploadableConceptImageRoles)[number];
