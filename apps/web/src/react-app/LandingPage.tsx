import { useState, type ReactNode } from "react";
import { formatMoney } from "@kharidyar/i18n";
import { useLocale } from "./locale-context";
import { ThemeSwitch } from "./ThemeSwitch";
import { BrandMark, LocaleSwitch } from "./ui";
import "./LandingPage.css";

function ChairDrawing({ variant }: { variant: "arc" | "frame" }) {
	return (
		<svg
			viewBox="0 0 260 210"
			aria-hidden="true"
			className={`landing-chair landing-chair--${variant}`}
		>
			<ellipse
				cx="130"
				cy="190"
				rx="78"
				ry="8"
				fill="currentColor"
				opacity=".08"
			/>
			{variant === "arc" ? (
				<>
					<path
						d="M75 138 66 187M185 138l10 49M94 145l-2 35M166 145l3 35"
						stroke="#6b513e"
						strokeWidth="9"
						strokeLinecap="round"
					/>
					<path
						d="M73 124V78c0-25 18-42 57-42s57 17 57 42v46"
						fill="#b9c6ab"
						stroke="#819574"
						strokeWidth="3"
					/>
					<path
						d="M67 117c-14-34-31-27-26-3l8 29c4 11 17 14 30 14h102c13 0 26-3 30-14l8-29c5-24-12-31-26 3"
						fill="#a5b798"
						stroke="#819574"
						strokeWidth="3"
					/>
					<rect
						x="70"
						y="114"
						width="120"
						height="31"
						rx="14"
						fill="#c5d1b9"
						stroke="#819574"
						strokeWidth="3"
					/>
				</>
			) : (
				<>
					<path
						d="m62 72 12 113m124-113-12 113M61 122h138M74 157h112"
						fill="none"
						stroke="#987554"
						strokeWidth="9"
						strokeLinecap="round"
					/>
					<rect
						x="79"
						y="40"
						width="102"
						height="88"
						rx="9"
						fill="#dfd2bf"
						stroke="#c1ae91"
						strokeWidth="3"
					/>
					<path
						d="M81 114h98l11 22c3 8-2 15-11 15H81c-9 0-14-7-11-15Z"
						fill="#e8ddca"
						stroke="#c1ae91"
						strokeWidth="3"
					/>
					<path
						d="M54 99h35m82 0h35"
						stroke="#987554"
						strokeWidth="9"
						strokeLinecap="round"
					/>
				</>
			)}
		</svg>
	);
}

function ExampleShortlist() {
	const { t, locale } = useLocale();
	const [comparing, setComparing] = useState(false);
	const [selected, setSelected] = useState<"arc" | "frame" | null>(null);
	const options = [
		{
			id: "arc" as const,
			name: t("landing.arc"),
			price: 16900,
			material: t("landing.upholstered"),
			width: "74 cm",
		},
		{
			id: "frame" as const,
			name: t("landing.frame"),
			price: 22900,
			material: t("landing.wood"),
			width: "68 cm",
		},
	];
	return (
		<section className="landing-demo" aria-labelledby="example-title">
			<div className="landing-demo__bar">
				<span className="landing-demo__dot" />
				<span>{t("landing.example")}</span>
				<span className="landing-demo__private">{t("landing.localDemo")}</span>
			</div>
			<div className="landing-demo__heading">
				<div>
					<p>{t("landing.collection")}</p>
					<h2 id="example-title">{t("landing.corner")}</h2>
				</div>
				<span className="landing-demo__count">{t("landing.optionCount")}</span>
			</div>
			<div className="landing-demo__toolbar">
				<span>{t("landing.chairNeed")}</span>
				<button
					type="button"
					aria-pressed={comparing}
					onClick={() => setComparing(!comparing)}
				>
					{comparing ? t("landing.showCards") : t("landing.compare")}{" "}
					<span aria-hidden="true">⇄</span>
				</button>
			</div>
			{comparing ? (
				<div
					className="landing-demo__scroll"
					tabIndex={0}
					role="region"
					aria-label={t("landing.comparison")}
				>
					<table className="landing-demo__table">
						<caption>{t("landing.comparison")}</caption>
						<thead>
							<tr>
								<th scope="col">{t("landing.detail")}</th>
								{options.map((option) => (
									<th key={option.id} scope="col">
										{option.name}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							<tr>
								<th scope="row">{t("landing.price")}</th>
								{options.map((option) => (
									<td key={option.id}>
										{formatMoney(locale, option.price, "EUR")}
									</td>
								))}
							</tr>
							<tr>
								<th scope="row">{t("landing.material")}</th>
								{options.map((option) => (
									<td key={option.id}>{option.material}</td>
								))}
							</tr>
							<tr>
								<th scope="row">{t("landing.width")}</th>
								{options.map((option) => (
									<td key={option.id}>
										<bdi>{option.width}</bdi>
									</td>
								))}
							</tr>
							<tr>
								<th scope="row">{t("landing.plan")}</th>
								{options.map((option) => (
									<td key={option.id}>
										<button
											type="button"
											aria-pressed={selected === option.id}
											onClick={() =>
												setSelected(selected === option.id ? null : option.id)
											}
										>
											{selected === option.id
												? t("landing.selected")
												: t("landing.choose")}
										</button>
									</td>
								))}
							</tr>
						</tbody>
					</table>
				</div>
			) : (
				<div className="landing-demo__cards">
					{options.map((option) => (
						<button
							type="button"
							key={option.id}
							className="landing-demo__card"
							aria-pressed={selected === option.id}
							onClick={() =>
								setSelected(selected === option.id ? null : option.id)
							}
						>
							<div className="landing-demo__art">
								<ChairDrawing variant={option.id} />
								<span className="landing-demo__check" aria-hidden="true">
									{selected === option.id ? "✓" : "+"}
								</span>
							</div>
							<span className="landing-demo__name">{option.name}</span>
							<span className="landing-demo__price">
								{formatMoney(locale, option.price, "EUR")}
							</span>
							<span className="landing-demo__material">{option.material}</span>
						</button>
					))}
				</div>
			)}
			<p className="landing-demo__result" aria-live="polite">
				{selected
					? t("landing.selection", {
							name: options.find((option) => option.id === selected)!.name,
						})
					: t("landing.tryDemo")}
			</p>
			<p className="landing-demo__disclaimer">{t("landing.demoDisclaimer")}</p>
		</section>
	);
}

export function LandingPage({
	signIn,
	signedIn = false,
	audience = "users",
}: {
	signIn?: ReactNode;
	signedIn?: boolean;
	audience?: "users" | "partners";
}) {
	const { t } = useLocale();
	const partners = audience === "partners";
	const startLink = signIn ? "#get-started" : signedIn ? "/" : "/#get-started";
	const startLabel = signedIn ? t("landing.openApp") : t("landing.start");
	return (
		<div className={partners ? "landing-page landing-page--partners" : "landing-page"}>
			<a className="landing-skip" href="#main-content">
				{t("landing.skip")}
			</a>
			<header className="landing-header">
				<a href="/about" aria-label={t("landing.home")}>
					<BrandMark />
				</a>
				<nav aria-label={t("landing.navigation")}>
					<a href={partners ? "/about" : "#how-it-works"}>
						{partners ? t("landing.productPage") : t("landing.how")}
					</a>
					<a href={partners ? "#product-brief" : "/partners"}>
						{partners ? t("landing.brief") : t("landing.partners")}
					</a>
				</nav>
				<div className="landing-header__actions">
					<ThemeSwitch />
					<LocaleSwitch />
					<a className="landing-link" href={startLink}>
						{signedIn ? t("landing.openApp") : t("landing.signIn")}{" "}
						<span aria-hidden="true">↗</span>
					</a>
				</div>
			</header>
			<main id="main-content">
				<section className="landing-hero" aria-labelledby="landing-title">
					<div className="landing-hero__copy">
						<p className="landing-eyebrow">
							<span />
							{partners ? t("landing.briefEyebrow") : t("landing.eyebrow")}
						</p>
						<h1 id="landing-title">
							{t(partners ? "landing.partnerTitle" : "landing.title")}{" "}
							<em>
								{t(
									partners
										? "landing.partnerTitleAccent"
										: "landing.titleAccent",
								)}
							</em>
						</h1>
						<p className="landing-hero__description">
							{t(
								partners ? "landing.partnerDescription" : "landing.description",
							)}
						</p>
						<div className="landing-hero__actions">
							<a className="landing-cta" href={partners ? "/about" : startLink}>
								{partners ? t("landing.explore") : startLabel}
								<span aria-hidden="true">↗</span>
							</a>
							<a
								className="landing-cta landing-cta--secondary"
								href={partners ? "#product-brief" : "#how-it-works"}
							>
								{t(partners ? "landing.readBrief" : "landing.seeHow")}{" "}
								<span aria-hidden="true">↓</span>
							</a>
						</div>
						<p className="landing-hero__note">{t("landing.beta")}</p>
					</div>
					<ExampleShortlist />
				</section>
				<div className="landing-usecases">
					<span>{t("landing.for")}</span>
					<span>{t("landing.homeUse")}</span>
					<span>{t("landing.techUse")}</span>
					<span>{t("landing.sharedUse")}</span>
				</div>
				{!partners && (
					<section
						className="landing-process"
						id="how-it-works"
						aria-labelledby="process-title"
					>
						<div className="landing-section-heading">
							<p className="landing-eyebrow">{t("landing.how")}</p>
							<h2 id="process-title">{t("landing.processTitle")}</h2>
						</div>
						<div className="landing-steps">
							{(["save", "compare", "decide"] as const).map((step, index) => (
								<article key={step}>
									<span className="landing-step-number" aria-hidden="true">
										0{index + 1}
									</span>
									<h3>{t(`landing.${step}Title`)}</h3>
									<p>{t(`landing.${step}Body`)}</p>
								</article>
							))}
						</div>
					</section>
				)}
				{partners && (
					<section
						className="landing-brief"
						id="product-brief"
						aria-labelledby="brief-title"
					>
						<div>
							<p className="landing-eyebrow">{t("landing.briefEyebrow")}</p>
							<h2 id="brief-title">{t("landing.briefTitle")}</h2>
							<p className="landing-brief__intro">{t("landing.briefBody")}</p>
							<a className="landing-link" href="/about">
								{t("landing.explore")} <span aria-hidden="true">↗</span>
							</a>
						</div>
						<dl>
							{(["problem", "approach", "stage"] as const).map((key) => (
								<div key={key}>
									<dt>{t(`landing.${key}Label`)}</dt>
									<dd>{t(`landing.${key}Body`)}</dd>
								</div>
							))}
						</dl>
					</section>
				)}
				<section
					id="get-started"
					className="landing-start"
					aria-labelledby="start-title"
				>
					<div>
						<p className="landing-eyebrow">
							{t(
								partners
									? "landing.partnerStartEyebrow"
									: "landing.startEyebrow",
							)}
						</p>
						<h2 id="start-title">
							{t(partners ? "landing.partnerStartTitle" : "landing.startTitle")}
						</h2>
						<p>
							{t(partners ? "landing.partnerStartBody" : "landing.startBody")}
						</p>
					</div>
					{signIn ?? (
						<a className="landing-cta" href={partners ? "/about" : startLink}>
							{partners ? t("landing.productPage") : startLabel}
							<span aria-hidden="true">↗</span>
						</a>
					)}
				</section>
			</main>
			<footer className="landing-footer">
				<BrandMark compact />
				<p>{t("landing.footer")}</p>
				<a href={partners ? "/about" : "/partners"}>
					{partners ? t("landing.productPage") : t("landing.partners")}
				</a>
			</footer>
		</div>
	);
}
