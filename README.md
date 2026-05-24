# Repitol

**Production multi-tenant LINE loyalty platform for restaurants.** Stamp cards, coupons, automated delivery, and shift management — used by real customers under a monthly contract.

This repository is a sanitized public version of the production codebase. Tenant data, integration secrets, and client-specific business rules have been stripped, but the architecture, migrations, and feature surface mirror what is in production.

---

## Why this exists

Independent restaurants in Japan rely heavily on LINE for customer communication, but most off-the-shelf loyalty tools are either too generic (digital stamp cards with no business logic) or too expensive (enterprise LINE CRM platforms). Repitol sits in between: a multi-tenant SaaS that gives a single owner everything needed to run loyalty + retention on LINE, priced for a single-location operator.

The platform is live, serves real end-customers, and bills monthly.

---

## Feature surface

| Area | What it does |
|---|---|
| **LINE integration** | Messaging API webhooks + LIFF UI for stamp cards, coupons, and rewards |
| **Two-stage rewards** | Intermediate + final reward on the same stamp card (e.g. 5-stamp drink, 10-stamp meal) |
| **Coupon templates** | Issue on friend-add, monthly, on reward completion, or by manual blast |
| **Exclusive coupon groups** | Prevent double-use across mutually-exclusive coupon sets |
| **QR stamp issuance** | In-store QR scan → server-validated stamp grant (anti-spoofing via short-lived tokens) |
| **Multi-shop tenant** | One organization, multiple shops, per-shop membership and stamp history |
| **Shift management** | Built-in employee scheduling module for the same restaurant owner |
| **Owner dashboard** | Supabase-Auth–protected admin UI for stamps, coupons, customers, shifts |

---

## Architecture

```
                        ┌──────────────────────────────────┐
                        │       LINE Platform              │
                        │  (Messaging API + LIFF)          │
                        └────────────┬─────────────────────┘
                                     │ webhook / LIFF
                                     ▼
        ┌────────────────────────────────────────────────────┐
        │           Next.js 16 (App Router, RSC)             │
        │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  │
        │  │ /liff        │  │ /dashboard   │  │ /api     │  │
        │  │ end-user UI  │  │ owner admin  │  │ webhooks │  │
        │  └──────┬───────┘  └──────┬───────┘  └────┬─────┘  │
        │         └──────────┬──────┴────────────────┘       │
        │                    ▼                               │
        │            Server Actions / Route Handlers         │
        └────────────────────┬───────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────────────────┐
        │              Supabase (Postgres + RLS)             │
        │   organizations · shops · customer_memberships     │
        │   stamp_cards · stamp_events · coupons · shifts    │
        └────────────────────────────────────────────────────┘
```

- **Tenant isolation** is enforced at the database layer via Row Level Security policies on every table that holds tenant data — not at the application layer alone.
- **End-user surface (`/liff`)** and **owner surface (`/dashboard`)** are separate route trees with different auth assumptions: LIFF users are LINE-authenticated and read-only on most resources; dashboard users are Supabase-authenticated and scoped to their organization.

---

## Technical decisions worth noting

- **21 sequential migrations**, not a greenfield schema. The codebase reflects real product evolution: a single-shop model later refactored to multi-shop via `customer_shop_memberships` (migration 014) and an organization-level rollup (migration 011). Reading the migrations in order tells the product's history.
- **Supabase RLS over application-layer authorization.** Each tenant policy is expressed once in SQL and enforced regardless of which API path touches the row. This eliminates an entire class of "I forgot to filter by tenant" bugs.
- **Exclusive coupon groups** (migration 010) solve a real business problem: a customer earning a free-drink coupon should not also be eligible for a competing discount in the same campaign. Modeled as a join table with a database-level uniqueness constraint, not application-layer logic.
- **Server-validated QR stamps.** The QR encodes a short-lived signed payload; the stamp grant happens server-side after validation, so a screenshot of someone else's QR cannot be replayed.
- **Adapter-pattern integrations.** LINE Messaging API and Supabase clients are wrapped in `src/lib/line/` and `src/lib/supabase/` so the call sites stay framework-agnostic and easily testable.

---

## Stack

- **Frontend** — Next.js 16 (App Router) / React 19 / Tailwind v4 / shadcn/ui
- **Backend** — Next.js Route Handlers + Server Actions
- **Database / Auth** — Supabase (Postgres with RLS, Supabase Auth)
- **LINE** — `@line/liff` + Messaging API
- **Validation** — Zod throughout
- **Other** — html5-qrcode (QR scanning), ExcelJS (shift export)

---

## Repository layout

```
src/
├── app/
│   ├── (auth)/           login, signup
│   ├── (dashboard)/      owner admin UI (org / shop / coupon / stamp / shift)
│   ├── liff/             end-user LIFF surface
│   ├── api/              webhooks, QR validation, server-side endpoints
│   ├── coupon/ stamp/    public end-user pages
│   └── l/ s/             short-link routes
├── lib/
│   ├── supabase/         client + server + middleware factories (singletons)
│   ├── line/             Messaging API wrapper
│   ├── shift/            shift-management business logic
│   ├── validations/      Zod schemas
│   └── constants/        shared constants (no magic strings in call sites)
supabase/
└── migrations/           21 sequential SQL migrations + demo seed (run_all.sql)
```

---

## Local development

```bash
npm install
cp .env.example .env.local   # fill in required values
npm run dev
```

### Required environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_LIFF_ID=
LINE_CHANNEL_ID=
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
```

### Database

Apply the SQL files in `supabase/migrations/` to a Supabase project in numeric order, or run `run_all.sql` for a fresh setup. The demo organization and shops (Demo Restaurant Shop A / B) are seeded by `007_fix_all.sql`.

---

## Status

- **Production**: live, paying customer
- **This repo**: sanitized public mirror for review / portfolio purposes — not the deployed branch

---

## License

MIT — see [LICENSE](./LICENSE).
