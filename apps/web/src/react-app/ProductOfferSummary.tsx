import type { CandidateComparison, OfferResource } from "@kharidyar/contracts";
import { formatDateTime, formatMoney, formatNumber } from "@kharidyar/i18n";
import { useLocale } from "./locale-context";
import { ProductAttributes } from "./ProductAttributes";
import { safeProductLink } from "./product-presentation";
import "./ProductOfferSummary.css";

export function ProductOfferSummary({ offer }: { offer: OfferResource }) {
	const { locale, t } = useLocale();
	const href = safeProductLink(offer.sourceUrl);
	const { facts } = offer;
	const knownPrice =
		facts.priceKind !== "unknown" &&
		facts.unitPriceMinor !== null &&
		facts.currency;
	return (
		<div className="product-offer-summary">
			<div className="product-offer-summary__merchant">
				<span>{t("commerce.retailer")}</span>
				<strong dir="auto">{offer.merchant.name}</strong>
				{href ? (
					<a
						href={href}
						title={href}
						target="_blank"
						rel="noreferrer"
						aria-label={t("commerce.openOfferSource", {
							merchant: offer.merchant.name,
						})}
					>
						{t("commerce.viewProduct")} ↗
					</a>
				) : null}
			</div>
			<div className="product-offer-summary__price">
				<strong>
					{knownPrice ? (
						<>
							{facts.priceKind === "starting_at"
								? `${t("commerce.priceKind.starting_at")} `
								: ""}
							<bdi>
								{formatMoney(locale, facts.unitPriceMinor!, facts.currency!)}
							</bdi>
							<small> {t("commerce.perUnit")}</small>
						</>
					) : (
						t("commerce.priceUnknown")
					)}
				</strong>
				<span
					className={`commerce-availability commerce-availability--${facts.availabilityState}`}
				>
					{t(`commerce.availability.${facts.availabilityState}`)}
				</span>
			</div>
			<p className="product-offer-summary__shipping">
				{facts.shippingMinor !== null && facts.currency
					? t("commerce.shippingSummary", {
							amount: formatMoney(locale, facts.shippingMinor, facts.currency),
							basis: t(`commerce.shippingBasis.${facts.shippingBasis}`),
						})
					: t("commerce.shippingUnknown")}
			</p>
			<div className="product-offer-summary__date">
				<time dateTime={offer.lastCheckedAt}>
					{t("commerce.lastChecked", {
						date: formatDateTime(locale, offer.lastCheckedAt),
					})}
				</time>
				<span className={`commerce-badge commerce-badge--${offer.freshness}`}>
					{t(`commerce.${offer.freshness}`)}
				</span>
			</div>
		</div>
	);
}

export function ItemProductDetails({
	candidate,
}: {
	candidate: CandidateComparison;
}) {
	const { locale, t } = useLocale();
	const offers = candidate.offers.filter(
		(offer) => !offer.archivedAt && !offer.merchant.archivedAt,
	);
	const primary =
		offers.find((offer) => offer.id === candidate.plannedOfferId) ?? offers[0];
	const others = offers.filter((offer) => offer !== primary);
	return (
		<section
			className="item-product-details"
			aria-label={t("commerce.productDetails")}
		>
			{primary ? (
				<ProductOfferSummary offer={primary} />
			) : (
				<p className="item-product-details__empty">{t("commerce.noOffers")}</p>
			)}
			{others.length > 0 ? (
				<details className="product-details-disclosure">
					<summary>
						{t("commerce.moreOffers", {
							count: formatNumber(locale, others.length),
						})}
					</summary>
					{others.map((offer) => (
						<ProductOfferSummary key={offer.id} offer={offer} />
					))}
				</details>
			) : null}
			{candidate.product.attributes.length > 0 ? (
				<details className="product-details-disclosure">
					<summary>{t("commerce.specifications")}</summary>
					<ProductAttributes attributes={candidate.product.attributes} />
				</details>
			) : null}
		</section>
	);
}
