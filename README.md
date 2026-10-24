# SecureResident — Apartment Security & Visitor Management

Production-style residential apartment security platform: visitor invitations with QR codes, guard gate verification (fail secure), resident approvals, watchlist, alerts, incidents, lockdown, audit logging, and real-time dashboards.

- **Backend** — Fastify 5 + TypeScript (ESM), Prisma 6 + SQLite, zod v4, JWT (access + rotating refresh), RBAC, OpenAPI at `/docs`, WebSocket realtime, background jobs (overstay sweeper, retention/anonymization).
- **Frontend** — React 19 + Vite 7 + TypeScript (strict), React Router 7, role-aware UI, live updates over WS, voice alerts via the Web Speech API, QR scanning with `html5-qrcode`.
- **Tests** — Vitest: 8 files, 75 tests (unit + API integration against a seeded SQLite database).

## Features

| Area | What works |
| --- | --- |
| Visitor lifecycle | Invite → QR/code (`VIS-YYYY-XXXXXX`, QR payload `SVC:`) → guard verify → approval → entry → tracking → exit |
| Approval policies | `AUTO`, `RESIDENT`, `SECURITY`, `BOTH` per invitation + global default; watchlist matches automatically escalate the policy |
| Fail-secure verification | No valid authorization + no required approval = no entry. Reasons: `NOT_FOUND`, `EXPIRED`, `REJECTED`, `BLOCKED`, `ALREADY_INSIDE`, `LOCKDOWN_ACTIVE`, `GATE_NOT_ALLOWED`, `OUTSIDE_WINDOW`, `RESIDENT_INACTIVE`, … failures raise alerts + voice events |
| Real-time | WS topics per role/audience: lockdown, alerts, approvals, visitor entry/exit, notifications, voice-alert broadcasts |
| Security ops | Alerts (acknowledge/resolve), incidents (report/investigate/close), watchlist (BLOCKED/WATCHLIST/RESTRICTED), lockdown activate/release, reports (JSON + CSV), audit log |
| Surveillance | CCTV/AI detector events create alerts + incidents automatically (`POST /api/integrations/detector-events`); the detecting camera is shown on each alert/incident with a snapshot viewer (`GET /api/cameras/:id/snapshot` — HTTP/MJPEG direct, RTSP decoded via `ffmpeg`) |
| Admin | Users/roles, buildings/blocks/floors/apartments, gates & cameras (credentials encrypted at rest), system settings |
| Notifications | In-app inbox, unread counts, delivery records; retention sweep with optional anonymization |

## Roles

`SUPER_ADMIN`, `ADMIN`, `SECURITY`, `RESIDENT`, `GUARD` — enforced by `requirePermission(...)` (OR semantics), matrix in `server/src/lib/rbac.ts`. Route-level guards in `web/src/App.tsx` mirror the same permission strings.

## Quick start (local dev)

```bash
# 1. API (port 4000)
cd server
npm install
cp .env.example .env          # defaults work for dev
npx prisma db push
npm run seed                  # demo data (destructive reset of demo rows)
npm run dev

# 2. Web (port 5173, proxies /api, /uploads, /docs, /ws to :4000)
cd ../web
npm install
npm run dev
```

Open http://localhost:5173 — API docs at http://localhost:4000/docs.

### Demo accounts

Password for all: `Secure@Demo123!`

| Role | Email |
| --- | --- |
| Super admin | `superadmin@secureresident.local` |
| Admin | `admin@secureresident.local` |
| Security | `security@secureresident.local` |
| Guards | `guard1@secureresident.local`, `guard2@secureresident.local` |
| Residents | `ali@resident.local`, `hamza@resident.local`, `fatima@resident.local`, `sara@resident.local` |

Seeded visitor codes (see `server/prisma/seed.ts`): `VIS-2026-GUEST1` (awaiting approval), `VIS-2026-INSID1` (already inside), plus approved/exited samples. Main gate code: `MAIN-1`. The public visitor pass page is `/invite/<CODE>` (no login).

## Docker

Secrets are **required** — compose fails fast and the API refuses to boot with defaults.

```bash
export JWT_ACCESS_SECRET=$(openssl rand -hex 32)
export JWT_REFRESH_SECRET=$(openssl rand -hex 32)
export ENCRYPTION_KEY=$(openssl rand -base64 32)
export SEED_DEMO=true          # omit for a clean production DB
docker compose up --build
# web  → http://localhost:8080 (nginx, same-origin proxy incl. /ws)
# api  → http://localhost:4000 (also reachable through nginx)
```

SQLite and uploads persist in named volumes; the server entrypoint runs `prisma migrate deploy` on start and seeds demo data when `SEED_DEMO=true`.

## Tests

```bash
cd server
npm test           # vitest: global setup does a fresh db push + seed on tests/test.db
npm run lint       # tsc --noEmit
cd ../web
npm run lint       # tsc -b --force
npm run build      # tsc -b && vite build
```

## Project structure

```
server/
  prisma/            schema (27 models), migrations, seed
  src/
    lib/             rbac, jwt/refresh, codes, qr, policy, wsHub, settings, audit, voice, retention
    plugins/         auth, websocket, rate-limit...
    services/        verification (verify/entry/exit/approvals), visitor, alert, notification, dashboard
    routes/          auth, invitations, visitors, security, users, buildings, devices, settings, audit/reports, dashboard
    jobs/            overstay sweeper, retention sweep
  tests/             unit + integration (vitest)
web/
  src/lib/           api client (auto token refresh), auth, ws, voice, format
  src/components/    ui primitives, role-aware shell
  src/pages/         login, public invite, resident/*, guard/*, security/*, admin/*
docker-compose.yml   server + web (nginx)
docs/
  OPERATIONS.md      operations & knowledge base (runbooks, reference, on-call)
```

## Documentation

- **[Operations & Knowledge Base](docs/OPERATIONS.md)** — configuration reference, roles/permissions, deployment, backups, runbooks, error-code/verification/WS references, and an on-call checklist.

## Security notes

- Short-lived access tokens (15m) + rotating refresh tokens stored server-side as SHA-256 hashes; login lockout after 5 failures and per-IP rate limiting.
- Camera credentials and integration secrets encrypted at rest (`ENCRYPTION_KEY`, base64 32-byte key).
- Verification always re-checks the database (watchlist, apartment/resident status, gate policy, approvals) — the QR/code alone never grants entry.
- Full audit trail of auth events, verifications, approvals, exports, and settings changes (`GET /api/audit`).
- In production (`NODE_ENV=production`) the server refuses to start while `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`ENCRYPTION_KEY` still hold known defaults.
- Replace all default secrets (`JWT_*`, `ENCRYPTION_KEY`, `Secure@Demo123!` passwords) before any real deployment.
- RTSP camera snapshots require **`ffmpeg`** on the API host (bundled in `server/Dockerfile`). HTTP/MJPEG/ONVIF cameras that expose a still-image URL need no extra dependency.

## Known gaps (API-only, no UI yet)

These are exposed in the OpenAPI docs but have no dedicated screen. Detector-driven alerts/incidents **do** surface the detecting camera and snapshot in the UI, and Admin → Devices has a per-camera snapshot viewer.

- Detector event log (`GET /api/security/detector-events`) — ingest is wired to alerts/incidents, but the raw event log has no screen.
- Voice-alert message configuration (`GET/PUT /api/voice-alerts/:event`) — only the global `voiceAlertsEnabled` toggle is in Settings.
- Access points (`/api/access-points`), security devices (`/api/devices`), emergency/lockdown history (`/api/security/emergency/events`).
- Visitor QR verify (`POST /api/visitors/verify-qr`) — the guard UI verifies by code; QR scanning happens client-side.
- Visitor search (`/api/visitors/search`), residents/guards directories, `POST /api/uploads`, `/api/system/info`, `/api/auth/permissions`.
