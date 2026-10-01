# Screen integration tests

The standardized template for testing a screen end to end with
[React Native Testing Library](https://callstack.github.io/react-native-testing-library/).

Every suite in this directory is written to the same shape, so a reviewer can read any one
of them and know exactly where to look. Start with
[`HomeScreen.test.tsx`](./HomeScreen.test.tsx) — it is the reference implementation — then
copy its skeleton for a new screen.

## The nine blocks

| # | Block | What it pins |
|---|-------|--------------|
| 1 | Loading | the first-paint skeleton — never a blank screen, never a stale empty state |
| 2 | Success | the data the user came for, including anything derived from it |
| 3 | Empty | zero rows *after a successful load* (`EmptyState`, not an error) |
| 4 | Error | the failure branch: its title, its message copy and its retry affordance |
| 5 | Retry recovery | tapping retry re-requests and recovers in place |
| 6 | Action pending | the in-flight state, driven by a request that has not settled |
| 7 | Action success | the write lands and the UI reflects it |
| 8 | Action failure | a failed write degrades gracefully instead of blanking the screen |
| 9 | Accessibility | role + label + reachable target on every interactive element |

Blocks 6–8 are about **the screen's action**, whatever that is. Roster and Leave are
read-only (the employee role cannot write a roster, and the backend exposes no withdraw
endpoint for leave — spec G6), so their action is pull-to-refresh. Notifications and
Settings have real `POST`s. A block that cannot apply to a screen is **documented in the
suite docblock and replaced with the nearest honest assertion** rather than skipped
silently — see [`AccountScreen.test.tsx`](./AccountScreen.test.tsx).

## Coverage matrix

| Screen | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|--------|---|---|---|---|---|---|---|---|---|
| `HomeScreen` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ refresh | ✅ refresh | ✅ refresh | ✅ |
| `MyRosterScreen` | ✅ | ✅ | ✅ none vs. unknown | ✅ + chrome outage | ✅ | ✅ refresh | ✅ refresh | ✅ refresh | ✅ + day tap |
| `LeaveListScreen` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ refresh | ✅ refresh | ✅ refresh | ✅ |
| `NotificationsScreen` | ✅ | ✅ | ✅ | ✅ cached-rows notice | ✅ | ✅ mark-all-read | ✅ mark-read | ✅ outbox + 403 | ✅ |
| `AccountScreen` (Settings) | ✅ cached-first | ✅ | ✅ no identity | ✅ graceful | ✅ revalidation | ✅ sign out | ✅ sign out | ✅ sign out | ✅ |

## Known gaps

Deliberate, tracked omissions — recorded here so they are decisions rather than silent holes.

- **Roster day tap is visual-only.** The strip marks the selected day; it does not scroll the
  feed or filter it, and the feed always shows the whole week. `selectDate` therefore only
  re-marks cells, which block 9 pins (selection moves, the queried week does not). If the
  behaviour is ever wanted, the pieces already exist — `layoutIndex`/`getItemLayout` on the
  list and `WeekDayStrip`'s own measured `getItemLayout` — but the product decision has not
  been made, so nothing is wired to them and no test asserts a scroll.
- **Secondary-request failures are not all modelled.** Where a screen has a second request
  that only decorates the primary one (Roster's `/rosters` chrome, Leave's `per_page=1`
  pending-count probe), only Roster's is asserted in both directions. Leave's probe still
  degrades to a hidden count with no test either way.

## The harness

Three pieces, all shared.

### 1. `setupScreenTest()` — [`src/testing/renderWithProviders.tsx`](../../src/testing/renderWithProviders.tsx)

```tsx
const harness = setupScreenTest();

beforeEach(async () => {
    await harness.setup();
    jest.clearAllMocks();
});

afterEach(async () => {
    await harness.teardown();
});
```

`setup()` resets every global store (session, preferences, inbox, outbox, push) and the
device storage, installs an in-memory **axios adapter**, and pins Reduce Motion;
`teardown()` unmounts inside `act`, cancels the query client and restores everything. A
suite that depends on its neighbour's leftovers therefore fails.

### 2. `harness.server` — the in-process mock API ([`src/testing/api/mockServer.ts`](../../src/testing/api/mockServer.ts))

Routes are matched by `METHOD + path`, first registration wins, and every request is
recorded so a test can assert **what was actually sent**:

```tsx
harness.server.get('/shifts', () => ok(paginated([shift({ date: todayApiDate() })])));
harness.server.post('/auth/logout', () => fail(500, 'Service unavailable.'));

expect(harness.server.hitCount('/auth/logout')).toBe(1);
expect(harness.server.requestsTo('/shifts').at(-1)?.params.date_from).toBe(monday);
```

Helpers cover the Laravel envelope (`ok`, `fail`, `networkError`, `validationError`,
`companyLocked`, …), so a test states its *intent* instead of hand-building JSON. Responses
are validated by the app's real Zod schemas at the boundary, which is why the fixtures in
[`src/testing/api/fixtures.ts`](../../src/testing/api/fixtures.ts) must stay schema-valid.

Note that `GET /shifts` is one route serving several windows, and `GET /leave-requests`
serves both the feed and the subtitle's count probe. Branch inside a single handler on
`request.params` when the two responses need to differ.

### 3. `harness.render(ui, options)` — the provider stack

Renders inside `SafeAreaProvider` → `QueryClientProvider` → `NavigationContainer` with a
deterministic query client (`retry: false`, `gcTime: 0`) and an authenticated session by
default. Options worth knowing:

| Option | Use it for |
|--------|-----------|
| `user: null` | an unauthenticated tree (asserting what a signed-out screen does) |
| `user: authUser({ … })` | a specific identity (unverified email, extra roles, no employee record) |
| `sessionStatus` | `authenticated-offline` and friends |
| `queryClient` | to drive the client directly (`invalidateQueries`) |

Screens are rendered with **mock navigation** (`createMockNavigation()` /
`createMockRoute(name)`), not a navigator: the assertion that matters is *where the screen
navigated*, not that the router works.


## Conventions

- **Assert on the rendered tree, never on hook internals.** A refactor that keeps behaviour
  keeps these suites green.
- **One reason per test.** A failing test should name exactly one broken behaviour.
- **Scope ambiguous text.** Filter chips and status badges share vocabulary ("Pending"), so
  use `within(screen.getByTestId(...))` when a word can legitimately appear twice.
- **Build locale-formatted expectations with the app's own helpers** (`formatDate`,
  `formatTotalDays`) so a locale-data change does not break a structural assertion.
- **Drive pull-to-refresh through the control's own callback.** Home and Roster hand their
  list a `refreshControl` *element*, so there is no list-level handler for
  `fireEvent(list, 'refresh')` to find; Leave passes `onRefresh`/`refreshing` directly and is
  triggered that way.
- **Close the in-flight window.** Prefer a deferred (resolved before the test ends) over a
  promise that never settles, and assert the pending state on a request that is still open.
- **Add a fixture, not an inline literal**, when a resource is shared between suites
  (`roster()`, `leaveRequest()`, `shift()`, `appNotification()`, …).
- **Read global stores directly when the store *is* the consequence.** `useSessionStore`'s
  `status` is what the root navigator switches stacks on, so asserting it asserts what the
  user sees. It is not a shortcut around the UI.

## What this template deliberately does not do

- **No snapshot tests.** A whole-screen snapshot fails on every styling change and pins
  nothing about behaviour.
- **No re-implementation of hook/API unit tests.** Those live beside their source
  (`src/features/*/hooks/__tests__`, `src/api/__tests__`); these suites are the integration
  layer above them.
- **No `--forceExit`.** The harness keeps a zero GC window for mutations, so Jest terminates
  on its own; if a new suite hangs, the cause is in the suite rather than the runner.

## Adding a suite for a new screen

1. Create `__tests__/screens/<Name>.test.tsx` and copy the skeleton from
   [`HomeScreen.test.tsx`](./HomeScreen.test.tsx).
2. Write the suite docblock: which screen/spec it covers, and **which of the nine blocks do
   not apply and why**.
3. Register every route the screen's hooks touch (check the feature's `api/` module — a
   missing route is a 404 the screen will render as an error).
4. Walk the nine blocks in order, then add screen-specific extras inside block 9.
5. Run `npx jest __tests__/screens/<Name>.test.tsx --verbose` and confirm the suite exits
   without Jest's "did not exit" warning.
6. Add the row to the coverage matrix above.

