# Volunteer Shift Sign-Up System

Project for FWA Training Week — a full-stack demo built to practice the complete technical ecosystem behind a small web application: requirements, architecture, database, API, integrations, testing, and how the work was organized.

## Problem Statement

An organization needs volunteers to sign up for available shifts online, without double-booking a shift that's already full.

### Functional Requirements
- View available shifts (task, date, time, slots remaining)
- Enter volunteer information (name, email)
- Sign up for a shift
- Prevent signing up for a shift with no slots left
- Prevent the same volunteer signing up twice for the same shift

### Non-Functional Requirements
- Reliable, easy to use, fast, reasonably secure (basic input validation)
- Free tooling only — no paid external services

## Running It

```bash
npm install
npm start       # serves the app at http://localhost:3000
npm test        # runs the automated test suite
```

No environment variables, no external accounts, and no build step are required. The SQLite database file is created automatically at `data/volunteer_signup.db` on first run and reset on request (delete the file and restart).

## Architecture

```
User → Frontend (public/*.html,css,js) → API (Express, src/routes) → Database (SQLite via node:sqlite)
                                                    ↓
                                     Integration (simulated email confirmation)
```

- **Frontend**: a single static page (`public/index.html` + `app.js` + `style.css`), no framework, no build step. Fetches shift data and posts signups directly to the API.
- **API**: Express (`src/server.js`, `src/app.js`, `src/routes/shiftsRouter.js`) exposing 3 endpoints (below).
- **Database**: SQLite via Node's built-in `node:sqlite` module (`src/db.js`, `src/schema.sql`). Originally planned around `better-sqlite3`, switched during setup because that package's native binding failed to compile against the locally installed Node version — `node:sqlite` gives the same synchronous, dependency-free behavior without that risk (see `TEMP_FILE/BUILD_LOG.md` for the full story).
- **Integration**: a simulated email confirmation (`src/emailService.js`) — logs a confirmation message after a successful signup rather than calling a real provider, to demonstrate the integration seam without adding an external dependency this week.

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

## API Contract

| Endpoint | Purpose |
|---|---|
| `GET /api/shifts` | List all shifts with slots remaining |
| `POST /api/signups` | Create a signup for a shift |
| `GET /api/shifts/:id/signups` | List volunteers signed up for a shift |

**`POST /api/signups`** is the core of the system. Given `{ first_name, last_name, email, shift_id }`, it:
1. Validates input (all fields required; email must look like an email; `shift_id` must be a positive integer) → `400 INVALID_INPUT` otherwise.
2. Looks up the shift → `404 SHIFT_NOT_FOUND` if it doesn't exist.
3. Inside a single database transaction: re-checks slots are still available (`409 SHIFT_FULL` if not), finds-or-creates the volunteer by email (case-insensitive), checks for an existing signup for that volunteer/shift pair (`409 DUPLICATE_SIGNUP` if found), then inserts the signup and decrements `slots_available` together.
4. On success, sends the simulated confirmation email and returns `201` with the signup and the shift's updated slot count.

Running the slot check and the duplicate check inside the same transaction as the writes — rather than as separate earlier queries — is what actually prevents double-booking and duplicate signups under concurrent requests; the `UNIQUE` and `CHECK` constraints in the schema exist as a second line of defense in case the application logic is ever bypassed.

## Testing

6 automated tests (`npm test`, using Node's built-in `node:test` runner + `supertest`, each against a fresh in-memory SQLite database):

- `GET /api/shifts` returns the correct list
- `POST /api/signups` succeeds when slots are available
- `POST /api/signups` is rejected when the shift is full
- `POST /api/signups` is rejected on a duplicate volunteer/shift pair
- `GET /api/shifts/:id/signups` returns the correct volunteer list *(stretch)*
- `POST /api/signups` returns 404 for a nonexistent shift *(stretch)*

The frontend was additionally verified by driving a real headless browser against a running server (not just reading the code) — this caught a real bug (the signup button never re-enabled after a successful submission) that a code review alone missed.

## How the Work Was Organized

Built incrementally, one task at a time, each independently verified before moving to the next: project scaffold → database schema/seed → the 3 API endpoints → simulated email integration → frontend → tests → this documentation. Full task-by-task history, including every decision made and why, is in `TEMP_FILE/BUILD_LOG.md` and `TEMP_FILE/TASKS.md` (kept out of version control as working notes, not part of the shipped project).

## Known Limitations & What We'd Build Next

- **Email confirmation is simulated, not real.** It logs instead of sending. Upgrading to a real free-tier provider (e.g. Resend) is a tracked stretch task.
- **No waitlist.** A full shift is simply rejected; a natural next feature is letting a volunteer join a waitlist instead.
- **No containerization (yet).** Dockerizing the app was considered as a stretch goal so it can run identically anywhere without a local Node install; tracked as an optional follow-up.
- **No authentication.** Anyone can view shifts and sign up; acceptable for this demo's scope, but a real deployment would need it.

See `TEMP_FILE/DEFERRED_TASKS.md` for the full, prioritized backlog.
