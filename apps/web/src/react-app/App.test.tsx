import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { LocaleProvider } from "./LocaleProvider";

const session = vi.hoisted(() => ({ signedIn: true }));
beforeEach(() => {
	session.signedIn = true;
});

vi.mock("./auth-client", () => ({
	authClient: {
		useSession: () => ({
			data: session.signedIn
				? { user: { email: "invitee@example.com", name: "Invited person" } }
				: null,
			isPending: false,
			error: null,
		}),
	},
}));
vi.mock("./PlanningDashboard", () => ({
	PlanningDashboard: () => <div>Normal planning dashboard</div>,
}));

afterEach(() => vi.unstubAllGlobals());

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
