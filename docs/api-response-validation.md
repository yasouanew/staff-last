# API response validation

## The problem

[`client.ts`](src/api/client.ts:1) unwraps the Laravel envelope and hands the payload
on:

```ts
response.data = body.data as RawEnvelope;
```

That `as` is a compile-time promise the server has not made. TypeScript types are erased
at runtime, so if the backend renames a field, returns `null` where the type says
required, or a gateway returns an HTML error page, the cast passes silently and a screen
renders `undefined`. The failure surfaces far from its cause — as a blank list, a missing
badge, or a crash in a `formatDate` call.

## The fix

Every critical response is parsed through a **Zod schema at the API boundary**, inside
the service method. Screens never validate; they only render.

```
HTTP response
  └─ axios interceptor unwraps { success, message, data } → data
      └─ service method: parseApiResponse(schema, data, context)
          ├─ valid   → typed value returned to the caller
          └─ invalid → AppError { kind: 'server' } thrown
```

The seam is [`parseApiResponse`](src/api/schemas.ts:1), with the shared building blocks
([`paginationMetaSchema`](src/api/schemas.ts:1), [`paginatedSchema`](src/api/schemas.ts:1),
relation summaries).

### What a mismatch becomes

An `AppError` of kind **`server`**. That choice is deliberate:

- it is a server-side problem, so it reads correctly in the existing
  [`ErrorView`](src/components/ErrorView/ErrorView.tsx:1);
- [`isRetryable`](src/utils/errors.ts:1) treats `server` as retryable — right for the
  transient cases (a gateway blip, a truncated body) and harmless for a permanent one
  (the retry simply fails again).

The raw `ZodError` is attached as `cause` for logging and is **never** shown to the user.
The log line records the failing issue paths, not the values, because response bodies can
contain PII.

## What is validated

| Response | Schema | File |
|---|---|---|
| **Login** | `loginResponseSchema` | [`auth/validation/apiSchemas.ts`](../src/features/auth/validation/apiSchemas.ts:1) |
| **Current user** (`/auth/me`, `PUT /auth/profile`) | `authUserSchema` (+ `companyAccessSchema`) | [`auth/validation/apiSchemas.ts`](../src/features/auth/validation/apiSchemas.ts:1) |
| **Shift** (list + detail) | `shiftSchema` | [`shifts/validation/apiSchemas.ts`](../src/features/shifts/validation/apiSchemas.ts:1) |
| **Roster** (list + detail, incl. embedded shifts) | `rosterSchema` | [`roster/validation/apiSchemas.ts`](../src/features/roster/validation/apiSchemas.ts:1) |
| **Leave request** (list, detail, create) | `leaveRequestSchema` | [`leave/validation/apiSchemas.ts`](../src/features/leave/validation/apiSchemas.ts:1) |
| **Leave type** (paginated or plain array) | `leaveTypeSchema` | [`leave/validation/apiSchemas.ts`](../src/features/leave/validation/apiSchemas.ts:1) |
| **Notification list** | `notificationListResponseSchema` | [`notifications/validation/apiSchemas.ts`](../src/features/notifications/validation/apiSchemas.ts:1) |
| **Unread count** | `unreadCountResponseSchema` | [`notifications/validation/apiSchemas.ts`](../src/features/notifications/validation/apiSchemas.ts:1) |
| **Device token** | `deviceTokenResourceSchema` | [`notifications/validation/apiSchemas.ts`](../src/features/notifications/validation/apiSchemas.ts:1) |
| **Availability** (list, create, sync, show, update) | `availabilitySchema` | [`availability/validation/apiSchemas.ts`](../src/features/availability/validation/apiSchemas.ts:1) |
| **Pagination metadata** | `paginationMetaSchema` | [`api/schemas.ts`](../src/api/schemas.ts:1) |

## Design decisions

**Nullable fields are explicit.** Each schema mirrors the hand-written type exactly:
`z.string().nullable()` where the type says `string | null`, `.nullish()` for optional
relations (`company?`, `roster?`). A field that the type says is required is required
here too, so "treated as required but sent as null" is caught.

**Decimal fields stay strings.** `total_days`, `allowance_days`, `max_rollover_days`
are `decimal:2` **strings** on the wire, not numbers. Validating them as numbers would
reject every real response, so they are `z.string().nullable()`.

**Dates and times stay strings.** `date` (`Y-m-d`), `start_time`/`end_time` (`H:i`) are
validated as strings because that is how the app holds them; parsing into `Date`s here
would reintroduce the timezone bugs the string form exists to avoid.

**`day_of_week` is a literal union.** [`dayOfWeekSchema`](../src/features/availability/validation/apiSchemas.ts:1)
is `0 | 1 | … | 6`, so it both rejects an out-of-range value and narrows to the app's
[`DayOfWeek`](src/utils/date.ts:73) type at the boundary. A compile-time guard asserts
the two stay identical.

**Polymorphic endpoints accept both shapes.** `GET /leave-types` may return a paginator
or a plain collection, so its schema is a union — validation does not force the backend
into one shape it may not use.

**The notification wrapper is pinned.** `GET /notifications` does not return a Laravel
paginator; rows live under `data.notifications`. Validating that exact shape is what
catches a backend that "helpfully" switches to the standard paginator, which would
otherwise render an empty screen.

**Response bodies that are legitimately empty are not validated.** `POST /device-tokens`
may return no body; only a present payload is parsed. The write endpoints that return
`undefined` (logout, mark-read, delete) are unchanged.

## Testing

- [`api/__tests__/schemas.test.ts`](../src/api/__tests__/schemas.test.ts:1) — the parser:
  pass-through, `server`-kind throw, `cause` retention, never leaking a raw `ZodError`,
  and the paginator helper.
- Each API suite now includes a **contract-violation** case asserting a `server`-kind
  rejection (e.g. a renamed field, a `total_days` number instead of a string, a
  `day_of_week` outside 0–6), plus schema-valid fixtures for the happy paths.

## Adding a new validated response

1. Add the schema beside the feature's existing `validation/` schemas (reuse the shared
   summaries and `paginatedSchema`).
2. In the service method, request `unknown` from `api.*` and return
   `parseApiResponse(schema, data, '<METHOD> <path>')`.
3. Add a happy-path fixture and one contract-violation test.

## Related

- [`docs/mutation-policy.md`](mutation-policy.md) — the outbound side.
- [`docs/session-state-model.md`](session-state-model.md) — the session trust model.
