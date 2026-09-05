import type {
  CollectionBriefColor,
  CollectionBriefResource,
  ConceptImageResource,
  ConceptImageUpdateInput,
  ConceptMediaResponse,
  ConceptResource,
} from "@kharidyar/contracts";
import { formatMoney } from "@kharidyar/i18n";

import { ConceptMedia } from "./ConceptMedia";
import { useLocale } from "./locale-context";
import type { ConceptImageUploadValue } from "./planning-api";

function DirectionTags({
  label,
  values,
}: {
  label: string;
  values: readonly string[];
}) {
  if (values.length === 0) return null;
  return (
    <div className="direction-tags">
      <span>{label}</span>
      <ul>
        {values.map((value, index) => (
          <li key={`${index}-${value}`} dir="auto">
            {value}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaletteLine({
  colors,
  label,
}: {
  colors: readonly CollectionBriefColor[];
  label: string;
}) {
  const { t } = useLocale();
  return (
    <div className="palette-line">
      <div className="palette-line__heading">
        <span>{label}</span>
        <small dir="ltr">{colors.length} / 6</small>
      </div>
      {colors.length === 0 ? (
        <p>{t("palette.empty")}</p>
      ) : (
        <ol>
          {colors.map((color) => (
            <li key={color.hex}>
              <span
                className="palette-line__swatch"
                style={{ backgroundColor: color.hex }}
                aria-hidden="true"
              />
              <span className="palette-line__text">
                <strong dir="auto">{color.label || color.hex}</strong>
                <small dir="auto">
                  {color.label ? color.hex : null}
                  {color.label && color.usageNote ? " · " : null}
                  {color.usageNote}
                </small>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function BriefDetails({ brief }: { brief: CollectionBriefResource }) {
  const { locale, t } = useLocale();
  const hasNarrativeDetails = Boolean(
    brief.intendedUse || brief.requirements || brief.thingsToAvoid,
  );

  return (
    <article className="brief-card">
      <header className="brief-card__header">
        <div>
          <p className="eyebrow">{t("brief.label")}</p>
          <h4 dir="auto">{brief.title || t("brief.label")}</h4>
        </div>
        <span className="brief-card__budget">
          {brief.budget
            ? t("brief.budgetSummary", {
                amount: formatMoney(
                  locale,
                  brief.budget.minor,
                  brief.budget.currency,
                ),
              })
            : t("brief.noBudget")}
        </span>
      </header>
      {brief.description ? (
        <p className="brief-card__description" dir="auto">
          {brief.description}
        </p>
      ) : null}

      {hasNarrativeDetails ? (
        <dl className="brief-card__details">
          {brief.intendedUse ? (
            <div>
              <dt>{t("brief.intendedUseSummary")}</dt>
              <dd dir="auto">{brief.intendedUse}</dd>
            </div>
          ) : null}
          {brief.requirements ? (
            <div>
              <dt>{t("brief.requirementsSummary")}</dt>
              <dd dir="auto">{brief.requirements}</dd>
            </div>
          ) : null}
          {brief.thingsToAvoid ? (
            <div>
              <dt>{t("brief.avoidSummary")}</dt>
              <dd dir="auto">{brief.thingsToAvoid}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <div className="brief-card__taxonomy">
        <DirectionTags
          label={t("brief.keywordsSummary")}
          values={brief.keywords}
        />
        <DirectionTags
          label={t("brief.materialsSummary")}
          values={brief.materials}
        />
        <DirectionTags
          label={t("brief.brandsSummary")}
          values={brief.preferredBrands}
        />
      </div>

      {brief.referenceUrls.length > 0 ? (
        <div className="brief-card__references">
          <span>{t("brief.referencesSummary")}</span>
          <ol>
            {brief.referenceUrls.map((url, index) => (
              <li key={`${index}-${url}`}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                  referrerPolicy="no-referrer"
                  title={url}
                  dir="ltr"
                >
                  {String(index + 1).padStart(2, "0")} ·{" "}
                  {new URL(url).hostname.replace(/^www\./u, "")} ↗
                </a>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </article>
  );
}

export function CollectionDirection({
  brief,
  busy,
  canEditBrief,
  canEditConcept,
  concept,
  media,
  loading,
  onDeleteImage,
  onEditBrief,
  onEditConcept,
  onRemoveConcept,
  onReorderImages,
  onUpdateImage,
  onUploadImage,
}: {
  brief: CollectionBriefResource | null;
  busy: boolean;
  canEditBrief: boolean;
  canEditConcept: boolean;
  concept: ConceptResource | null;
  media: ConceptMediaResponse | null;
  loading: boolean;
  onDeleteImage: (image: ConceptImageResource) => Promise<void>;
  onEditBrief: () => void;
  onEditConcept: () => void;
  onRemoveConcept: () => void;
  onReorderImages: (imageIds: string[]) => Promise<boolean>;
  onUpdateImage: (
    imageId: string,
    value: ConceptImageUpdateInput,
  ) => Promise<boolean>;
  onUploadImage: (value: ConceptImageUploadValue) => Promise<boolean>;
}) {
  const { t } = useLocale();
  const hasPalette = Boolean(
    brief &&
      (brief.colorPreference.core.length > 0 ||
        brief.colorPreference.supporting.length > 0),
  );

  return (
    <section className="direction-folio" aria-labelledby="direction-heading">
      <header className="direction-folio__header">
        <div>
          <p className="eyebrow">{t("direction.eyebrow")}</p>
          <h3 id="direction-heading">{t("direction.title")}</h3>
          <p>{t("direction.description")}</p>
        </div>
        <div className="direction-folio__actions">
          {canEditBrief ? (
            <button
              type="button"
              className="text-action"
              onClick={onEditBrief}
              disabled={busy}
            >
              {brief ? t("brief.edit") : t("brief.create")}
            </button>
          ) : null}
          {canEditConcept ? (
            <button
              type="button"
              className="text-action"
              onClick={onEditConcept}
              disabled={busy}
            >
              {concept ? t("concept.edit") : t("concept.create")}
            </button>
          ) : null}
        </div>
      </header>

      {loading ? (
        <p className="direction-folio__loading" role="status">
          {t("direction.loading")}
        </p>
      ) : (
        <div className="direction-board">
          {brief ? (
            <BriefDetails brief={brief} />
          ) : (
            <article className="direction-empty direction-empty--brief">
              <span aria-hidden="true">01</span>
              <div>
                <p className="eyebrow">{t("brief.label")}</p>
                <h4>{t("brief.emptyTitle")}</h4>
                <p>{t("brief.emptyBody")}</p>
              </div>
            </article>
          )}

          <article
            className={
              concept
                ? "concept-card"
                : "direction-empty direction-empty--concept"
            }
          >
            {concept ? (
              <>
                <header>
                  <p className="eyebrow">{t("concept.label")}</p>
                  <h4 dir="auto">{concept.title}</h4>
                </header>
                <p className="concept-card__narrative" dir="auto">
                  {concept.narrative}
                </p>
                {media ? (
                  <ConceptMedia
                    busy={busy}
                    media={media}
                    onDelete={onDeleteImage}
                    onReorder={onReorderImages}
                    onUpdate={onUpdateImage}
                    onUpload={onUploadImage}
                  />
                ) : null}
                {canEditConcept ? (
                  <button
                    type="button"
                    className="text-action text-action--danger"
                    onClick={onRemoveConcept}
                    disabled={busy}
                  >
                    {t("concept.remove")}
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <span aria-hidden="true">02</span>
                <div>
                  <p className="eyebrow">{t("concept.label")}</p>
                  <h4>{t("concept.emptyTitle")}</h4>
                  <p>{t("concept.emptyBody")}</p>
                </div>
              </>
            )}
          </article>

          {hasPalette && brief ? (
            <section className="palette-card">
              <header>
                <p className="eyebrow">{t("palette.title")}</p>
                <p>{t("palette.description")}</p>
              </header>
              <div>
                <PaletteLine
                  colors={brief.colorPreference.core}
                  label={t("palette.core")}
                />
                <PaletteLine
                  colors={brief.colorPreference.supporting}
                  label={t("palette.supporting")}
                />
              </div>
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
