# Employee Mobile — Screen Specification (Backend Source of Truth)

> ## Phase 7 — Design System & Presentation Refactor (normative addendum)
>
> This document remains the **backend/API source of truth**: no endpoint, field,
> payload or flow described below was changed by the refactor. What changed is
> *presentation only* — theming, layout, motion and the shared component set.
>
> **Global styling rule.** Every visual value a screen uses comes from
> [`useTheme`](src/theme/useTheme.ts:36). A raw hex, an off-grid spacing number or
> a hand-picked radius in a screen is now a defect, not a shortcut. The 8pt grid is
> enforced: the only permitted half-step is `spacing.xxs` (4), reserved for optical
> alignment inside a control.
>
> **What the refactor added**
>
> - Token groups: `gradients`, `motion`, `haptics`, `darkElevation`, and the
>   `glassSurface` / `glassBorder` / `hairline` / `overlay` colour tokens.
> - `componentRadius` roles, read instead of raw radius steps, so cards, sheets and
>   list rows cannot drift to different corners.
> - The [`BottomSheet`](src/components/BottomSheet/BottomSheet.tsx:1) primitive,
>   which replaces **every** `Alert.alert` destructive confirmation in
>   [`AccountScreen`](src/features/settings/screens/AccountScreen.tsx:1),
>   [`ChangePasswordScreen`](src/features/settings/screens/ChangePasswordScreen.tsx:1)
>   and [`CreateLeaveRequestScreen`](src/features/leave/screens/CreateLeaveRequestScreen.tsx:1).
>   This also covers the unsaved-changes guard, which now asks via a sheet instead
>   of the platform alert.
> - A real vector icon set ([`glyphs.tsx`](src/components/AppIcon/glyphs.tsx:1))
>   on `react-native-svg`, including the tab-bar glyphs
>   (`Home`, `CalendarDays`, `Sun`, `CalendarCheck`, `User`) and `ChevronDown`.
> - Animated skeletons for **every** content-fetching first paint. `LoadingView`
>   (a spinner) survives only for genuinely indeterminate actions.
>
> **Per-screen presentation changes** (behaviour untouched):
>
> | Screen | Change |
> |--------|--------|
> | Home | Hero leads with a weekday eyebrow; "Today" promoted to `headerMedium` with a brand accent rule; exact `getItemLayout` via precomputed offsets; "Next up" is a soft sunken panel. |
> | Account | Identity header is a brand-tinted monogram with a Verified chip; status notices are icon-led; group labels are small-caps overlines. |
> | Profile | Editable fields grouped under an "Identity" card; the read-only phone became a locked list row. |
> | My Roster | Day dividers carry a brand dot; week chrome gained a tinted icon plate; layout constants derived from type metrics. |
> | Leave list | Card radius/border read the semantic roles; row trailing block extracted. |
> | Notifications / Availability / Preferences / Shift & Leave detail | Spinners replaced with geometry-matched skeletons. |
> | All screens | Off-grid values (`40`, `10`, `2`, `12`, `24`) replaced with spacing tokens. |
>
> **Accessibility rule.** Every animated component honours Reduce Motion by jumping
> to its end state rather than animating. Dark mode is a total mirror driven by
> semantic tokens; a component that special-cases a colour for dark instead of
> reading the theme is a defect.

> Source: existing Laravel backend in this repo. No API invented. Fields below come from actual
> [`routes/api.php`](routes/api.php:59), controllers in [`app/Http/Controllers/Api`](app/Http/Controllers/Api/Auth/AuthController.php:27),
> FormRequests in [`app/Http/Requests`](app/Http/Requests/Auth/ApiLoginRequest.php:1),
> Resources in [`app/Http/Resources`](app/Http/Resources/ShiftResource.php:1),
> Policies in [`app/Policies`](app/Policies/ShiftPolicy.php:1),
> Services in [`app/Services`](app/Services/ShiftService.php:1),
> Models in [`app/Models`](app/Models/Shift.php:1),
> and [`database/seeders/RoleAndPermissionSeeder.php`](database/seeders/RoleAndPermissionSeeder.php:93).
> Where mobile needs something backend does not provide, it is marked `BACKEND GAP` with required fix.

## 0. Global Conventions (applies to all screens)

### 0.1 Base URL / versioning

- Base: `/api/v1` defined in [`routes/api.php`](routes/api.php:59).
- Web + mobile share same routes. Comment at [`routes/api.php`](routes/api.php:39): consumed by React web + React Native, Sanctum tokens.

### 0.2 Auth scheme

- `POST /api/v1/auth/login` issues Sanctum personal access token (`Bearer`).
- Authenticated group: `['auth:sanctum','account.active']` — see [`routes/api.php`](routes/api.php:143).
- `account.active` re-checks `users.status === 'active'` on every request. Deactivated user locked out on next request.
- Company operations subgroup: `company.access` — see [`routes/api.php`](routes/api.php:235). Requires valid trial or active subscription. Locked company → `403` (server-authoritative, see [`app/Services/AccessStateService.php`](app/Services/AccessStateService.php:1) surfaced in [`app/Http/Resources/UserResource.php`](app/Http/Resources/UserResource.php:20)).
- Header: `Authorization: Bearer <token>`, `Accept: application/json`, `Content-Type: application/json` (multipart for leave attachments).

### 0.3 Envelope

Success via [`app/Traits/ApiResponse.php`](app/Traits/ApiResponse.php:15):

```json
{
  "success": true,
  "message": "Shifts retrieved successfully.",
  "data": {}
}
```

`data` omitted when `null` (e.g. logout, delete). Error via [`app/Traits/ApiResponse.php`](app/Traits/ApiResponse.php:33):

```json
{
  "success": false,
  "message": "The provided credentials are incorrect.",
  "errors": { "email": ["..."] }
}
```

- Validation failure: `422` with `errors` map. Unauthenticated: `401`. Forbidden by policy: `403`. Not found / wrong company scope: `403` or `404`.
- Paginated collections use `ShiftResource::collection($shifts)->response()->getData(true)` pattern — see [`app/Http/Controllers/Api/ShiftController.php`](app/Http/Controllers/Api/ShiftController.php:42). That preserves Laravel paginator `data/links/meta` inside `data`.

### 0.4 Date / time / timezone

- `shifts.date`, `rosters.week_start/week_end`, `leave.start_date/end_date`, `employees.dob/hire_date`: `Y-m-d` (`toDateString()`), e.g. `"2026-09-15"`. See [`app/Http/Resources/ShiftResource.php`](app/Http/Resources/ShiftResource.php:25).
- `shifts.start_time/end_time`, `availability.start_time/end_time`: `H:i` (`"09:00"`). Validation `date_format:H:i` — see [`app/Http/Requests/Shift/StoreShiftRequest.php`](app/Http/Requests/Shift/StoreShiftRequest.php:39).
- `created_at/updated_at/published_at/approved_at/read_at/last_login_at`: ISO-8601 (`toIso8601String()`), e.g. `"2026-09-14T12:00:00+10:00"`.
- Server timezone is authoritative. `branches.timezone` (`Australia/Sydney` etc.) is display hint only — see [`app/Http/Resources/BranchResource.php`](app/Http/Resources/BranchResource.php:28). No per-user timezone conversion in backend.
- `company_settings.timezone/date_format/time_format/week_start_day` exist in [`app/Models/CompanySetting.php`](app/Models/CompanySetting.php:18) but employee cannot read them (see Screen 13 GAP).

### 0.5 Employee identity resolution (critical for all employee screens)

- `users` ↔ `employees` via `employees.user_id`. See [`app/Models/Employee.php`](app/Models/Employee.php:99) and [`app/Models/User.php`](app/Models/User.php:141).
- `GET /api/v1/auth/me` returns `UserResource` with `employee_id` when `employee` relation loaded — see [`app/Http/Resources/UserResource.php`](app/Http/Resources/UserResource.php:44). Mobile MUST call `me` after login and cache `data.employee_id`, `data.company_id`, `data.roles`, `data.permissions`.
- `shifts` / `rosters` controllers do NOT auto-scope to own employee. They only force `company_id = user.company_id` — see [`app/Http/Controllers/Api/ShiftController.php`](app/Http/Controllers/Api/ShiftController.php:36). Mobile must pass `?employee_id=<ownId>`.
- `leave-requests` index DO auto-scope employee role to own `employee_id` — see [`app/Http/Controllers/Api/LeaveRequestController.php`](app/Http/Controllers/Api/LeaveRequestController.php:44). Mobile must NOT send `employee_id` for the index (server overwrites it).
- `leave-requests` store, however, **requires** `employee_id` in the body — a live `422 "The employee id field is required."` proved the server does not inject it. Mobile MUST send `employee_id` (resolved from `me.employee_id`) on create. The backend is authoritative here; the earlier "auto-injected" note was wrong.

### 0.6 Permission matrix (employee role)

Seeded in [`database/seeders/RoleAndPermissionSeeder.php`](database/seeders/RoleAndPermissionSeeder.php:93):

```
employee => ['shift.view','roster.view','leave_request.view','leave_request.create']
```

Consequences:

| Capability | Employee has? | Enforced by |
|---|---|---|
| `shift.view` | yes | [`app/Policies/ShiftPolicy.php`](app/Policies/ShiftPolicy.php:25) |
| `roster.view` | yes | [`app/Policies/RosterPolicy.php`](app/Policies/RosterPolicy.php:25) |
| `leave_request.view/create` | yes | [`app/Policies/LeaveRequestPolicy.php`](app/Policies/LeaveRequestPolicy.php:25) |
| `employee.view/edit` (needed for availability + own employee record) | NO → BACKEND GAP | [`app/Policies/EmployeePolicy.php`](app/Policies/EmployeePolicy.php:25) |
| `leave_type.view` (needed for Request Leave dropdown) | NO → BACKEND GAP | [`app/Policies/LeaveTypePolicy.php`](app/Policies/LeaveTypePolicy.php:25) |
| `company.view/edit`, `settings.view/edit` | NO → BACKEND GAP | [`app/Policies/CompanyPolicy.php`](app/Policies/CompanyPolicy.php:25) |
| `leave_request.approve/reject`, `shift.create/edit/delete`, `roster.create/publish` | NO (correct — admin only) | respective policies |

### 0.7 Relevant tables

`users`, `employees`, `branches`, `rosters`, `shifts`, `employee_availabilities`, `leave_types`, `leave_requests`, `notifications` (morph), `device_tokens`, `company_settings`, `personal_access_tokens`.

---

# Screen 1 — Login

## 1. Purpose

Authenticate employee with email+password, obtain Sanctum token, cache user + employee link for all later screens.

## 2. User Role

Public (guest). No auth required. Throttle `6,1` — see [`routes/api.php`](routes/api.php:71).

## 3. Navigation

- Entry: cold start when no stored token, or after logout / token expiry / `account.active` 401.
- Success: `GET auth/me` → if `company_access.is_locked` true → locked-company interstitial (no company ops); else → Home / Today's Shift (Screen 4).
- Error: stay, show inline error. `401` invalid credentials / inactive account.
- Deep link: none. Invitation onboarding is separate public flow (`invitations/mobile/*`), out of MVP scope but noted in Appendix.

## 4. UI Components

- Header/logo, email field, password field with show/hide, device-name hidden field (auto), login button, forgot-password link, loading state, error banner, throttle message state.

## 5. Features

SUPPORTED BY BACKEND:

- Email/password login with device token issuance
- Optional FCM registration on login via `fcm_token`
- Last-login tracking

BACKEND GAP: none for login itself.

## 6. API ENDPOINTS

### API 1 — Login

Method: `POST /api/v1/auth/login`

Purpose: Issue token.

Authentication: none (public).

Authorization: none. `LoginAction` checks `users.status === 'active'` — see [`app/Domains/Auth/Actions/LoginAction.php`](app/Domains/Auth/Actions/LoginAction.php:28).

Request Headers: `Accept: application/json`, `Content-Type: application/json`.

Request Body (from [`app/Http/Requests/Auth/ApiLoginRequest.php`](app/Http/Requests/Auth/ApiLoginRequest.php:24)):

```json
{
  "email": "jane@example.com",
  "password": "secret123",
  "device_name": "Pixel 8 - RN",
  "platform": "android",
  "fcm_token": "fcm:xxx (optional)",
  "app_version": "1.0.0",
  "os_version": "14"
}
```

Validation:

- `email`: required, email, max 255
- `password`: required string
- `device_name`: nullable string max 255 (fallback to User-Agent via [`app/Http/Requests/Auth/ApiLoginRequest.php`](app/Http/Requests/Auth/ApiLoginRequest.php:39))
- `platform`: nullable in `web,ios,android`
- `fcm_token`: nullable string max 500 → upserted to `device_tokens` via [`app/Domains/Auth/Actions/LoginAction.php`](app/Domains/Auth/Actions/LoginAction.php:59)
- `app_version/os_version`: nullable

Success Status: `200`.

Success Response (via [`app/Http/Controllers/Api/Auth/AuthController.php`](app/Http/Controllers/Api/Auth/AuthController.php:61), [`app/Http/Resources/UserResource.php`](app/Http/Resources/UserResource.php:17)):

```json
{
  "success": true,
  "message": "Logged in successfully.",
  "data": {
    "user": {
      "id": 12,
      "company_id": 3,
      "company_access": { "is_locked": false, "reason": null, "trial_ends_at": null, "trial_is_active": false, "active_subscription_id": 7, "active_subscription_ends_at": "2026-10-01T00:00:00+10:00" },
      "branch_id": 5,
      "employee_id": 9,
      "name": "Jane Doe",
      "email": "jane@example.com",
      "phone": null,
      "role": "employee",
      "status": "active",
      "roles": ["employee"],
      "permissions": ["shift.view", "roster.view", "leave_request.view", "leave_request.create"],
      "last_login_at": "2026-09-14T22:00:00+10:00",
      "email_verified_at": "2026-08-01T10:00:00+10:00"
    },
    "token": "1|plain-text-sanctum-token",
    "token_type": "Bearer"
  }
}
```

Error Responses:

- `401 {success:false,message:"The provided credentials are incorrect."}` — wrong email/password.
- `401 {success:false,message:"Your account is inactive. Please contact your administrator."}` — `status !== active`.
- `422` validation errors; `429` throttle exceeded.

Business rules / DB: `users` lookup by email, `Hash::check`, token expiry `config('sanctum.expiration',1440)` minutes server-computed, `last_login_at=now()`.

### API 2 — Fetch session (required immediately after login)

Method: `GET /api/v1/auth/me`

Purpose: Canonical session + `employee_id` + `permissions`.

Authentication: `Bearer`.

Authorization: `auth:sanctum + account.active`. No permission check.

Success `200` returns same `UserResource` shape as above (single object in `data`, not wrapped in `user`).

Mobile MUST persist `token`, `user.id`, `user.company_id`, `user.employee_id`, `permissions`.

## 7. States / Validation / Edge

- Empty email/password → client block + server 422.
- Inactive user → 401 with contact-admin copy, no retry loop.
- Locked company (`company_access.is_locked=true`) → allow login but block Screens 4–11 with paywall interstitial; do NOT log out.
- FCM token optional; if omitted login still succeeds (push registered later via Screen 11 API).

---

# Screen 2 — Forgot Password

## 1. Purpose

Request password-reset email for employee who forgot password.

## 2. User Role

Public. Throttle `6,1` — see [`routes/api.php`](routes/api.php:75).

## 3. Navigation

- Reached from Login → Forgot Password link.
- Success: show “check email” confirmation, button back to Login. Do NOT auto-navigate to Reset.
- Error: stay, show 422.
- Deep link: reset email contains web link with `token`; mobile Reset screen (Screen 3) is manual entry of that token + email.

## 4. UI Components

- Email input, submit button, success confirmation panel, error banner, back-to-login link, loading state.

## 5. Features

SUPPORTED BY BACKEND: send reset link via [`app/Http/Controllers/Api/Auth/AuthController.php`](app/Http/Controllers/Api/Auth/AuthController.php:192).

BACKEND GAP: backend sends web reset link (Laravel notification via [`app/Models/User.php`](app/Models/User.php:98) → `ResetPasswordNotification`). No native mobile deep-link / OTP documented. Mobile must instruct user to open email and either tap link (web) or copy token into Screen 3.

## 6. API ENDPOINTS

### API 1 — Forgot password

Method: `POST /api/v1/auth/forgot-password`

Authentication: none.

Request Body (from [`app/Http/Requests/Auth/ForgotPasswordRequest.php`](app/Http/Requests/Auth/ForgotPasswordRequest.php:24)):

```json
{ "email": "jane@example.com" }
```

Validation: `email` required, email, max 255.

Success Status: `200`.

Success Response:

```json
{ "success": true, "message": "A password reset link has been sent to your email address." }
```

Error: `422 {success:false,message:"Unable to send password reset link.",errors:{email:["..."]}}`.

Notes: Always returns success message shape on valid email; unknown email surfaces as 422 via `ForgotPasswordAction`. No user enumeration guarantee documented — treat as opaque.

## 7. Validation

- Client: required + email format before submit. Server is authority.

---

# Screen 3 — Reset Password

## 1. Purpose

Set new password using emailed `token` + `email`. Supported by backend — see [`routes/api.php`](routes/api.php:79).

## 2. User Role

Public. Throttle `6,1`.

## 3. Navigation

- Reached from Forgot confirmation (“have a token? reset”) or from email link fallback.
- Success: “password reset” confirmation → Login.
- Error: stay, highlight `token/email/password` errors.

## 4. UI Components

- Email, token/code, new password, confirm password, password-strength hint, submit, success/error states.

## 5. Features

SUPPORTED: token-based reset via [`app/Http/Controllers/Api/Auth/AuthController.php`](app/Http/Controllers/Api/Auth/AuthController.php:206).

BACKEND GAP: token is opaque web `password_resets` token, not a short mobile OTP. No `GET` to validate token before submit. Mobile must accept paste.

## 6. API ENDPOINTS

### API 1 — Reset password

Method: `POST /api/v1/auth/reset-password`

Request Body (from [`app/Http/Requests/Auth/ResetPasswordRequest.php`](app/Http/Requests/Auth/ResetPasswordRequest.php:24)):

```json
{
  "token": "emailed-token-string",
  "email": "jane@example.com",
  "password": "NewSecret123!",
  "password_confirmation": "NewSecret123!"
}
```

Validation:

- `token`: required string
- `email`: required email max 255
- `password`: required, `confirmed`, `Password::defaults()` (min 8, mixed case/number/symbol per Laravel defaults; confirm exact policy from `config` — do not hardcode weaker rule)

Success `200`:

```json
{ "success": true, "message": "Your password has been reset successfully." }
```

Error `422 {success:false,message:"Unable to reset password.",errors:{email:["..."],token:["..."],password:["..."]}}` for expired/invalid token or weak password.

DB: `password_resets` table, `users.password` hashed.

---

# Screen 4 — Home / Today's Shift

## 1. Purpose

Answer “do I work today?” — show today’s shift(s) for logged-in employee, with quick links to roster, leave, notifications.

## 2. User Role

Employee only. Requires `shift.view` + same `company_id` — see [`app/Policies/ShiftPolicy.php`](app/Policies/ShiftPolicy.php:33). Seeded employee has `shift.view`.

Also requires `company.access` (subscription active). Locked company → 403 on shifts call.

## 3. Navigation

- Landing after login (`me` → home).
- Tap shift card → Shift Details (Screen 6).
- “View roster” → My Roster (Screen 5). Bell icon → Notifications (Screen 11).
- Pull-to-refresh re-calls `me` + shifts query.
- Back: none (tab root).

## 4. UI Components

- Greeting (from `me.name`), date header (device date, but query uses `Y-m-d`), today-shift card(s): start/end `H:i`, branch name, position, department, status badge, notes snippet; empty state (“No shift today”); loading skeleton; error + retry; locked-company banner; unread-notification dot (from Screen 11 count).

## 5. Features

SUPPORTED BY BACKEND:

- Query own shifts for single day via `GET shifts?employee_id=&date_from=&date_to=`
- Show branch/position/department via eager loads
- Refresh

BACKEND GAP:

- No dedicated `today` / `upcoming` / `my-shifts` endpoint. Mobile must derive today client-side and query date range.
- No server-computed “today” respecting `company_settings.timezone`. Mobile sends `Y-m-d`; ensure device date matches company timezone display (branch `timezone` hint only).
- `DashboardController@overview` is NOT employee-personalised (company stats only) — see [`app/Http/Controllers/Api/DashboardController.php`](app/Http/Controllers/Api/DashboardController.php:171). Do NOT use for Home.

## 6. API ENDPOINTS

### API 1 — Session (greeting + employee link)

`GET /api/v1/auth/me` — same as Screen 1 API 2. Cache `employee_id`.

### API 2 — Today's shifts (primary)

Method: `GET /api/v1/shifts`

Purpose: List own shifts filtered to today.

Authentication: `Bearer` + `account.active` + `company.access`.

Authorization: `ShiftPolicy@viewAny` requires `shift.view` — see [`app/Http/Controllers/Api/ShiftController.php`](app/Http/Controllers/Api/ShiftController.php:28).

Path: none. Query (from [`app/Http/Controllers/Api/ShiftController.php`](app/Http/Controllers/Api/ShiftController.php:30) + [`app/Services/ShiftService.php`](app/Services/ShiftService.php:28)):

- `employee_id` = own id from `me` (REQUIRED client-side; server does not auto-inject)
- `date_from` = today `Y-m-d`, `date_to` = today `Y-m-d`
- `status` optional (`scheduled,completed,cancelled,swap_requested`)
- `per_page` default 15, max server-paginated
- `company_id` ignored if sent (server forces `user.company_id` for non-super-admin)
- `branch_id/roster_id` optional, not needed for home

Example: `GET /api/v1/shifts?employee_id=9&date_from=2026-09-15&date_to=2026-09-15&per_page=10`

Success `200`:

```json
{
  "success": true,
  "message": "Shifts retrieved successfully.",
  "data": {
    "data": [
      {
        "id": 101,
        "company_id": 3,
        "branch_id": 5,
        "roster_id": 20,
        "employee_id": 9,
        "position_id": 4,
        "department_id": 2,
        "date": "2026-09-15",
        "start_time": "09:00",
        "end_time": "17:00",
        "break_minutes": 30,
        "paid_break": false,
        "required_staff": 2,
        "status": "scheduled",
        "notes": "Close register",
        "company": { "id": 3, "name": "Acme Pty Ltd" },
        "branch": { "id": 5, "name": "Bondi", "timezone": "Australia/Sydney" },
        "roster": { "id": 20, "week_start": "2026-09-15", "week_end": "2026-09-21", "status": "published" },
        "employee": { "id": 9, "first_name": "Jane", "last_name": "Doe", "full_name": "Jane Doe" },
        "position": { "id": 4, "name": "Cashier" },
        "department": { "id": 2, "name": "Front" },
        "created_at": "2026-09-10T10:00:00+10:00",
        "updated_at": "2026-09-10T10:00:00+10:00"
      }
    ],
    "links": {},
    "meta": { "current_page": 1, "last_page": 1, "per_page": 10, "total": 1 }
  }
}
```

Shape from [`app/Http/Resources/ShiftResource.php`](app/Http/Resources/ShiftResource.php:17). `overtime_risk/leave_conflict/double_booked` only present when roster annotated (roster show path), absent here → treat missing as false.

Errors: `401` unauthenticated, `403` missing `shift.view` or locked company, `422` bad date format.

Pagination/sorting: `orderBy(date,start_time)` fixed — see [`app/Services/ShiftService.php`](app/Services/ShiftService.php:41). No custom sort param.

Enums: `status` in `scheduled,completed,cancelled,swap_requested` — see migration `2026_07_27_000011_create_shifts_table.php:29`.

Nullable: `branch_id/employee_id/position_id/department_id/notes/break_minutes` nullable. `employee_id=null` means open/unassigned shift (not shown on Home; shown in roster context).

DB tables: `shifts` joined to `branches/rosters/employees/positions/departments`.

---

# Screen 5 — My Roster

## 1. Purpose

Browse own shifts across a week / date range (week view + list fallback).

## 2. User Role

Employee only, `roster.view` + `shift.view`, same company. Both seeded for employee.

## 3. Navigation

- From Home tab or bottom nav “Roster”.
- Week prev/next changes `week_start/week_end` or `date_from/date_to` query.
- Tap day/shift → Shift Details. Tap roster header → optional roster detail (published meta).
- Back: to Home tab.

## 4. UI Components

- Week selector (Mon–Sun or per `week_start_day` if available — but employee cannot read settings, so default Mon), date-range strip, shift list grouped by date, status badges, branch/position labels, empty week state, loading, error+retry, pull-refresh.

## 5. Features

SUPPORTED:

- Paginated roster list (to find published week) + shift list filtered by employee + date range (primary mobile path)
- Roster detail with all shifts (filter client-side to own)

BACKEND GAP:

- No `my-roster` / `my-week` endpoint. No server week scoping to employee. Mobile must implement week logic client-side.
- Draft rosters exist but employee should only see `published`; backend does NOT hide drafts from employee (`RosterPolicy@view` only checks `roster.view` + company — see [`app/Policies/RosterPolicy.php`](app/Policies/RosterPolicy.php:33)). Mobile MUST filter `status=published` client-side / via query.

## 6. API ENDPOINTS

### API 1 — My shifts for week (RECOMMENDED primary)

`GET /api/v1/shifts?employee_id=<own>&date_from=<weekStart>&date_to=<weekEnd>&per_page=50`

Same contract as Screen 4 API 2. Use `per_page` large enough for week (e.g. 50). Ordering fixed by date/start.

### API 2 — Published rosters for week (supplementary, for week chrome)

Method: `GET /api/v1/rosters`

Auth: `Bearer` + `company.access`. Authorize `RosterPolicy@viewAny` (`roster.view`).

Query (from [`app/Http/Controllers/Api/RosterController.php`](app/Http/Controllers/Api/RosterController.php:35)): `status=published`, `branch_id?`, `week_start?`, `week_end?`, `per_page`.

Example: `GET /api/v1/rosters?status=published&per_page=10`

Response item (from [`app/Http/Resources/RosterResource.php`](app/Http/Resources/RosterResource.php:17)):

```json
{
  "id": 20,
  "company_id": 3,
  "branch_id": 5,
  "week_start": "2026-09-15",
  "week_end": "2026-09-21",
  "status": "published",
  "version": 3,
  "published_at": "2026-09-12T09:00:00+10:00",
  "published_by": 2,
  "shifts_count": 14,
  "created_at": "2026-09-10T10:00:00+10:00",
  "updated_at": "2026-09-12T09:00:00+10:00"
}
```

Use to render week header; do NOT rely on it for shift times (use API 1).

### API 3 — Roster detail (optional drill-down)

Method: `GET /api/v1/rosters/{roster}`

Auth + `RosterPolicy@view`. Eager loads `shifts.employee.department/branch`, `shifts.position/department` + conflict annotation — see [`app/Http/Controllers/Api/RosterController.php`](app/Http/Controllers/Api/RosterController.php:99).

Response includes `shifts: ShiftResource[]`. Mobile MUST filter `shifts where employee_id == own`.

Statuses: `draft,published` (plus cancelled-via-shifts semantics — see `RosterController@destroy` comment at [`app/Http/Controllers/Api/RosterController.php`](app/Http/Controllers/Api/RosterController.php:162)).

---

# Screen 6 — Shift Details

## 1. Purpose

Show single shift full context: time, branch, position, roster publish state, notes, break.

## 2. User Role

Employee only. `shift.view` + same company — see [`app/Policies/ShiftPolicy.php`](app/Policies/ShiftPolicy.php:33).

## 3. Navigation

- From Home or My Roster tap.
- Back to originating list (preserve week/day filter).
- No edit/swap actions (employee lacks `shift.edit`; swap is `status=swap_requested` but no employee endpoint to request it — see GAP).
- Deep link: `staffapp://shifts/{id}` MAY be supported client-side; backend has no deep-link contract.

## 4. UI Components

- Date, start–end, duration (client-computed minus `break_minutes`), branch name/address/timezone, position/department chips, status badge, roster week + published badge, notes, break row, loading/error states.

## 5. Features

SUPPORTED: read-only detail.

BACKEND GAP:

- No clock-in/out, no swap request, no unassign, no shift acknowledgement endpoint. `status` enum contains `swap_requested` but no employee-facing transition API exists. Do NOT build swap UI backed by `PUT shifts` (requires `shift.edit` which employee lacks → 403).

## 6. API ENDPOINTS

### API 1 — Shift detail

Method: `GET /api/v1/shifts/{shift}`

Auth: `Bearer` + `company.access`. Authorize `view` — see [`app/Http/Controllers/Api/ShiftController.php`](app/Http/Controllers/Api/ShiftController.php:117). Loads `company,branch,roster,employee,position,department`.

Success `200` returns `ShiftResource` as in Screen 4 (single object in `data`).

Errors: `403` if shift in other company or missing permission; `404` if id unknown or `employee_id` mismatch is NOT checked — any company shift viewable, so mobile must only link own shifts to avoid leaking coworker shifts (policy allows viewing all company shifts with `shift.view`).

Fields: `date Y-m-d`, `start_time/end_time H:i`, `break_minutes int|null`, `paid_break bool`, `required_staff int|null`, `status enum`, `notes string|null`.

---

# Screen 7 — My Availability

## 1. Purpose

View and edit weekly availability (preferred working hours / unavailable days).

## 2. User Role

Employee only (intended). Actual backend authorizes via `EmployeePolicy` (`employee.view` for read, `employee.edit` for write) + company scoping.

## 3. Navigation

- From Profile tab or Settings → Availability.
- Edit → inline day editor or full-week sync sheet → save → toast + refresh.
- Back to Profile.

## 4. UI Components

- 7-day list (Sun 0 – Sat 6 with `day_name`), per-day time range or “Unavailable” toggle, add/edit/delete slot actions, Save-week button, loading/empty/error, dirty-state guard.

## 5. Features

SUPPORTED BY BACKEND (code exists):

- List, create, sync-week, show, update, delete via [`app/Http/Controllers/Api/EmployeeAvailabilityController.php`](app/Http/Controllers/Api/EmployeeAvailabilityController.php:25).

BACKEND GAP (BLOCKING — must fix before mobile works):

- `index` calls `$this->authorize('view',$employee)` and `store/sync/update/destroy` call `authorize('update',$employee)` — see [`app/Http/Controllers/Api/EmployeeAvailabilityController.php`](app/Http/Controllers/Api/EmployeeAvailabilityController.php:27). That maps to `EmployeePolicy@view/update` requiring `employee.view / employee.edit` — see [`app/Policies/EmployeePolicy.php`](app/Policies/EmployeePolicy.php:25). Employee role does NOT have those (see Section 0.6). Verified by [`tests/Feature/Employee/EmployeeAvailabilityTest.php`](tests/Feature/Employee/EmployeeAvailabilityTest.php:213) where employee without permission gets `403`.
- Required fix: grant employee `employee.view/edit` scoped to own record OR introduce `availability.view/edit-own` abilities + policy branch `if (user.hasRole('employee') && employee.user_id==user.id) return true`. Also allow `company_settings.allow_employee_availability` gating (setting exists in [`app/Models/CompanySetting.php`](app/Models/CompanySetting.php:29) but not enforced).
- Keep screen in spec; mobile must handle `403` as “ask admin / backend update required” until fixed.

## 6. API ENDPOINTS

All require `Bearer` + `company.access`. `employee` path param is `employees.id` (NOT `users.id`) — resolve via `me.employee_id`.

### API 1 — List availability

Method: `GET /api/v1/employees/{employee}/availabilities`

Authz: `EmployeePolicy@view` (GAP above).

Success `200` (from [`app/Http/Controllers/Api/EmployeeAvailabilityController.php`](app/Http/Controllers/Api/EmployeeAvailabilityController.php:31), [`app/Http/Resources/EmployeeAvailabilityResource.php`](app/Http/Resources/EmployeeAvailabilityResource.php:17)):

```json
{
  "success": true,
  "message": "Availability retrieved successfully.",
  "data": [
    { "id": 1, "employee_id": 9, "day_of_week": 1, "day_name": "Monday", "start_time": "09:00", "end_time": "17:00", "is_available": true, "created_at": "2026-09-01T10:00:00+10:00", "updated_at": "2026-09-01T10:00:00+10:00" },
    { "id": 2, "employee_id": 9, "day_of_week": 3, "day_name": "Wednesday", "start_time": null, "end_time": null, "is_available": false, "created_at": "2026-09-01T10:00:00+10:00", "updated_at": "2026-09-01T10:00:00+10:00" }
  ]
}
```

Note: NOT paginated (plain collection). Ordered by `day_of_week,start_time` — see [`app/Services/EmployeeAvailabilityService.php`](app/Services/EmployeeAvailabilityService.php:16).

Model: [`app/Models/EmployeeAvailability.php`](app/Models/EmployeeAvailability.php:19), `DAYS 0=Sunday..6=Saturday`, `is_available` bool, times `H:i|null`.

### API 2 — Create slot

Method: `POST /api/v1/employees/{employee}/availabilities`

Body (from [`app/Http/Requests/EmployeeAvailability/StoreEmployeeAvailabilityRequest.php`](app/Http/Requests/EmployeeAvailability/StoreEmployeeAvailabilityRequest.php:26)):

```json
{ "day_of_week": 1, "start_time": "09:00", "end_time": "17:00", "is_available": true }
```

Validation: `day_of_week` required 0–6; `start_time/end_time` nullable `H:i`, `end_time after:start_time`; `is_available` nullable bool (defaults true server-side — see [`app/Services/EmployeeAvailabilityService.php`](app/Services/EmployeeAvailabilityService.php:30)).

Success `201` single resource. Error `422` + `403` (GAP).

### API 3 — Sync whole week (RECOMMENDED for mobile save)

Method: `PUT /api/v1/employees/{employee}/availabilities/sync`

Body (from [`app/Http/Requests/EmployeeAvailability/SyncWeeklyAvailabilityRequest.php`](app/Http/Requests/EmployeeAvailability/SyncWeeklyAvailabilityRequest.php:28)):

```json
{
  "availabilities": [
    { "day_of_week": 1, "start_time": "09:00", "end_time": "17:00", "is_available": true },
    { "day_of_week": 3, "is_available": false }
  ]
}
```

Validation: `availabilities` required array min 1; each `day_of_week` required 0–6; times nullable `H:i`; `is_available` bool. Replaces ALL rows transactionally (delete + re-create) — see [`app/Services/EmployeeAvailabilityService.php`](app/Services/EmployeeAvailabilityService.php:67).

Success `200` returns full week collection.

### API 4 — Show slot

`GET /api/v1/employees/{employee}/availabilities/{availability}` → `200` single. `404` if slot belongs to other employee (via `ensureBelongsToEmployee` at [`app/Http/Controllers/Api/EmployeeAvailabilityController.php`](app/Http/Controllers/Api/EmployeeAvailabilityController.php:121)).

### API 5 — Update slot

`PUT /api/v1/employees/{employee}/availabilities/{availability}` with partial body (same rules as create but `sometimes` — see [`app/Http/Requests/EmployeeAvailability/UpdateEmployeeAvailabilityRequest.php`](app/Http/Requests/EmployeeAvailability/UpdateEmployeeAvailabilityRequest.php:26)). Success `200`.

### API 6 — Delete slot

`DELETE /api/v1/employees/{employee}/availabilities/{availability}` → `200 {success:true,message:"Availability slot deleted successfully."}`.

## 7. Validation / States

- `end_time` must be after `start_time` else 422 `end_time`.
- `day_of_week` 9 → 422. Empty sync array → 422.
- Until GAP fixed, mobile must surface 403 distinctly (“Availability editing not enabled for your role — contact admin”).

---

# Screen 8 — My Leave

## 1. Purpose

List own leave requests with status filter (pending/approved/rejected).

## 2. User Role

Employee only. `leave_request.view` + auto-scoped to own `employee_id` — see [`app/Http/Controllers/Api/LeaveRequestController.php`](app/Http/Controllers/Api/LeaveRequestController.php:44) and [`app/Policies/LeaveRequestPolicy.php`](app/Policies/LeaveRequestPolicy.php:34) (employee can only view where `leaveRequest.employee.user_id == user.id`).

## 3. Navigation

- Tab “Leave”. Filter chips All/Pending/Approved/Rejected.
- Tap row → Leave Details (Screen 10). FAB “+” → Request Leave (Screen 9).
- Pull-refresh, pagination infinite scroll.

## 4. UI Components

- Status filter, leave cards (type name, dates, days, status badge, reason snippet), empty/history states, loading, error+retry, pending count header.

## 5. Features

SUPPORTED: paginated own history, status filter, date filter passthrough.

BACKEND GAP: none for listing. Balance/allowance is client-computed in web; no server balance endpoint — do NOT show authoritative balance, only `total_days` per request.

## 6. API ENDPOINTS

### API 1 — List own leave

Method: `GET /api/v1/leave-requests`

Auth: `Bearer` + `company.access`. Authorize `viewAny` (`leave_request.view`).

Query (from [`app/Http/Controllers/Api/LeaveRequestController.php`](app/Http/Controllers/Api/LeaveRequestController.php:30)): `status`, `leave_type_id`, `date_from`, `date_to`, `per_page`. `company_id` forced; `employee_id` forced to own for employee role (client MUST NOT send `employee_id` — server overwrites).

Example: `GET /api/v1/leave-requests?status=pending&per_page=20`

Success `200` paginated `LeaveRequestResource` (see [`app/Http/Resources/LeaveRequestResource.php`](app/Http/Resources/LeaveRequestResource.php:17)):

```json
{
  "success": true,
  "message": "Leave requests retrieved successfully.",
  "data": {
    "data": [
      {
        "id": 5,
        "company_id": 3,
        "employee_id": 9,
        "leave_type_id": 2,
        "start_date": "2026-09-20",
        "end_date": "2026-09-22",
        "start_session": "full_day",
        "end_session": "full_day",
        "total_days": "3.00",
        "reason": "Family trip",
        "attachment": null,
        "attachments": [],
        "status": "pending",
        "approved_by": null,
        "approved_at": null,
        "rejected_by": null,
        "rejected_at": null,
        "rejection_reason": null,
        "admin_notes": null,
        "employee": { "id": 9, "full_name": "Jane Doe" },
        "leave_type": { "id": 2, "name": "Annual Leave", "code": "ANNUAL", "is_paid": true },
        "created_at": "2026-09-10T10:00:00+10:00",
        "updated_at": "2026-09-10T10:00:00+10:00"
      }
    ],
    "meta": { "current_page": 1, "last_page": 2, "per_page": 20, "total": 25 }
  }
}
```

Enums: `status pending,approved,rejected` (inferred from `scopePending/scopeApproved` + approve/reject flow in [`app/Models/LeaveRequest.php`](app/Models/LeaveRequest.php:83) and controller `abort_unless(status==='pending')`); `start_session/end_session full_day,first_half,second_half`.

Dates `Y-m-d`, `total_days decimal:2` string, attachments array of paths.

---

# Screen 9 — Request Leave

## 1. Purpose

Submit new leave request with type, dates, sessions, reason, attachments.

## 2. User Role

Employee only. `leave_request.create` — see [`app/Policies/LeaveRequestPolicy.php`](app/Policies/LeaveRequestPolicy.php:52). `company_id` is auto-injected server-side, but `employee_id` is **required in the request body** — the server does not inject it (live `422 "The employee id field is required."`). Mobile MUST send `employee_id` resolved from `me.employee_id`. See [`app/Http/Controllers/Api/LeaveRequestController.php`](app/Http/Controllers/Api/LeaveRequestController.php:61).

## 3. Navigation

- From My Leave FAB.
- Success → toast + navigate to Leave Details or back to list with new item prepended.
- Error → stay, show field errors (especially `leave_type_id/start_date/end_date/attachments.*`).
- Cancel → back with dirty guard.

## 4. UI Components

- Leave-type picker, start/end date pickers, half-day session selectors, total-days preview (client calc, non-authoritative), reason textarea (1000 max), attachment picker (max 5, pdf/jpg/jpeg/png/doc/docx, 5MB each), submit button, validation messages, upload progress.

## 5. Features

SUPPORTED: multipart submit, half-day sessions, attachments.

BACKEND GAP (BLOCKING for type picker):

- `GET /api/v1/leave-types` requires `leave_type.view` — see [`app/Policies/LeaveTypePolicy.php`](app/Policies/LeaveTypePolicy.php:25) — which employee lacks. So type dropdown has no readable source until fixed.
- Required fix: grant employee `leave_type.view` for own company (read-only) OR add `GET leave-requests/meta` returning active types. Keep screen; handle 403 on types with “types unavailable — contact admin” fallback + allow retry.
- No edit/cancel endpoint for pending request (`leave-requests` resource only `index,store,show` — see [`routes/api.php`](routes/api.php:346)). Employee cannot withdraw pending request via API → GAP. Do NOT build cancel UI.

## 6. API ENDPOINTS

### API 1 — Leave types (for picker; currently GAP-blocked)

Method: `GET /api/v1/leave-types`

Auth + `LeaveTypePolicy@viewAny`. Query: `search,status,per_page` (company forced).

Response item (from [`app/Http/Resources/LeaveTypeResource.php`](app/Http/Resources/LeaveTypeResource.php:17)): `id,name,code,description,allowance_days,is_paid,allows_rollover,max_rollover_days,requires_approval,allow_half_day,max_days_per_request,color,status`.

Mobile should filter `status=active` client-side if server returns all.

### API 2 — Submit leave (primary)

Method: `POST /api/v1/leave-requests`

Auth + `company.access` + `create`. Content-Type: `multipart/form-data` when attachments present, else JSON.

Fields (from [`app/Http/Requests/Leave/StoreLeaveRequestRequest.php`](app/Http/Requests/Leave/StoreLeaveRequestRequest.php:26)):

- `leave_type_id`: required int exists `leave_types.id`
- `start_date`: required date `Y-m-d`
- `end_date`: required date `>= start_date`
- `start_session/end_session`: nullable `full_day,first_half,second_half`
- `total_days`: nullable numeric min 0.5 (server recalculates? treat as hint; service is authority — see [`app/Services/LeaveRequestService.php`](app/Services/LeaveRequestService.php:1))
- `reason`: nullable string max 1000
- `attachment`: nullable string max 2048 (legacy single)
- `attachments`: nullable array max 5; `attachments.*` file `pdf,jpg,jpeg,png,doc,docx` max 5120KB
- `employee_id`: **REQUIRED** for employee — the server does NOT inject it on create and returns `422` when absent. Send own `me.employee_id`.
- `company_id`: MUST be omitted (server injects); sending is ignored/overwritten.

Controller handling of files — see [`app/Http/Controllers/Api/LeaveRequestController.php`](app/Http/Controllers/Api/LeaveRequestController.php:80): stores to `leave-request-attachments` disk `public`, sets `attachments` array + `attachment` first path.

Success `201`:

```json
{
  "success": true,
  "message": "Leave request submitted successfully.",
  "data": {
    "id": 6,
    "company_id": 3,
    "employee_id": 9,
    "leave_type_id": 2,
    "start_date": "2026-09-20",
    "end_date": "2026-09-21",
    "status": "pending",
    "total_days": "2.00",
    "employee": { "id": 9, "full_name": "Jane Doe" },
    "leave_type": { "id": 2, "name": "Annual Leave" }
  }
}
```

Errors: `422` field errors, `403` no linked employee profile (`No employee profile is linked to this account.`), `403` missing `leave_request.create`.

---

# Screen 10 — Leave Details

## 1. Purpose

Show single request lifecycle: dates, type, status, approver/rejecter, notes, attachments.

## 2. User Role

Employee only, own requests only (`LeaveRequestPolicy@view` checks `employee.user_id == user.id`).

## 3. Navigation

- From My Leave tap. Back to list. No approve/reject buttons (employee lacks `leave_request.approve/reject` → 403). Attachment tap → system viewer (public disk URL; backend returns relative path, mobile must prefix `APP_URL/storage/`).

## 4. UI Components

- Status banner, type chip, date range + sessions + total days, reason, attachments list, approver/rejecter + timestamps, rejection reason / admin notes, timeline (submitted → approved/rejected).

## 5. Features

SUPPORTED: read-only detail.

BACKEND GAP: no withdraw/cancel, no edit. `approve/reject` endpoints exist but forbidden for employee (correct).

## 6. API ENDPOINTS

### API 1 — Leave detail

Method: `GET /api/v1/leave-requests/{leaveRequest}`

Auth + `view` — see [`app/Http/Controllers/Api/LeaveRequestController.php`](app/Http/Controllers/Api/LeaveRequestController.php:101). Loads `company,employee,leaveType,approver,rejecter`.

Success `200` single `LeaveRequestResource` (full shape as Screen 8, plus `approver/rejecter` User objects when present, `admin_notes`, `rejection_reason`).

Errors: `403` if requesting another employee’s id (policy), `404` unknown id.

Document explicitly: `POST /api/v1/leave-requests/{id}/approve` and `/reject` MUST NOT be called by mobile (403 for employee by design).

---

# Screen 11 — Notifications

## 1. Purpose

List in-app notifications (roster published, shift assigned, leave decision), mark read, delete, show unread badge.

## 2. User Role

Employee only (any authenticated user). No policy check — only `auth:sanctum + account.active + company.access` + ownership scoping `user->notifications()` — see [`app/Http/Controllers/Api/NotificationController.php`](app/Http/Controllers/Api/NotificationController.php:20). No BACKEND GAP.

## 3. Navigation

- Bell icon (tab bar/header) with `unread_count` badge → inbox.
- Tap item → `markAsRead` then route by `data.type`/`data` payload (e.g. roster → My Roster, shift → Shift Details, leave → Leave Details). Unknown `type` → stay (mapped to `system_alert` in web).
- Swipe delete, “Mark all read” header action. Pull-refresh + pagination.
- Push tap (FCM) → same inbox routing; FCM is transport only, inbox is truth.

## 4. UI Components

- Filter tabs All/Unread/Read (`?filter=`), notification rows (title/body/time/type icon, read dot), unread badge, mark-all button, delete action, empty/loading/error states, pagination footer.

## 5. Features

SUPPORTED: filter, paginate, single-read, read-all, delete, unread count, push registration (see DeviceToken APIs below).

BACKEND GAP: none. Note: no preferences / channel toggles endpoint exists. Do NOT build notification-settings toggles (would be mock).

## 6. API ENDPOINTS

### API 1 — List

Method: `GET /api/v1/notifications?filter=all|unread|read&per_page=15&page=1`

Auth: `Bearer` + `company.access`. No extra permission.

Query (from [`app/Http/Controllers/Api/NotificationController.php`](app/Http/Controllers/Api/NotificationController.php:24)): `filter` (`unread` → `unreadNotifications()`, `read` → `readNotifications()`, default all), `per_page` clamped 1–100 default 15.

Success `200` (custom wrapper, NOT standard paginator — note nesting):

```json
{
  "success": true,
  "message": "Notifications retrieved successfully.",
  "data": {
    "notifications": [
      {
        "id": "uuid-string",
        "type": "RosterChangeNotification",
        "title": "Roster updated",
        "body": "1 change to your roster for the week.",
        "data": { "type": "roster_published", "title": "...", "body": "...", "roster_id": 20, "shift_id": 101 },
        "read_at": null,
        "created_at": "2026-09-12T09:00:00+10:00"
      }
    ],
    "unread_count": 3,
    "meta": { "current_page": 1, "last_page": 5, "per_page": 15, "total": 42 }
  }
}
```

Shape from [`app/Http/Resources/NotificationResource.php`](app/Http/Resources/NotificationResource.php:20): `id` UUID string, `type` from `data.type` fallback to class basename, `title/body` nullable, `data` full payload, `read_at/created_at` ISO or null.

Known `data.type` values (from `ShiftAssignedNotification`, `RosterChangeNotification`, leave notifications — inspect `app/Notifications/`): `shift_assigned`, `roster_published`, `roster_changed`, `leave_approved`, `leave_rejected`. Treat unknown as generic.

### API 2 — Mark one read

Method: `POST /api/v1/notifications/{notification}/read`

`{notification}` is UUID string. Scoped to own (`findOrFail` on own relation). Success `200` returns updated `NotificationResource`.

### API 3 — Mark all read

Method: `POST /api/v1/notifications/read-all`

Body: none. Success `200 {success:true,message:"All notifications marked as read."}` (data null).

### API 4 — Delete

Method: `DELETE /api/v1/notifications/{notification}`

Success `200 {success:true,message:"Notification deleted successfully."}`.

### API 5 — Register push token (call on login + on FCM refresh + Settings toggle)

Method: `POST /api/v1/device-tokens`

Body (from [`app/Http/Requests/DeviceToken/RegisterDeviceTokenRequest.php`](app/Http/Requests/DeviceToken/RegisterDeviceTokenRequest.php:24)):

```json
{ "token": "fcm:xxx", "platform": "android", "device_name": "Pixel 8", "app_version": "1.0.0", "os_version": "14" }
```

Validation: `token` required max 512, `platform` required `ios,android,web`, `device_name` nullable, versions nullable.

Success `201` [`app/Http/Resources/DeviceTokenResource.php`](app/Http/Resources/DeviceTokenResource.php:20) (no raw token echoed back, only `id/device_name/platform/is_active/last_used_at`).

### API 6 — Unregister push token (call on logout + Settings opt-out)

Method: `DELETE /api/v1/device-tokens`

Body (from [`app/Http/Requests/DeviceToken/DeleteDeviceTokenRequest.php`](app/Http/Requests/DeviceToken/DeleteDeviceTokenRequest.php:24)): `{ "token": "fcm:xxx" }` (JSON body on DELETE; `Content-Type: application/json`).

Success `200`.

---

# Screen 12 — Profile

## 1. Purpose

Show who I am (user + linked employee record), allow editing name/email, show verification state.

## 2. User Role

Employee only. `GET/PUT auth/*` require only auth (no permission). Employee-record detail is GAP (see below).

## 3. Navigation

- Profile tab → view. Edit → form → save → refresh `me`.
- “Change password” link → Screen 14. “Settings” link → Screen 13.
- Logout button here or in Settings (both call same API).

## 4. UI Components

- Avatar fallback (initials; no avatar upload endpoint for `users` — `employees.photo` upload exists but requires `employee.edit` → GAP), full name, email + verified badge, phone (read-only; no update endpoint field), employee meta (branch/position/department — only if GAP fixed), resend-verification button when unverified, edit form, loading/error.

## 5. Features

SUPPORTED:

- View session via `me`
- Update `name/email` (email change clears `email_verified_at`)
- Resend verification email
- Logout / logout-all

BACKEND GAP (partial):

- `GET /api/v1/employees/{id}` requires `employee.view` which employee lacks — see [`app/Policies/EmployeePolicy.php`](app/Policies/EmployeePolicy.php:33). So rich employee fields (`hire_date,hourly_rate,emergency_contact,photo_url`) are NOT readable until policy fixed. Mobile Profile MUST render from `auth/me` (`UserResource` + nested minimal `employee` when loaded) and mark extended employee detail as GAP.
- `POST employees/{employee}/photo` requires `employee.edit` → GAP for avatar upload. Do NOT build avatar upload until fixed.
- `phone` is in `UserResource` but NOT in `UpdateProfileRequest` fillable (`name,email` only) — see [`app/Http/Requests/Auth/UpdateProfileRequest.php`](app/Http/Requests/Auth/UpdateProfileRequest.php:26). Phone is read-only → GAP if editable phone desired.

## 6. API ENDPOINTS

### API 1 — Get profile

`GET /api/v1/auth/me` — same as Screen 1. Returns `name,email,phone,role,status,roles,permissions,employee_id,company_access,email_verified_at`.

### API 2 — Update profile

Method: `PUT /api/v1/auth/profile`

Auth: `Bearer`. Authorize: authenticated (see [`app/Http/Requests/Auth/UpdateProfileRequest.php`](app/Http/Requests/Auth/UpdateProfileRequest.php:15)).

Body:

```json
{ "name": "Jane Doe", "email": "jane@example.com" }
```

Validation: `name` required max 255; `email` required lowercase email max 255 unique `users.email` ignoring self.

Success `200` updated `UserResource`. Side effect: if email dirty, `email_verified_at=null` — see [`app/Http/Controllers/Api/Auth/AuthController.php`](app/Http/Controllers/Api/Auth/AuthController.php:97.

Error `422` (taken email, bad format).

### API 3 — Resend verification

Method: `POST /api/v1/auth/email/resend`

Throttle `6,1`. If already verified → `200 {message:"Your email address is already verified."}` else sends `VerifyEmailNotification` — see [`app/Http/Controllers/Api/Auth/AuthController.php`](app/Http/Controllers/Api/Auth/AuthController.php:220).

### API 4 — Logout (current device)

Method: `POST /api/v1/auth/logout`

Body (from [`app/Http/Requests/Auth/LogoutRequest.php`](app/Http/Requests/Auth/LogoutRequest.php:24)): `{ "fcm_token": "optional — also unregister push" }`.

Via [`app/Http/Controllers/Api/Auth/AuthController.php`](app/Http/Controllers/Api/Auth/AuthController.php:172) → revokes current token. Success `200`. Mobile must also call `DELETE device-tokens` if `fcm_token` not handled server-side on logout, then clear storage and go to Login.

### API 5 — Logout all devices

Method: `POST /api/v1/auth/logout-all`

Body: none. Revokes all tokens — see [`app/Http/Controllers/Api/Auth/AuthController.php`](app/Http/Controllers/Api/Auth/AuthController.php:182). Expose as “Sign out everywhere” in Profile or Settings.

### API 6 — Employee detail (GAP-blocked, document for future)

Method: `GET /api/v1/employees/{employee}`

Currently `403` for employee role (missing `employee.view`). When fixed, returns [`app/Http/Resources/EmployeeResource.php`](app/Http/Resources/EmployeeResource.php:17): `first_name,last_name,full_name,employee_number,employment_type,dob,gender,address,emergency_contact,emergency_phone,hire_date,termination_date,hourly_rate,photo,photo_url,status + company/department/position/branch`.

---

# Screen 13 — Settings

## 1. Purpose

Device preferences + push opt-in + company policy visibility + legal/about. No company-admin configuration (out of scope).

## 2. User Role

Employee only. No backend settings read permission exists for employee → largely local + GAP.

## 3. Navigation

- From Profile gear icon or tab.
- Rows: Notifications (push toggle → DeviceToken APIs), Appearance (local theme), About (app version), Privacy/Terms (static), Sign out everywhere, Change password link.
- Back to Profile.

## 4. UI Components

- Push toggle, theme selector (system/light/dark, local only), app-version row, company-name row (from `me.company` if available, else “—”), locked-company status row, sign-out buttons, loading for push toggle.

## 5. Features

SUPPORTED:

- Push register/unregister (same DeviceToken APIs as Screen 11)
- Local theme persistence (no backend)
- Logout-all

BACKEND GAP (BLOCKING for company settings):

- `GET /api/v1/companies/{company}/settings` requires `CompanyPolicy@view` (`company.view`) — see [`app/Http/Controllers/Api/CompanySettingController.php`](app/Http/Controllers/Api/CompanySettingController.php:22). Employee lacks it → `403`.
- `PUT .../settings` requires `company.edit` → `403` (correct — employee must NOT edit).
- Required fix if company policy visibility desired: allow employee read-only `settings.view` on own company OR expose `GET companies/{company}/settings/mine` returning safe subset (`timezone,date_format,time_format,allow_shift_swap,allow_employee_availability,allow_leave_requests,allow_push_notifications`). Until then, mobile MUST NOT show company policy as server-backed; show as unavailable or local-only.
- `CompanySetting` fields available post-fix — see [`app/Models/CompanySetting.php`](app/Models/CompanySetting.php:18): `timezone,date_format,time_format,week_start_day,default_shift_duration,default_break_minutes,currency,language,allow_shift_swap,allow_employee_availability,allow_leave_requests,allow_push_notifications,logo,primary_color,secondary_color`.
- `completeWebWelcome/dismissWebFeatureTip` (`POST auth/web-welcome/complete`, `POST auth/web-feature-tips/dismiss`) abort `403` for employee — see [`app/Http/Controllers/Api/Auth/AuthController.php`](app/Http/Controllers/Api/Auth/AuthController.php:137) — MUST NOT be called by mobile.

## 6. API ENDPOINTS

### API 1 — Push enable

`POST /api/v1/device-tokens` — same as Screen 11 API 5.

### API 2 — Push disable

`DELETE /api/v1/device-tokens` — same as Screen 11 API 6.

### API 3 — Company settings (GAP-blocked, for reference)

Method: `GET /api/v1/companies/{company}/settings`

Currently `403` for employee. When fixed, returns [`app/Http/Resources/CompanySettingResource.php`](app/Http/Resources/CompanySettingResource.php:17) (all `company_settings` columns except timestamps).

Mobile MUST gate Availability / Leave / Push UI on these flags once readable; until then, assume all enabled and handle 403 per-feature.

---

# Screen 14 — Change Password

## 1. Purpose

Change password while logged in (no current-password check in backend).

## 2. User Role

Employee only, authenticated. No permission check beyond auth.

## 3. Navigation

- From Profile → Change Password or Settings → Security.
- Success → confirmation + back to Profile (stay logged in; tokens NOT revoked server-side — see [`app/Http/Controllers/Api/Auth/AuthController.php`](app/Http/Controllers/Api/Auth/AuthController.php:121)).
- Error → stay, show `password` errors.
- Optional “Sign out everywhere” after change (calls logout-all).

## 4. UI Components

- New password, confirm password, strength meter, submit, success/error banner. No current-password field (backend does not validate it — do NOT add one as required; optionally collect locally but do not send).

## 5. Features

SUPPORTED: direct update via [`app/Http/Controllers/Api/Auth/AuthController.php`](app/Http/Controllers/Api/Auth/AuthController.php:121).

BACKEND GAP: none. Security note: backend does NOT require current password (`UpdatePasswordRequest` only `password+confirmed` — see [`app/Http/Requests/Auth/UpdatePasswordRequest.php`](app/Http/Requests/Auth/UpdatePasswordRequest.php:26)). Mobile must warn user accordingly and offer logout-all. `POST auth/confirm-password` exists but is for pre-sensitive-action check, not required here — do NOT wire it unless product requires step-up.

## 6. API ENDPOINTS

### API 1 — Update password

Method: `PUT /api/v1/auth/password`

Body:

```json
{ "password": "NewSecret123!", "password_confirmation": "NewSecret123!" }
```

Validation: `password` required, `confirmed`, `Password::defaults()`.

Success `200`:

```json
{ "success": true, "message": "Password updated successfully." }
```

Error `422` weak/mismatched password.

---

## Appendix A — BACKEND GAP Summary (required fixes, no invention)

| # | Screen(s) | Missing | Evidence | Required fix |
|---|---|---|---|---|
| G1 | 7 Availability | employee cannot `view/update` own availability (`403`) | [`app/Http/Controllers/Api/EmployeeAvailabilityController.php`](app/Http/Controllers/Api/EmployeeAvailabilityController.php:27) + [`app/Policies/EmployeePolicy.php`](app/Policies/EmployeePolicy.php:33) + seeder perms + test 403 | Grant `employee.view/edit` scoped to `employee.user_id==user.id` or add `availability.*-own` abilities |
| G2 | 9 Request Leave picker | employee cannot list `leave-types` (`403`) | [`app/Policies/LeaveTypePolicy.php`](app/Policies/LeaveTypePolicy.php:25) | Grant `leave_type.view` read-only for own company |
| G3 | 12 Profile detail | employee cannot read own `employees/{id}` (`403`) | [`app/Policies/EmployeePolicy.php`](app/Policies/EmployeePolicy.php:33) | Same as G1 (own-record read) |
| G4 | 12 Avatar | employee cannot `uploadPhoto` (`403`) | `EmployeeController@uploadPhoto` + `employee.edit` | Same as G1 or separate `photo-own` ability |
| G5 | 13 Settings | employee cannot read `companies/{id}/settings` (`403`) | [`app/Http/Controllers/Api/CompanySettingController.php`](app/Http/Controllers/Api/CompanySettingController.php:22) | Read-only own-company settings or safe-subset endpoint |
| G6 | 9 Cancel leave | no `DELETE/PATCH leave-requests/{id}` (only `index,store,show`) | [`routes/api.php`](routes/api.php:346) | Add `cancel` endpoint for own pending requests (or document as intentionally admin-only) |
| G7 | 4/5 Today semantics | no `today/my-shifts` endpoint, no server timezone today | `ShiftService@paginate` filters only | Add optional `?mine=1&today=1` scope OR document client-derived `Y-m-d` as canonical |
| G8 | 6 Swap | `swap_requested` status exists but no employee transition API | migration status comment + no route | Add `POST shifts/{id}/swap-request` or remove status from mobile vocabulary |

## Appendix B — Out-of-scope admin endpoints (mobile MUST NOT call)

`POST rosters/{id}/publish`, `POST shifts/bulk`, `POST shifts/{id}/assign-employee`, `PUT/DELETE shifts/*`, `POST rosters/*`, `POST leave-requests/{id}/approve|reject`, `apiResource employees/*` (except GAP-noted future own-read), `apiResource branches/departments/positions/companies`, `subscription/*`, `super-admin/*`, `plans/*`. All require permissions employee lacks (`shift.create/edit/delete`, `roster.create/publish`, `leave_request.approve/reject`, etc.) and will `403`.

## Appendix C — Test / verification checklist for builder agent

- Login with employee seed → `permissions` contains exactly 4 values → Home queries `shifts?employee_id=<me.employee_id>&date_from=today&date_to=today` → 200.
- Forgot/reset round-trip with real email → 200 messages as above.
- Leave list auto-scoped (no `employee_id` sent) → only own rows.
- Availability list as employee → currently `403` (G1) — assert GAP handling, not success.
- Leave-types as employee → currently `403` (G2).
- Notifications filter `unread` + `read-all` + `read` + `destroy` → 200 + `unread_count` decrements.
- `PUT auth/profile` email change → `email_verified_at` null → resend → 200.
- `PUT auth/password` without current password → 200 (documented behaviour).
- Locked company (`company.access` fail) → shifts/rosters/leave/notifications → 403 with paywall, but `auth/me` still 200.
