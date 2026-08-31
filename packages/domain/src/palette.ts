import { DomainValidationError } from "./validation";

export const collectionBriefColorKinds = ["core", "supporting"] as const;
export type CollectionBriefColorKind =
  (typeof collectionBriefColorKinds)[number];

export const inputHexColorPattern = /^#[0-9A-Fa-f]{6}$/u;
export const normalizedHexColorPattern = /^#[0-9A-F]{6}$/u;

export interface ColorPalette {
  readonly core: readonly string[];
  readonly supporting: readonly string[];
}

export function normalizeHexColor(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalizedHexColorPattern.test(normalized)) {
    throw new DomainValidationError(
      "color",
      "color must use the #RRGGBB format",
    );
  }

  return normalized;
}

export function colorPalette(input: ColorPalette): ColorPalette {
  if (input.core.length > 6 || input.supporting.length > 6) {
    throw new DomainValidationError(
      "colorPalette",
      "a palette may contain at most six core and six supporting colors",
    );
  }

  const core = input.core.map(normalizeHexColor);
  const supporting = input.supporting.map(normalizeHexColor);
  const allColors = [...core, ...supporting];
  if (new Set(allColors).size !== allColors.length) {
    throw new DomainValidationError(
      "colorPalette",
      "a normalized color may appear only once across the palette",
    );
  }

  return { core, supporting };
}
