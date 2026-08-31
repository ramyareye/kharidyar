import type { CollectionBriefColor } from "@kharidyar/contracts";

export interface EuroAmountResult {
  minor: number | null;
  valid: boolean;
}

export function parseEuroAmount(value: string): EuroAmountResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { minor: null, valid: true };
  }
  if (!/^\d+(?:[.,]\d{1,2})?$/u.test(trimmed)) {
    return { minor: null, valid: false };
  }

  const [whole = "0", fraction = ""] = trimmed.replace(",", ".").split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor)
    ? { minor, valid: true }
    : { minor: null, valid: false };
}

export function euroInputFromMinor(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) {
    return "";
  }
  const whole = Math.floor(minor / 100);
  const fraction = String(minor % 100).padStart(2, "0");
  return fraction === "00" ? String(whole) : `${whole}.${fraction}`;
}

export function splitStructuredList(value: string): string[] {
  return value
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function splitStructuredLines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function movePaletteColor<T>(
  colors: readonly T[],
  index: number,
  direction: -1 | 1,
): T[] {
  const destination = index + direction;
  if (
    index < 0 ||
    index >= colors.length ||
    destination < 0 ||
    destination >= colors.length
  ) {
    return [...colors];
  }
  const reordered = [...colors];
  const [color] = reordered.splice(index, 1);
  if (color !== undefined) {
    reordered.splice(destination, 0, color);
  }
  return reordered;
}

export function normalizedPaletteHasDuplicates(
  core: readonly CollectionBriefColor[],
  supporting: readonly CollectionBriefColor[],
): boolean {
  const colors = [...core, ...supporting].map(({ hex }) =>
    hex.trim().toUpperCase(),
  );
  return new Set(colors).size !== colors.length;
}
