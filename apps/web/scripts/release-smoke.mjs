const rawOrigin = process.argv[2];

if (!rawOrigin) {
	throw new Error("Usage: bun run release:smoke -- https://example.workers.dev");
}

const origin = new URL(rawOrigin);
const localHostname = origin.hostname === "localhost" || origin.hostname === "127.0.0.1";

if (origin.username || origin.password || origin.search || origin.hash) {
	throw new Error("The smoke-test origin must not include credentials, a query, or a fragment.");
}
if (origin.protocol !== "https:" && !(localHostname && origin.protocol === "http:")) {
	throw new Error("Use an HTTPS origin, or HTTP only for localhost.");
}

origin.pathname = "/";

function expect(condition, message) {
	if (!condition) throw new Error(message);
}

function expectHeader(response, name, expected) {
	const actual = response.headers.get(name);
	expect(actual !== null, `${response.url} is missing ${name}.`);
	if (typeof expected === "string") {
		expect(actual.toLowerCase().includes(expected.toLowerCase()), `${response.url} has an unexpected ${name} value.`);
	} else {
		expect(expected.test(actual), `${response.url} has an unexpected ${name} value.`);
	}
}

async function smoke(pathname, expectedStatus) {
	const response = await fetch(new URL(pathname, origin), {
		headers: { accept: pathname.startsWith("/api/") ? "application/json" : "text/html" },
		redirect: "manual",
	});
	expect(response.status === expectedStatus, `${pathname} returned ${response.status}; expected ${expectedStatus}.`);
	return response;
}

const documentResponse = await smoke("/", 200);
expectHeader(documentResponse, "content-type", "text/html");
expectHeader(documentResponse, "content-security-policy", "default-src 'self'");
expectHeader(documentResponse, "permissions-policy", "camera=()");
expectHeader(documentResponse, "referrer-policy", "no-referrer");
expectHeader(documentResponse, "x-content-type-options", "nosniff");
expectHeader(documentResponse, "x-frame-options", "deny");

const publicApiResponse = await smoke("/api/", 200);
expectHeader(publicApiResponse, "cache-control", "no-store");
expectHeader(publicApiResponse, "content-type", "application/json");
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
expectHeader(publicApiResponse, "x-request-id", requestIdPattern);
const publicApiBody = await publicApiResponse.json();
expect(publicApiBody?.name === "Cloudflare", "/api/ returned an unexpected response body.");

const privateApiResponse = await smoke("/api/session", 401);
expectHeader(privateApiResponse, "cache-control", "no-store");
expectHeader(privateApiResponse, "content-type", "application/json");
expectHeader(privateApiResponse, "x-request-id", requestIdPattern);

console.log(`Release smoke passed for ${origin.origin}: document, public API, and authentication boundary.`);
