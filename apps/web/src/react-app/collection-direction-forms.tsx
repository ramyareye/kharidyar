import type {
  CollectionBriefColor,
  CollectionBriefInput,
  CollectionBriefResource,
  ConceptInput,
  ConceptResource,
} from "@kharidyar/contracts";
import { inputHexColorPattern } from "@kharidyar/domain";
import {
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";

import {
  euroInputFromMinor,
  movePaletteColor,
  normalizedPaletteHasDuplicates,
  parseEuroAmount,
  splitStructuredList,
  splitStructuredLines,
} from "./collection-direction-state";
import { useLocale } from "./locale-context";
import { EditorDialog, FormActions } from "./planning-forms";

const paletteSeeds = [
  "#D8C7AD",
  "#6E765F",
  "#F2EEE5",
  "#28332D",
  "#B56C4E",
  "#8D8272",
  "#E6D9C5",
  "#A9B2A0",
  "#FEFBF4",
  "#4B5550",
  "#C69476",
  "#B8AEA0",
] as const;

function emptyColor(
  existing: readonly CollectionBriefColor[],
): CollectionBriefColor {
  const used = new Set(existing.map(({ hex }) => hex.toUpperCase()));
  return {
    hex: paletteSeeds.find((hex) => !used.has(hex)) ?? "#000000",
    label: null,
    usageNote: null,
  };
}

function PaletteGroupEditor({
  colors,
  kind,
  otherColors,
  setColors,
}: {
  colors: CollectionBriefColor[];
  kind: "core" | "supporting";
  otherColors: CollectionBriefColor[];
  setColors: Dispatch<SetStateAction<CollectionBriefColor[]>>;
}) {
  const { t } = useLocale();
  const groupLabel =
    kind === "core" ? t("palette.core") : t("palette.supporting");
  const addLabel =
    kind === "core" ? t("palette.addCore") : t("palette.addSupporting");

  function updateColor(index: number, patch: Partial<CollectionBriefColor>) {
    setColors((current) =>
      current.map((color, colorIndex) =>
        colorIndex === index ? { ...color, ...patch } : color,
      ),
    );
  }

  return (
    <fieldset className="palette-editor__group">
      <legend className="palette-editor__legend">{groupLabel}</legend>
      <div className="palette-editor__group-heading">
        <span className="palette-editor__group-label" aria-hidden="true">
          {groupLabel}
        </span>
        <span dir="ltr">{colors.length} / 6</span>
      </div>
      <div className="palette-editor__rows">
        {colors.map((color, index) => {
          const normalized = color.hex.trim().toUpperCase();
          const pickerValue = inputHexColorPattern.test(normalized)
            ? normalized
            : "#000000";
          const colorName =
            color.label?.trim() || normalized || String(index + 1);
          return (
            <div className="palette-color-editor" key={`${kind}-${index}`}>
              <div className="palette-color-editor__swatch">
                <input
                  type="color"
                  value={pickerValue}
                  onChange={(event) =>
                    updateColor(index, {
                      hex: event.target.value.toUpperCase(),
                    })
                  }
                  aria-label={`${groupLabel} ${index + 1}`}
                />
                <span aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <label className="field field--compact">
                <span className="field__label">{t("palette.hex")}</span>
                <input
                  value={color.hex}
                  onChange={(event) =>
                    updateColor(index, { hex: event.target.value })
                  }
                  maxLength={7}
                  placeholder="#D8C7AD"
                  dir="ltr"
                />
              </label>
              <label className="field field--compact">
                <span className="field__label">{t("palette.label")}</span>
                <input
                  value={color.label ?? ""}
                  onChange={(event) =>
                    updateColor(index, { label: event.target.value || null })
                  }
                  maxLength={60}
                  placeholder={t("palette.labelPlaceholder")}
                />
              </label>
              <label className="field field--compact palette-color-editor__usage">
                <span className="field__label">{t("palette.usage")}</span>
                <input
                  value={color.usageNote ?? ""}
                  onChange={(event) =>
                    updateColor(index, {
                      usageNote: event.target.value || null,
                    })
                  }
                  maxLength={120}
                  placeholder={t("palette.usagePlaceholder")}
                />
              </label>
              <div className="palette-color-editor__actions">
                <button
                  type="button"
                  onClick={() =>
                    setColors((current) => movePaletteColor(current, index, -1))
                  }
                  disabled={index === 0}
                  aria-label={t("palette.moveEarlier", { color: colorName })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setColors((current) => movePaletteColor(current, index, 1))
                  }
                  disabled={index === colors.length - 1}
                  aria-label={t("palette.moveLater", { color: colorName })}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="palette-color-editor__remove"
                  onClick={() =>
                    setColors((current) =>
                      current.filter((_, colorIndex) => colorIndex !== index),
                    )
                  }
                  aria-label={t("palette.remove", { color: colorName })}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="palette-editor__add"
        onClick={() =>
          setColors((current) => [
            ...current,
            emptyColor([...current, ...otherColors]),
          ])
        }
        disabled={colors.length >= 6}
      >
        <span aria-hidden="true">＋</span>
        {addLabel}
      </button>
    </fieldset>
  );
}

export function CollectionBriefForm({
  busy,
  initial,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  initial: CollectionBriefResource | null;
  onClose: () => void;
  onSubmit: (value: CollectionBriefInput) => Promise<boolean>;
}) {
  const { t } = useLocale();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [keywords, setKeywords] = useState(initial?.keywords.join(", ") ?? "");
  const [materials, setMaterials] = useState(
    initial?.materials.join(", ") ?? "",
  );
  const [preferredBrands, setPreferredBrands] = useState(
    initial?.preferredBrands.join(", ") ?? "",
  );
  const [intendedUse, setIntendedUse] = useState(initial?.intendedUse ?? "");
  const [requirements, setRequirements] = useState(initial?.requirements ?? "");
  const [thingsToAvoid, setThingsToAvoid] = useState(
    initial?.thingsToAvoid ?? "",
  );
  const [referenceUrls, setReferenceUrls] = useState(
    initial?.referenceUrls.join("\n") ?? "",
  );
  const [budget, setBudget] = useState(
    euroInputFromMinor(initial?.budget?.minor),
  );
  const [coreColors, setCoreColors] = useState<CollectionBriefColor[]>(
    initial?.colorPreference.core ?? [],
  );
  const [supportingColors, setSupportingColors] = useState<
    CollectionBriefColor[]
  >(initial?.colorPreference.supporting ?? []);
  const [validationError, setValidationError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedBudget = parseEuroAmount(budget);
    if (!parsedBudget.valid) {
      setValidationError(t("form.budgetInvalid"));
      return;
    }

    const lists = [
      splitStructuredList(keywords),
      splitStructuredList(materials),
      splitStructuredList(preferredBrands),
    ];
    const references = splitStructuredLines(referenceUrls);
    if ([...lists, references].some((entries) => entries.length > 20)) {
      setValidationError(t("form.listLimit"));
      return;
    }
    if (
      references.some((value) => {
        try {
          return new URL(value).protocol !== "https:";
        } catch {
          return true;
        }
      })
    ) {
      setValidationError(t("form.referenceUrlInvalid"));
      return;
    }

    const normalizeColors = (colors: readonly CollectionBriefColor[]) =>
      colors.map((color) => ({
        hex: color.hex.trim().toUpperCase(),
        label: color.label?.trim() || null,
        usageNote: color.usageNote?.trim() || null,
      }));
    const normalizedCore = normalizeColors(coreColors);
    const normalizedSupporting = normalizeColors(supportingColors);
    if (
      [...normalizedCore, ...normalizedSupporting].some(
        ({ hex }) => !inputHexColorPattern.test(hex),
      )
    ) {
      setValidationError(t("palette.invalid"));
      return;
    }
    if (normalizedPaletteHasDuplicates(normalizedCore, normalizedSupporting)) {
      setValidationError(t("palette.duplicate"));
      return;
    }

    setValidationError(null);
    await onSubmit({
      title: title.trim() || null,
      description: description.trim() || null,
      keywords: lists[0] ?? [],
      materials: lists[1] ?? [],
      preferredBrands: lists[2] ?? [],
      intendedUse: intendedUse.trim() || null,
      requirements: requirements.trim() || null,
      thingsToAvoid: thingsToAvoid.trim() || null,
      referenceUrls: references,
      budget:
        parsedBudget.minor === null
          ? null
          : { minor: parsedBudget.minor, currency: "EUR" },
      colorPreference: {
        core: normalizedCore,
        supporting: normalizedSupporting,
      },
    });
  }

  return (
    <EditorDialog
      busy={busy}
      onClose={onClose}
      title={t("brief.formTitle")}
      description={t("brief.formDescription")}
      size="wide"
    >
      <form
        className="editor-form editor-form--wide"
        onSubmit={submit}
        noValidate
      >
        <section className="brief-form-section">
          <div className="brief-form-section__heading">
            <span aria-hidden="true">01</span>
            <h3>{t("brief.label")}</h3>
          </div>
          <div className="brief-form-grid">
            <label className="field">
              <span className="field__label">{t("brief.title")}</span>
              <input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("brief.titlePlaceholder")}
                maxLength={120}
              />
            </label>
            <label className="field brief-form-grid__full">
              <span className="field__label">{t("brief.description")}</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("brief.descriptionPlaceholder")}
                maxLength={4_000}
                rows={3}
              />
            </label>
            <label className="field">
              <span className="field__label">
                {t("brief.keywords")}
                <small>{t("brief.listHint")}</small>
              </span>
              <textarea
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                placeholder={t("brief.keywordsPlaceholder")}
                rows={2}
              />
            </label>
            <label className="field">
              <span className="field__label">
                {t("brief.materials")}
                <small>{t("brief.listHint")}</small>
              </span>
              <textarea
                value={materials}
                onChange={(event) => setMaterials(event.target.value)}
                placeholder={t("brief.materialsPlaceholder")}
                rows={2}
              />
            </label>
            <label className="field">
              <span className="field__label">
                {t("brief.preferredBrands")}
                <small>{t("brief.listHint")}</small>
              </span>
              <textarea
                value={preferredBrands}
                onChange={(event) => setPreferredBrands(event.target.value)}
                placeholder={t("brief.preferredBrandsPlaceholder")}
                rows={2}
              />
            </label>
            <label className="field">
              <span className="field__label">{t("brief.budget")}</span>
              <div className="money-input">
                <span>EUR</span>
                <input
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  placeholder={t("brief.budgetPlaceholder")}
                  inputMode="decimal"
                  dir="ltr"
                />
              </div>
              <small className="field-hint">{t("brief.budgetHint")}</small>
            </label>
            <label className="field brief-form-grid__full">
              <span className="field__label">{t("brief.intendedUse")}</span>
              <textarea
                value={intendedUse}
                onChange={(event) => setIntendedUse(event.target.value)}
                placeholder={t("brief.intendedUsePlaceholder")}
                maxLength={2_000}
                rows={2}
              />
            </label>
            <label className="field">
              <span className="field__label">{t("brief.requirements")}</span>
              <textarea
                value={requirements}
                onChange={(event) => setRequirements(event.target.value)}
                placeholder={t("brief.requirementsPlaceholder")}
                maxLength={4_000}
                rows={3}
              />
            </label>
            <label className="field">
              <span className="field__label">{t("brief.thingsToAvoid")}</span>
              <textarea
                value={thingsToAvoid}
                onChange={(event) => setThingsToAvoid(event.target.value)}
                placeholder={t("brief.thingsToAvoidPlaceholder")}
                maxLength={4_000}
                rows={3}
              />
            </label>
            <label className="field brief-form-grid__full">
              <span className="field__label">{t("brief.referenceUrls")}</span>
              <textarea
                value={referenceUrls}
                onChange={(event) => setReferenceUrls(event.target.value)}
                placeholder={t("brief.referenceUrlsPlaceholder")}
                rows={3}
                dir="ltr"
              />
            </label>
          </div>
        </section>

        <section className="brief-form-section">
          <div className="brief-form-section__heading">
            <span aria-hidden="true">02</span>
            <div>
              <h3>{t("palette.title")}</h3>
              <p>{t("palette.description")}</p>
            </div>
          </div>
          <div className="palette-editor">
            <PaletteGroupEditor
              colors={coreColors}
              kind="core"
              otherColors={supportingColors}
              setColors={setCoreColors}
            />
            <PaletteGroupEditor
              colors={supportingColors}
              kind="supporting"
              otherColors={coreColors}
              setColors={setSupportingColors}
            />
          </div>
        </section>

        {validationError ? (
          <p className="field-error" role="alert">
            {validationError}
          </p>
        ) : null}
        <FormActions
          busy={busy}
          onCancel={onClose}
          submitLabel={t("common.save")}
        />
      </form>
    </EditorDialog>
  );
}

export function ConceptForm({
  busy,
  initial,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  initial: ConceptResource | null;
  onClose: () => void;
  onSubmit: (value: ConceptInput) => Promise<boolean>;
}) {
  const { t } = useLocale();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [narrative, setNarrative] = useState(initial?.narrative ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !narrative.trim()) {
      setValidationError(t("form.conceptRequired"));
      return;
    }
    setValidationError(null);
    await onSubmit({ title, narrative });
  }

  return (
    <EditorDialog
      busy={busy}
      onClose={onClose}
      title={t("concept.formTitle")}
      description={t("concept.formDescription")}
    >
      <form className="editor-form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field__label">
            {t("concept.title")}
            <small>{t("form.required")}</small>
          </span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("concept.titlePlaceholder")}
            maxLength={120}
          />
        </label>
        <label className="field">
          <span className="field__label">
            {t("concept.narrative")}
            <small>{t("form.required")}</small>
          </span>
          <textarea
            value={narrative}
            onChange={(event) => setNarrative(event.target.value)}
            placeholder={t("concept.narrativePlaceholder")}
            maxLength={2_000}
            rows={7}
          />
        </label>
        {validationError ? (
          <p className="field-error" role="alert">
            {validationError}
          </p>
        ) : null}
        <FormActions
          busy={busy}
          onCancel={onClose}
          submitLabel={initial ? t("common.save") : t("common.create")}
        />
      </form>
    </EditorDialog>
  );
}
