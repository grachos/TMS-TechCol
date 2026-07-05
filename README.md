# Light TMS

> Colombian freight **Transport Management System** (TMS) that captures service
> requests, seeds the corresponding **Manifiesto** and **Remesas**, and files them
> with the **RNDC** — the *Registro Nacional de Despachos de Carga* SOAP web
> service of the Ministerio de Transporte — through a resilient store‑and‑forward
> queue. Includes fulfilment (*cumplido*), printable manifiesto/remesa PDFs with
> the RNDC QR, a dashboard, and a filterable CSV report.

This repository holds the **modern rewrite** of an original PHP/MySQL application.
The legacy PHP app is preserved under [`/legacy`](legacy/) as the reference of
truth until parity is signed off.

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 · TypeScript · Vite · TailwindCSS · Recharts · Zustand · Lucide · React‑Leaflet |
| **Backend** | Node.js · Express · TypeScript · mysql2 (typed query modules, no ORM) · Zod |
| **Auth** | JWT for staff · roles `admin` / `operador` |
| **Docs / PDF** | puppeteer‑core (system Chrome) → PDF, with printable‑HTML fallback · `qrcode` |

---

## Table of contents
- [Project structure](#project-structure)
- [Domain model & data flow](#domain-model--data-flow)
- [Features](#features)
- [Requirements](#requirements)
- [Setup & run](#setup--run)
- [Scripts](#scripts)
- [Configuration (`.env`)](#configuration-env)
- [API overview](#api-overview)
- [Authentication & roles](#authentication--roles)
- [Safety switch (RNDC sending)](#safety-switch-rndc-sending)
- [Testing & parity](#testing--parity)
- [Migration notes](#migration-notes-php--nodejs)

---

## Project structure

```
tms-light-new/
├── .github/workflows/ci.yml      # CI: typecheck + test + build
├── backend/                      # Node + Express + TS API  →  http://localhost:4000
│   ├── src/
│   │   ├── config/env.ts         # typed .env loader
│   │   ├── db/pool.ts, types.ts  # mysql2 pool + transactions, row types
│   │   ├── http/errors.ts        # AppError + asyncHandler + error middleware
│   │   ├── util/                 # csv, validaciones (peligrosa)
│   │   ├── rndc/                 # RNDC SOAP client (ISO‑8859‑1) + RndcRespuesta
│   │   ├── modules/
│   │   │   ├── auth/             # JWT, roles, staff_users
│   │   │   ├── terceros/  vehiculos/  municipios/  catalogos/  empresa/
│   │   │   ├── solicitudes/      # seed manifiesto + remesas, retentions
│   │   │   ├── cola/             # store‑and‑forward queue + cumplido + despachos
│   │   │   ├── pdf/              # manifiesto/remesa HTML + QR + render
│   │   │   ├── stats/            # dashboard aggregates
│   │   │   └── informe/          # filterable report + CSV
│   │   ├── queue/worker.ts       # cron drain of the queue
│   │   └── scripts/seed-admin.ts
│   └── test/                     # RNDC + QR characterization tests (Vitest)
├── frontend/                     # React + Vite SPA  →  http://localhost:5173
│   └── src/
│       ├── pages/                # login, inicio, terceros, vehiculos, productos,
│       │                         # empresa, solicitudes, despachos, cola, cumplido, informe
│       ├── components/           # Autocomplete, MunicipioAutocomplete, MapPicker,
│       │                         # Pagination, Alert, StatusBadge, AppShell, ProtectedRoute
│       ├── store/auth.ts         # Zustand (persisted JWT)
│       └── lib/                  # api client (+ authed file download), format helpers
├── database/                     # schema.sql, maestros, catalogos, municipios (DANE),
│                                 # migraciones v2..v31 (v31 = staff_users)
├── docs/                         # RNDC guides + MODERNIZACION.md
├── legacy/                       # original PHP app (kept for reference)
└── package.json                  # npm workspaces: [backend, frontend]
```

## Domain model & data flow

```
Solicitud de servicio  (single capture)
        │  confirmar despacho  (transaction)
        ▼
   1 Manifiesto  +  N Remesas   ── linked via manifiesto_remesa
        │  encolar in RNDC order
        ▼
   cola_envios:  tercero(11) → vehículo(12) → remesa(3) → manifiesto(4)
        │  worker drains (dependency‑gated, retry+backoff, safe‑mode aware)
        ▼
   RNDC accepts → manifiesto 'aceptado' → fetch QR seguridad
        │  later
        ▼
   Cumplido:  cumplido_remesa(5) → cumplido_manifiesto(6)
```

- **One capture seeds everything.** A `Solicitud` is entered once; confirming its
  dispatch seeds a manifiesto and one remesa per product, computes retentions
  server‑side (`retencion_ica = flete·tarifa/1000`, `retencion_fuente = 1%`,
  `fopat = 0.1%`), and reserves company consecutivos (`REM-…` / `MAN-…`).
- **Store‑and‑forward.** Documents are enqueued in the strict RNDC order and sent
  by a worker that respects dependencies and retries with backoff — the app stays
  usable even when the RNDC is down.

## Features

**Maestros** — Terceros (full name = *nombre + apellidos*, DIVIPOLA municipio picker,
lat/long map, RNDC registration), Vehículos (config, tenedor/propietario/conductor
pickers), Municipios (DIVIPOLA search shown as `nombre – nombre_mpio, departamento`),
Productos/Catálogos (empaque, carrocería, configuración), Empresa (NIT, póliza,
EMF, consecutivos).

**Operación** — Solicitudes (list / create / edit / detail), **Confirmar despacho**
(multi‑remesa, vehicle → conductor + tenedor autofill), **Despachos** list,
**Cola** monitor (safe‑mode banner, per‑row XML preview, "procesar"), **Cumplido**
(per‑remesa + manifiesto), all wired to the RNDC pipeline.

**Documents** — Manifiesto & Remesa **PDFs** rendered from the ported templates,
with the **RNDC QR** (structured MEC text) and the *seguridad* code; falls back to
printable HTML when no browser is available.

**Insights** — **Dashboard** (Recharts: queue by status, dispatches over time,
solicitudes by status + KPIs) and **Informe** — a filterable report at two levels
(**per‑remesa detail** / **per‑manifiesto summary**) downloadable as **CSV**, with
filters for text, remesa/manifiesto number, status, client and despacho date range;
columns include IDs, statuses, dates, cliente, conductor, tenedor, peso, flete and
retentions.

**Guardrails** — Dangerous‑goods check: choosing *Carga peligrosa* with a product
missing **Código UN / Estado** warns immediately and blocks saving (enforced again
on the server). Real RNDC sends are `admin`‑only and gated by the safety switch.

## Requirements

- **Node ≥ 20** and npm
- **MySQL / MariaDB** with the schema in [`database/`](database/)
- *(Optional, for PDF)* **Google Chrome or Edge** installed — the backend renders
  PDFs via the system browser (`puppeteer-core`); without one it serves printable HTML.

## Setup & run

```bash
# 1. Configure the backend (DB, JWT secret, RNDC credentials)
cp backend/.env.example backend/.env      # then edit DB_*, JWT_SECRET, RNDC_*

# 2. Install both workspaces
npm install

# 3. Create the first admin user (staff_users table is created if missing)
npm run seed:admin -- --email admin@tms.local --password "CHANGE-ME" --nombre "Admin"

# 4. Start API (:4000) + SPA (:5173, proxies /api)
npm run dev
```

Open http://localhost:5173 and sign in.

## Scripts

Run from the repository root:

| Command | What it does |
|---------|--------------|
| `npm run dev` | Backend + frontend in parallel (`concurrently`) |
| `npm run build` | Build backend (`tsc`) and frontend (`vite build`) |
| `npm run typecheck` | Typecheck both workspaces |
| `npm test` | Backend tests — RNDC byte‑parity + QR format |
| `npm run worker` | Drain the RNDC queue once (schedule via cron / Task Scheduler) |
| `npm run seed:admin` | Create / refresh the admin user |

## Configuration (`.env`)

`backend/.env` (see `backend/.env.example`). The backend also reads a repo‑root
`.env` as a fallback for shared values.

| Group | Keys |
|-------|------|
| App | `APP_ENV`, `APP_DEBUG`, `PORT` (4000), `CORS_ORIGINS` |
| Auth | `JWT_SECRET`, `JWT_EXPIRES` |
| Database | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_CHARSET` |
| RNDC | `RNDC_AMBIENTE` (`pruebas`/`produccion`), `RNDC_USERNAME`, `RNDC_PASSWORD`, `RNDC_EMPRESA`, `RNDC_HOST_OVERRIDE`, `RNDC_TIMEOUT` |
| Queue | `COLA_MAX_INTENTOS`, `COLA_MINUTOS_REINTENTO`, `COLA_ENVIO_HABILITADO` |

## API overview

All routes are under `/api` and require a Bearer JWT (except `/api/health` and
`/api/auth/login`). Representative endpoints:

| Area | Endpoints |
|------|-----------|
| Auth | `POST /auth/login`, `GET /auth/me` |
| Maestros | `GET/POST/PUT /terceros`, `/vehiculos`, `/productos`; `GET /municipios/buscar`, `/catalogos/*`; `GET/PUT /empresa` |
| RNDC register | `POST /terceros/:id/registrar-rndc`, `POST /vehiculos/:id/registrar-rndc` *(admin)* |
| Operación | `GET/POST/PUT /solicitudes`, `POST /solicitudes/:id/despachar`, `GET /despachos` |
| Cola | `GET /cola`, `POST /cola/procesar` *(admin)*, `POST /cola/:id/procesar` *(admin)*, `GET /cola/:id/xml` |
| Cumplido | `GET /cumplido`, `GET/POST /cumplido/:manifiestoId` |
| Docs | `GET /manifiesto/:id/pdf`, `GET /remesa/:manifiestoId/pdf` |
| Insights | `GET /stats`, `GET /informe`, `GET /informe/csv` |

## Authentication & roles

Staff accounts live in `staff_users` (bcrypt). Login returns a JWT (persisted
client‑side by Zustand). Two roles:

- **`operador`** — day‑to‑day: maestros, solicitudes, confirm dispatch (enqueues),
  cumplido, reports, PDFs.
- **`admin`** — everything above **plus** real RNDC sends (draining the queue,
  registering maestros) and editing company data.

## Safety switch (RNDC sending)

`COLA_ENVIO_HABILITADO=false` (default) makes the worker **build and preview** the
RNDC XML but **never send** it — safe for development and testing. Set it to `true`
only when you intend to write to the Ministry's RNDC, and note that sending is
additionally restricted to the `admin` role.

## Testing & parity

- `npm test` runs **characterization tests**: the TypeScript RNDC client produces
  **byte‑for‑byte identical** XML/SOAP to the original PHP (including the
  **ISO‑8859‑1** wire encoding), and the manifiesto **QR** text keeps its exact
  field order/format.
- **Real‑data parity:** the `payload_xml` rows generated by the legacy PHP app were
  regenerated by the Node `ColaRepo` and matched byte‑for‑byte.
- Regenerate RNDC fixtures with `php backend/test/gen_rndc_fixtures.php` (source of
  truth: `legacy/src/Rndc/RndcClient.php`).

## Migration notes (PHP → Node.js)

The rewrite ports the PHP repositories 1:1 to typed `mysql2` modules — the SQL and
business rules are preserved, not reinterpreted. Highlights:

- `RndcClient.php` → `backend/src/rndc/RndcClient.ts` (SOAP, ISO‑8859‑1, host
  load‑balancing, XML build/parse) — verified byte‑identical.
- `ColaRepo.php` → `backend/src/modules/cola/` (queue order, dependency gate,
  retry/backoff, safe‑mode, origin propagation, QR lookup, payload builders).
- `SolicitudRepo.php` → `backend/src/modules/solicitudes/` (seeding, retentions,
  multi‑remesa).
- New in the modern stack: JWT auth + roles, the Recharts dashboard, and the
  CSV **Informe**.

See [docs/MODERNIZACION.md](docs/MODERNIZACION.md) for the full migration guide.
