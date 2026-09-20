# WantKit monitoring

Updated 2026-09-21. The agreed first step is Cloudflare-native backend logs plus an independent uptime monitor. Axiom remains optional. Initial monitoring and cost safeguards are deployed to preview and production from user-pushed `a0f23a2`. Both environments passed release smoke, 15 live checks and correlated completion-log verification. On 2026-09-21 both uptime monitors were independently verified Up with five-minute checks and email notifications enabled. The user confirmed completing the downtime/recovery email-delivery test on 2026-09-21; the agreed first monitoring pass is complete.

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

The user confirmed email activation, then signed into UptimeRobot on 2026-09-21. The dashboard initially contained only the website monitor, so the earlier health-monitor setup response had not established an active monitor. Created the missing health monitor once through the authenticated free dashboard, keeping the existing website monitor.

| Monitor | Provider ID | URL | Verified state |
| --- | --- | --- | --- |
| wantkit.todoless.dev | `804041104` | https://wantkit.todoless.dev/ | Up; every 5 minutes |
| WantKit backend health | `804042598` | https://wantkit.todoless.dev/api/health | Up; every 5 minutes |

Both saved monitor forms have the chosen email contact enabled with no delay/repeat. Account email notifications are enabled for both Up and Down events. No paid options, public status page, API key or extra monitor were added. **Do not resubmit either setup request or activate the old health-monitor email:** the two intended monitors now exist.

The website monitor checks public-page availability. The health endpoint checks D1 with `SELECT 1 AS ok` and reads no application table. Healthy responses are HTTP 200; a database failure, unexpected result or two-second timeout returns 503. Its JSON contains only `status: ok/degraded`, with no-store. A direct HEAD check also returned 200/no-store. The deadline bounds the response, not an already submitted D1 operation. It does not check Google OAuth, R2/Images, research providers or private user flows. The free HTTP monitor keeps the provider's default success-code handling (2xx/3xx); strict status/body matching was not configured.

**Email delivery — user-confirmed complete, 2026-09-21.** After the dashboard checks, the user confirmed completing the downtime/recovery email test. This records their confirmation; no independent inbox inspection or detailed test transcript was collected. The documented Test Notification action had not been exposed in the UI inspected by the assistant, and the assistant did not send a test alert, induce an outage or create a disposable monitor. Monitor status/contact checks remain independently verified above.

Private evidence: `/tmp/wantkit-monitoring-20260920/uptime-dashboard-verified.json`. Original submission guards remain intact; no UptimeRobot credentials or API key were obtained.

## Release and verification

Steps 1–4 below completed on 2026-09-20 for `a0f23a2`. Step 5 monitor state/contact verification completed on 2026-09-21, with email-delivery testing subsequently confirmed complete by the user. Production version: `17980135-9482-492a-8dd8-a97d6f31434d`; preview: `7131c9bb-1ae6-40a3-8c70-28ad13c3eedd`. Release evidence: `/tmp/wantkit-monitoring-release-a0f23a2/`.

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
- [UptimeRobot test-notification guide](https://help.uptimerobot.com/en/articles/11602913-how-to-test-notifications-in-uptimerobot-quick-guide)
- [UptimeRobot free plan](https://help.uptimerobot.com/en/articles/11604710-who-should-use-uptimerobot-s-free-plan)
