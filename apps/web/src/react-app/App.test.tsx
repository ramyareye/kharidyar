import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { LocaleProvider } from "./LocaleProvider";

const session = vi.hoisted(() => ({ signedIn: true, pending: false }));
beforeEach(() => {
	session.signedIn = true;
	session.pending = false;
});

vi.mock("./auth-client", () => ({
	authClient: {
		useSession: () => ({
			data: session.signedIn
				? { user: { email: "invitee@example.com", name: "Invited person" } }
				: null,
			isPending: session.pending,
			error: null,
		}),
	},
}));
vi.mock("./PlanningDashboard", () => ({
	PlanningDashboard: () => <div>Normal planning dashboard</div>,
}));

afterEach(() => vi.unstubAllGlobals());

describe("Public product page routing", () => {
	it.each(["/about", "/about/"])("shows the public user page at %s even while session loading", (pathname) => {
		session.pending = true;
		vi.stubGlobal("window", { location: new URL(`https://wantkit.example${pathname}`) });
		const html = renderToStaticMarkup(<LocaleProvider initialLocale="en"><App /></LocaleProvider>);
		expect(html).toContain("Good decisions start with");
		expect(html).not.toContain("The workspace before checkout.");
		expect(html).not.toContain("Normal planning dashboard");
		expect(html).toContain("Illustrative products and prices.");
	});
	it("offers Google sign-in on the anonymous home page", () => {
		session.signedIn = false;
		vi.stubGlobal("window", { location: new URL("https://wantkit.example/") });
		const html = renderToStaticMarkup(<LocaleProvider initialLocale="en"><App /></LocaleProvider>);
		expect(html).toContain("Good decisions start with");
		expect(html).toContain("Continue with Google");
		expect(html).toContain('id="get-started"');
		expect(html).not.toContain("The workspace before checkout.");
		expect(html).toContain('href="/partners"');
	});
	it.each([
		{ pathname: "/partners", signedIn: false },
		{ pathname: "/partners/", signedIn: false },
		{ pathname: "/partners", signedIn: true },
		{ pathname: "/partners/", signedIn: true },
	])("keeps the partner story public at $pathname (signed in: $signedIn)", ({ pathname, signedIn }) => {
		session.signedIn = signedIn;
		session.pending = true;
		vi.stubGlobal("window", { location: new URL(`https://wantkit.example${pathname}`) });
		const html = renderToStaticMarkup(<LocaleProvider initialLocale="en"><App /></LocaleProvider>);
		expect(html).toContain("A shared plan for");
		expect(html).toContain("The workspace before checkout.");
		expect(html).toContain('href="/about"');
		expect(html).not.toContain("Good decisions start with");
		expect(html).not.toContain("Normal planning dashboard");
	});
	it("preserves focused assistant sign-in instead of showing the landing page", () => {
		session.signedIn = false;
		vi.stubGlobal("window", { location: new URL("https://wantkit.example/connectors") });
		const html = renderToStaticMarkup(<LocaleProvider initialLocale="en"><App /></LocaleProvider>);
		expect(html).toContain("auth-story");
		expect(html).toContain("Continue with Google");
		expect(html).not.toContain("landing-hero");
	});
});

describe("Invitation entry route", () => {
	it.each(["/invite", "/invite/"])(
		"opens the invitation screen for a signed-in user at %s",
		(pathname) => {
			vi.stubGlobal("window", {
				location: new URL(
					`https://wantkit.example${pathname}#token=${"a".repeat(43)}`,
				),
			});
			const html = renderToStaticMarkup(
				<LocaleProvider initialLocale="en">
					<App />
				</LocaleProvider>,
			);
			expect(html).toContain("Review invitation");
			expect(html).not.toContain("Normal planning dashboard");
		},
	);
});

describe("Invitation routing while signed out", () => {
	it("keeps the invitation entry instead of replacing it with the normal sign-in page", () => {
		session.signedIn = false;
		vi.stubGlobal("window", {
			location: new URL(
				`https://wantkit.example/invite#token=${"a".repeat(43)}`,
			),
		});
		const html = renderToStaticMarkup(
			<LocaleProvider initialLocale="en">
				<App />
			</LocaleProvider>,
		);
		expect(html).toContain("Review invitation");
		expect(html).not.toContain("auth-story");
	});
	it.each(["", "#token=broken"])(
		"explains a missing or incomplete invitation (%s)",
		(hash) => {
			vi.stubGlobal("window", {
				location: new URL(`https://wantkit.example/invite${hash}`),
			});
			const html = renderToStaticMarkup(
				<LocaleProvider initialLocale="en">
					<App />
				</LocaleProvider>,
			);
			expect(html).toContain("invitation link is missing or incomplete");
			expect(html).not.toContain("Normal planning dashboard");
		},
	);
	it("leaves the signed-in dashboard at the home route", () => {
		vi.stubGlobal("window", { location: new URL("https://wantkit.example/") });
		const html = renderToStaticMarkup(
			<LocaleProvider initialLocale="en">
				<App />
			</LocaleProvider>,
		);
		expect(html).toContain("Normal planning dashboard");
		expect(html).not.toContain("Review invitation");
	});
});
