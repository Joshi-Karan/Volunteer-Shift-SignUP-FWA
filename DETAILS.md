# Details

Architecture, data model, API contract, testing, and process notes for the [Volunteer Shift Sign-Up System](README.md).

## Architecture

```
Volunteer:  User → Frontend (public/*.html,css,js) → API (Express, src/routes/shiftsRouter.js) → Database (SQLite via node:sqlite)
                                                                        ↓
                                                     Integration (simulated email: confirmation)

Admin:      Admin → Login modal (public/admin.js) → POST /api/admin/login → session token (in-memory)
                          ↓
            Admin actions → Authorization: Bearer <token> → requireAdmin middleware → /api/admin/* (src/routes/adminRouter.js) → Database
                                                                        ↓
                                                     Integration (simulated email: cancellation, on delete)
```

- **Frontend**: static pages (`public/index.html`, `app.js`, `admin.js`, `style.css`), no framework, no build step. `app.js` handles the volunteer-facing flow (load shifts, sign up); `admin.js` handles the admin login modal, session restore, and the add/edit/delete/view-signups controls, loaded as a second `<script>` tag alongside it. `app.js`'s card renderer calls `window.renderAdminControls(shift)` if it exists (a no-op when `admin.js` reports no active session), which is the only coupling point between the two — kept separate so the volunteer-facing script stays focused.
- **API**: Express (`src/server.js`, `src/app.js`, `src/routes/shiftsRouter.js`, `src/routes/adminRouter.js`, `src/adminAuth.js`) exposing the public endpoints and the admin endpoints (both below).
- **Database**: SQLite via Node's built-in `node:sqlite` module (`src/db.js`, `src/schema.sql`).
- **Integration**: a simulated email service (`src/emailService.js`) — logs a message rather than calling a real provider, to demonstrate the integration seam without adding an external dependency. It fires on two events: a successful signup (confirmation) and an admin deleting a shift that had signups (cancellation, once per affected volunteer).
- **Admin auth**: a session-token scheme, not a full auth system

## Data Model

```
VOLUNTEERS                SHIFTS                     SIGNUPS
-----------                ------                     -------
volunteer_id (PK)          shift_id (PK)               signup_id (PK)
first_name                 task                        volunteer_id (FK -> volunteers)
last_name                  date                        shift_id (FK -> shifts)
email (UNIQUE)              time                        signup_date
                            slots_available             UNIQUE(volunteer_id, shift_id)
                            CHECK(slots_available >= 0)
```

One volunteer can sign up for many shifts; one shift can have many volunteers. `signups` is the join table connecting them, with a `UNIQUE(volunteer_id, shift_id)` constraint as a database-level backstop against duplicate signups (enforced primarily at the application level — see below).

Admin sessions are **not** a database table — they're an in-memory token store (see "Admin Authentication" below), so the schema above is unchanged by sprint 2.

## API Contract

### Public

| Endpoint | Purpose |
|---|---|
| `GET /api/shifts` | List all shifts with slots remaining |
| `POST /api/signups` | Create a signup for a shift |

**`POST /api/signups`** is the core of the system. Given `{ first_name, last_name, email, shift_id }`, it:
1. Validates input (all fields required; email must look like an email; `shift_id` must be a positive integer) → `400 INVALID_INPUT` otherwise.
2. Looks up the shift → `404 SHIFT_NOT_FOUND` if it doesn't exist.
3. Inside a single database transaction: re-checks slots are still available (`409 SHIFT_FULL` if not), finds-or-creates the volunteer by email (case-insensitive), checks for an existing signup for that volunteer/shift pair (`409 DUPLICATE_SIGNUP` if found), then inserts the signup and decrements `slots_available` together.
4. On success, sends the simulated confirmation email and returns `201` with the signup and the shift's updated slot count.

Running the slot check and the duplicate check inside the same transaction as the writes — rather than as separate earlier queries — is what actually prevents double-booking and duplicate signups under concurrent requests; the `UNIQUE` and `CHECK` constraints in the schema exist as a second line of defense in case the application logic is ever bypassed.

### Admin (all except login require `Authorization: Bearer <token>`)

| Endpoint | Purpose |
|---|---|
| `POST /api/admin/login` | `{ username, password }` → `200 { token }`, or `401` |
| `POST /api/admin/logout` | Invalidate the current token → `204` |
| `GET /api/admin/session` | Confirm a token is still valid → `200 { valid: true }` |
| `POST /api/admin/shifts` | Create a shift: `{ task, date, time, slots_available }` → `201` with the new row |
| `PATCH /api/admin/shifts/:id` | Partially update a shift (any subset of the same 4 fields) → `200` with the updated row |
| `DELETE /api/admin/shifts/:id` | Delete a shift → `200 { deleted_shift_id, notified_count }` (see below) |
| `GET /api/admin/shifts/:id/signups` | List volunteers signed up for a shift — **moved here from the public API in sprint 2**, since it exposes volunteer names/emails |

**`DELETE /api/admin/shifts/:id`** cascades: inside one transaction it reads every volunteer currently signed up for that shift, deletes those `signups` rows, then deletes the `shifts` row. Only *after* the transaction commits does it send a simulated cancellation email to each affected volunteer (same "integration calls happen after the write, never inside it" rule as the confirmation email) and respond with how many volunteers were notified.

## Admin Authentication

A custom login (not a browser Basic-Auth popup) so the frontend could offer a real "Admin Login" button and a real "Logout," per the brainstorm before building this: a small modal collects username/password, `POST /api/admin/login` checks them against hardcoded constants (`admin` / `admin` — see Known Limitations), and on success issues a random session token (`crypto.randomBytes(32)`, Node built-in) held in an in-memory `Map` on the server (`src/adminAuth.js`). The browser keeps the token in `localStorage` and sends it as `Authorization: Bearer <token>` on every admin request; `requireAdmin` middleware checks it against that `Map`. On page load, if a token is already in `localStorage`, the frontend calls `GET /api/admin/session` to confirm it's still valid before showing admin controls, so a stale token (e.g. after a server restart) falls back to the logged-out view instead of a broken admin UI.

## Testing

23 automated tests (`npm test`, using Node's built-in `node:test` runner + `supertest`, each against a fresh in-memory SQLite database):

**Volunteer-facing (6):**
- `GET /api/shifts` returns the correct list
- `POST /api/signups` succeeds when slots are available
- `POST /api/signups` is rejected when the shift is full
- `POST /api/signups` is rejected on a duplicate volunteer/shift pair
- `POST /api/signups` returns 404 for a nonexistent shift *(stretch)*

**Admin (17):** login (success, wrong credentials, missing fields), auth-gating (missing/invalid token rejected on protected routes), session check and logout, shift creation (success + 4 invalid-input cases), partial edit (success, 404, no-fields-provided), delete (no signups, 404, and the cascade-delete-plus-notification path — asserted by spying on `console.log` to confirm one cancellation line per affected volunteer and that their `signups` rows are actually gone from the database), and the admin-only signups view (auth required, correct list, 404).

The frontend was additionally verified by driving a real headless browser against a running server (not just reading the code), for both sprints. Sprint 1's pass caught a real bug (the signup button never re-enabled after a successful submission). Sprint 2's pass — login (success and wrong-password), add/edit/delete a shift, viewing signups, logout, session restore across a page reload, and graceful fallback when a stale/invalid token is left in `localStorage` — found no bugs.

## How the Work Was Organized

Built incrementally, one task at a time, each independently verified before moving to the next. Sprint 1: project scaffold → database schema/seed → the 3 API endpoints → simulated email integration → frontend → tests → documentation. Sprint 2 (admin management) was planned via a brainstorm with 3 explicit design decisions before any code was written (auth mechanism, delete-with-signups behavior, and admin-only signup visibility — see `TEMP_FILE/PLAN.md`), then built as: admin auth backend → shift management endpoints → admin frontend → tests → this documentation. Full task-by-task history, including every decision made and why, is in `TEMP_FILE/BUILD_LOG.md` and `TEMP_FILE/TASKS.md` (kept out of version control as working notes, not part of the shipped project).

## Known Limitations & What We'd Build Next

- **Email sending is simulated, not real.** Both the signup confirmation and the shift-cancellation notice log instead of sending. Upgrading to a real free-tier provider (e.g. Resend) is a tracked stretch task.
- **No waitlist.** A full shift is simply rejected; a natural next feature is letting a volunteer join a waitlist instead.
- **No containerization (yet).** Dockerizing the app was considered as a stretch goal so it can run identically anywhere without a local Node install; tracked as an optional follow-up.
- **Admin credentials are hardcoded** (`admin` / `admin`, plaintext, in `src/adminAuth.js`) rather than environment-configured or hashed — acceptable only because this is a gated one-day demo, not a real deployment.
- **Admin sessions are in-memory and don't expire.** Restarting the server invalidates every admin session (the frontend handles this gracefully — it falls back to the logged-out view), but a token never expires on its own while the server is running.
- **No rate-limiting on admin login.** Nothing stops repeated login attempts; fine for a gated demo, not for anything longer-lived.
