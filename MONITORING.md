# WantKit monitoring

Updated 2026-09-20. The agreed first step is Cloudflare-native backend logs plus an independent uptime monitor. Axiom remains optional. The initial monitoring implementation is pushed as `349231a`; the cost-sampling follow-up is local and requires commit/release before it is live.

## Backend logs

Workers Logs is already enabled for preview (`kharidyar-preview`) and production (`kharidyar`). Automatic invocation logs remain disabled. Existing structured error events are preserved.

For `/api/*` and `/.well-known/*`, all failed (HTTP 400+) and slow responses emit one `http_request_completed` event. Routine responses are randomly sampled at 10%:

| Field | Meaning |
| --- | --- |
| `requestId` | Server-generated ID, also returned in `x-request-id` |
| `releaseId`, `releaseTag` | Cloudflare version metadata; the tag is optional |
| `method`, `route` | HTTP method and registered route pattern, without parameter values or query strings |
| `status` | HTTP response status |
| `durationMs` | Time until the response headers are ready; excludes later streaming and background work |
| `slow` | True at two seconds or longer; a diagnostic filter, not a configured alert |
| `sampleRate` | `1` for failed/slow responses, `0.1` for sampled routine responses |

Server failures (5xx) use error level; other completions use info level. Filter by `event` before counting requests, because a failed request can also emit an existing detailed error event. Expected 401/403/404 responses are not automatically treated as outages.

The new completion event excludes cookies, authorization headers, bodies, raw URLs, query parameters, user IDs, product data and private media. Existing error-event resource fields are unchanged. No telemetry is forwarded to a new service. Cloudflare head sampling remains 100% so it does not discard failures after the application makes its sampling decision. Routine completion-event volume falls by about 90% on average; failure/slow-response volume and existing error events remain unsampled, so this is not a hard cost cap. Response bodies, security headers and request IDs are unchanged even when a completion event is skipped.

Raw log counts now overrepresent failures and slow responses. Use Cloudflare request metrics for total traffic, or estimate counts from completion events using `sum(1 / sampleRate)` and label the result as an estimate. Do not use raw sampled log counts or durations to calculate overall error rates or latency percentiles.

In Cloudflare's Worker **Observability** view, select the appropriate Worker and use these filters:

- Failed requests: `event = http_request_completed`, `status >= 500`; group by route and release.
- Slow requests: `event = http_request_completed`, `slow = true`; compare duration by route.
- A reported failure: search the `x-request-id` from the response to correlate completion and error events.
- Existing background failures: inspect research workflow/provider and media-cleanup events separately; HTTP completion does not describe background job success.

These are investigation recipes, not newly saved dashboard queries or automated log alerts. Cloudflare's standard traffic alerts are zone-wide and cannot be scoped to a hostname/path; no domain-wide policy was created for `todoless.dev`. Custom application-log email alerts remain a separate follow-up requiring Axiom or another alerting destination. Do not claim they are active.

## Cost safeguards

The user authorized 10% routine-response sampling and $5/$10 usage-spend email alerts before release. The account's Cloudflare Billing → Billable usage page showed $0.00 usage charges for the current cycle on 2026-09-20; subscription fees are separate. Existing $2 and $10 budget alerts were found, and the $10 alert lists the chosen email recipient. Preserve both existing alerts rather than creating a duplicate $10 alert.

The new `Usage spend — $5 warning` alert is **saved and verified** with threshold USD 5. The budget-alert list shows three policies ($2, $5 and $10); the $5 and existing $10 alerts both list the user's chosen email. The earlier browser interruption was resolved through the user's signed-in in-app browser. These alerts cover account-wide usage charges, including other apps; they notify rather than stop spending. Email delivery has not been tested. No paid monitoring subscription or plan upgrade was added.

## Independent availability monitoring

The user chose email alerts. A request was submitted through UptimeRobot's official free agent setup for **https://wantkit.todoless.dev/**. The user must open the confirmation email and click **Activate**. The API's uniform HTTP 200 response does not prove email delivery or monitor creation; activation is still unverified. The chosen recipient is recorded in the conversation/private setup evidence, not this repository.

Once activated, the website monitor checks availability every five minutes. It observes the public URL, not private workspace data. This first monitor checks the web page; it does not establish database or every API route's health. Do not create a public status page or add paid features as part of this setup.

After the backend release, add a second HTTPS monitor for **https://wantkit.todoless.dev/api/health**, with the same email contact, a five-minute interval and expected HTTP 200. The endpoint returns only `{"status":"ok"}` or `{"status":"degraded"}` and is not cached. It checks the D1 binding with `SELECT 1 AS ok`, without reading any application table. A database failure, unexpected result or two-second timeout returns 503. The timeout bounds the response; it does not cancel an already submitted D1 operation. It does not check Google OAuth, R2/Images, research providers or private user flows.

Verify the second monitor only after the endpoint is live. Confirm an email notification using a disposable monitor/test notification in the provider, then remove that test monitor. Never deliberately break production to test an alert. Delivery and recovery emails remain unverified until this is done.

Private setup evidence: `/tmp/wantkit-monitoring-20260920/`. The request script has a one-shot submission guard; do not rerun it to probe whether the email exists or to resend without a user request. No UptimeRobot credentials or API key were obtained.

## Release and verification

1. Review/commit through the repository's exact staged-tree approval gate, then push and release preview before production.
2. Add the new `CF_VERSION_METADATA` version-metadata binding to the frozen deployment configuration while preserving every existing live variable, secret, resource, domain and owner-only integration setting. This is the sole intended binding addition. Do not overwrite live settings with checked-in disabled integration defaults.
3. Run `bun run release:smoke -- <origin>` in each environment. It now requires a healthy `/api/health` alongside the document, public API and authentication boundary. Older deployed builds lack this route and will fail the updated smoke until released.
4. Inspect a bounded public test request in Cloudflare Logs: confirm the status, route, duration, request ID, current release ID and `sampleRate`. A normal response may be absent because it is sampled. Use one unauthenticated request to a protected endpoint (expected 401, retained at rate 1) for deterministic verification; do not read private data. Confirm private request inputs are absent. Local tests cover database error/timeout and handled 5xx responses; do not induce these in production.
5. Activate/verify the independent monitors and email contact. Record active state and notification evidence before marking monitoring setup complete.

No migration or database restore is needed for this change. A Worker rollback removes the health endpoint; pause or retarget its monitor deliberately during rollback to avoid misleading alerts. The previous production version and recovery process are in RELEASE.md.

## Sources

- [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Version metadata binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/version-metadata/)
- [Cloudflare HTTP alert scope and limitations](https://developers.cloudflare.com/notifications/reference/traffic-alerts/)
- [Cloudflare budget alerts](https://developers.cloudflare.com/billing/manage/budget-alerts/)
- [UptimeRobot agent setup and response contract](https://uptimerobot.com/quick-monitor-setup/)
- [UptimeRobot free plan](https://help.uptimerobot.com/en/articles/11604710-who-should-use-uptimerobot-s-free-plan)
