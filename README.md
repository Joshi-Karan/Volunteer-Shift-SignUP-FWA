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
- Admin login, gated behind a username/password
- Admin: add, edit, and delete shifts (including changing slot counts)
- Admin: view who has signed up for a shift

### Non-Functional Requirements
- Reliable, easy to use, fast, reasonably secure (basic input validation)
- Free tooling only — no paid external services

## Running It

```bash
npm install
npm start       # serves the app at http://localhost:3000
```

No environment variables, no external accounts, and no build step are required. The SQLite database file is created automatically at `data/volunteer_signup.db` on first run and reset on request (delete the file and restart).

## Learn More

Architecture, data model, API contract, admin authentication, testing, and process notes live in [DETAILS.md](DETAILS.md).
