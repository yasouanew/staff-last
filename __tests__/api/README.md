# API Integration Test Suite

End-to-end tests for the app's HTTP layer. Each suite drives the **real** feature API
services (`authApi`, `leaveApi`, `notificationsApi`, `deviceTokenApi`) through the
**real** shared axios client against an in-process mock server, so what is under test is
how the app *handles* each response — not whether it called a URL.

```
__tests__/api/
├── auth.test.ts              Suite 1 — Authentication & Security
├── resilience.test.ts        Suite 2 — Resilience & Edge Cases
├── dataHandling.test.ts      Suite 3 — Data Handling (pagination, uploads)
├── pushNotifications.test.ts Suite 4 — Push notification lifecycle
└── README.md
src/testing/api/              The harness (kept out of the test-discovery path)
├── mockServer.ts             Router + adapter + journal + response helpers
├── fixtures.ts               Schema-valid payload factories
└── harness.ts                Per-suite lifecycle (install, token, cooldown, teardown)
```

Run just this suite:

```bash
npx jest __tests__/api
```

## Why an axios adapter instead of MSW

The brief allowed either MSW or an axios mock adapter. This is the adapter, for three
reasons:

1. **MSW intercepts below axios.** It needs `XMLHttpRequest`/`fetch` shims that the
   React Native Jest preset does not provide, so the harness would mock Node's HTTP
   stack and then assert on a transport the app never uses in production.
2. **Adapter mocking keeps the real client in the loop.** The request interceptor
   (`Authorization`, `X-Request-Id`), the response interceptor (envelope validation,
   error normalisation, 401 single-flight) and the retry policy all run unchanged. That
   *is* the behaviour under test. A mock that short-circuits axios would assert the
   app's *call* rather than the app's *handling*.
3. **No global setup.** MSW's server is normally started in a global `setupFiles` hook,
   which would touch all existing suites. This harness is installed per-suite by an
   explicit `beforeEach`, so suites that do not use it are unaffected.

It also matches the seam the existing `src/api/__tests__/client*.test.ts` suites already
use, so there is one convention rather than two.

## Using the harness

```ts
import { createApiHarness, rejectionOf } from '../../src/testing/api/harness';
import { authUser } from '../../src/testing/api/fixtures';
import { ok, fail, companyLocked, permissionDenied } from '../../src/testing/api/mockServer';

const harness = createApiHarness();

beforeEach(() => harness.setup());
afterEach(() => harness.teardown());

it('does something', async () => {
    await harness.signIn();                            // seeds the real token store
    harness.server.get('/auth/me', () => ok(authUser()));

    await expect(authApi.me()).resolves.toMatchObject({ id: 7 });

    expect(harness.server.requestsTo('/auth/me')[0]?.headers.authorization).toBe('Bearer …');
});
```

`setup()` resets the adapter, the in-memory token, the 401 cooldown, the unauthorized
handler and the error reporter — so no test inherits state from a neighbour. That is the
failure mode that makes integration suites untrustworthy, and the harness closes it
explicitly rather than relying on ordering.

## The three behaviours that make the mock honest

These are the parts worth reading before adding a suite:

1. **Non-2xx responses are rejected, not resolved.** The adapter applies
   `validateStatus` and throws an `AxiosError`, exactly as axios's own adapters do. An
   adapter that merely resolves a 401 would let the body into the response
   interceptor's *success* path, where the envelope validator would turn it into a
   generic `kind: 'server'` — and every security test would observe the wrong error.
2. **Bodies are decoded, not passed through.** A JSON body reaches the adapter as a
   *string* (axios serialises it in `transformRequest`), so the journal parses it back;
   a `FormData` is left intact so multipart tests can inspect its parts.
3. **Unmatched routes fail loudly.** A missing handler produces a named 404 rather than
   a silent timeout, so a test author sees which route they forgot.

## What the suite found

Two real defects surfaced while writing these tests. Both are fixed, with regression
guards in place:

| Defect | Symptom | Fix |
| --- | --- | --- |
| `normalizeError` was not idempotent | Any endpoint that normalised defensively reported every failure as `kind: 'unknown'`, discarding the 403/404/422 status. | `normalizeError` now returns an already-normalised `AppError` unchanged (guarded by a new exported `isAppError`). |
| `deviceTokenApi.register` read `response.data.data` | The interceptor already unwraps the envelope, so the resource is at `response.data`. Registration therefore returned `undefined` for **every** successful response, silently discarding the stored device. | Reads `response.data`, and treats a non-object body (including a 204's `''`) as "nothing to report". |

## Coverage map

### Suite 1 — Authentication & Security
Login success (payload, JSON body, no leaked `Authorization` on a public endpoint,
correlation id, contract validation); invalid login (401, 403 inactive, 429 throttling
with no retry); expired token (401 signals the session handler, bearer attached,
non-retryable, correlation id shared); company locked (message-match distinguishes it
from a permission denial, copy preserved, session *not* cleared); permission denied
(G2 `leave-types` 403, empty field map); logout (FCM token forwarded, empty-body
variant).

### Suite 2 — Resilience & Edge Cases
Malformed envelope (non-boolean `success`, contradictory `success:false` on 2xx, HTML
gateway page, bare payload passthrough); malformed payload (renamed field, wrong type,
paginator switch on `/notifications`, retryable classification); 422 (field-error map,
first-message flattening, G2 `employee_id`, empty map, no retry); transport failures
(network, timeout, transient 503 retried on GET, never on POST, correlation id);
odd-but-valid payloads (string decimals, null relations, empty page, 404).

### Suite 3 — Data Handling
Pagination (page/per_page params, omitted filters, no `employee_id`, metadata
round-trip, `data.data` nesting, final empty page, missing/mistyped meta, notification
wrapper, 404 no-retry); attachments (multipart not JSON, `attachments[]` key, scalar
stringification, no boundary-less Content-Type, empty reason omitted, JSON path, no
`attachments` key on the JSON path, response validation, 422 upload errors, no retry).

### Suite 4 — Push Notifications
Registration (validated resource, payload + bearer, body-less 200 and 204 as success,
partial-resource rejection, 422 normalisation, 404/410 dead token, offline, no retry,
upsert re-send); deletion (JSON body on DELETE, bearer, body-less success, 404
already-removed, 403, no retry, 401); notification reads backing the inbox (unread
count, mistyped count, mark one/all read, inbox wrapper, 429).

## Adding a suite

1. Register handlers with `harness.server.get/post/put/patch/delete(path, handler)`.
   `:param` segments match anything.
2. Use the response helpers — `ok`, `created`, `fail`, `validationError`, `raw`, `html`,
   `networkError`, `timeout`, `companyLocked`, `permissionDenied` — so the test states
   its intent instead of hand-building envelope JSON.
3. Assert on the journal (`requestsTo`, `hitCount`) to pin what was sent, especially
   `params` and `headers`.
4. Add a fixture factory to `src/testing/api/fixtures.ts` for any new resource. It must
   satisfy the endpoint's Zod schema — a fixture that does not makes the suite fail for
   the wrong reason.
5. Where a test documents behaviour that is *not* endorsed, say so in the test name and
   a comment (see the login-401 case in `auth.test.ts`), so a future reader can tell a
   deliberate characterisation from an accidental assertion.
