# Textora Engage — Sales & Follow-Up CRM

A unified, web-first Sales CRM for Textora Technologies, replacing fragmented Google Sheets and Forms.

## 🚀 Quick Start (Development)

### 1. Start the database and storage
```bash
docker-compose up -d
```
This starts:
- **PostgreSQL 16** on `localhost:5432`
- **MinIO** on `localhost:9000` (API) and `localhost:9001` (Web UI)

### 2. Configure environment
```bash
copy .env.example .env.local
# The defaults match docker-compose — no changes needed for local dev
```

### 3. Install dependencies
```bash
npm install
```

### 4. Run database migrations
```bash
npm run db:migrate
# Enter migration name: "init"
```

### 5. Seed the database
```bash
npm run db:seed
```

**Seed creates these accounts:**
| Role | Email | Password |
|---|---|---|
| Super Admin | aaditya@textorasms.com | Admin@1234 |
| Sales Manager | manager@textorasms.com | Manager@1234 |
| Sales Rep 1 | rep1@textorasms.com | Rep@1234 |
| Sales Rep 2 | rep2@textorasms.com | Rep@1234 |
| Accounts Ops | accounts@textorasms.com | Accounts@1234 |

### 6. Start the app
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## 📦 Project Structure

```
textora-engage/
├── app/
│   ├── (dashboard)/          ← Protected pages (sidebar layout)
│   │   ├── dialer/           ← Module 1: Cold Calling Console
│   │   ├── agenda/           ← Module 2: Follow-Up & Demo Agenda
│   │   ├── pipeline/         ← Module 3: Kanban Deal Pipeline
│   │   ├── payments/         ← Module 4: Payment Ops
│   │   └── reports/          ← Module 5: EOD Sales Dashboard
│   ├── api/                  ← API Route Handlers
│   │   ├── auth/             ← Login, Register, Logout, Me
│   │   ├── leads/            ← CRUD + CSV import + disposition
│   │   ├── tasks/            ← Callbacks & demos
│   │   ├── deals/            ← Pipeline deals
│   │   ├── payments/         ← Payment collection & approval
│   │   ├── upload/           ← MinIO presigned URL
│   │   └── reports/          ← EOD metrics aggregation
│   └── login/                ← Login page
├── components/
│   ├── dialer/               ← DialerCard, DispositionBar, CSVImporter
│   ├── pipeline/             ← KanbanBoard, DealCard, DealModal
│   ├── payments/             ← PaymentModal
│   └── layout/               ← Sidebar, TopBar
├── lib/
│   ├── auth.ts               ← JWT helpers (jose)
│   ├── prisma.ts             ← Prisma singleton
│   ├── minio.ts              ← MinIO client + presigned URLs
│   └── utils.ts              ← Currency, phone, WA pitch
├── prisma/
│   ├── schema.prisma         ← 7 multi-tenant tables
│   └── seed.ts               ← Initial data
├── middleware.ts             ← Edge JWT auth + tenant injection
└── docker-compose.yml        ← PostgreSQL + MinIO
```

---

## 🔑 Key Features

### Module 1 — Cold Calling Console (`/dialer`)
- **tel: deep link** → opens native phone dialer (Windows Phone Link / mobile)
- **wa.me deep link** → opens WhatsApp with pre-filled Aaditya pitch (₹0 Meta API cost)
- 7-disposition quick-action bar: RNR, Connected, Callback, Demo Scheduled, Not Interested, Already Using, Invalid
- CSV/Excel bulk importer with phone normalization and deduplication
- Auto-advances to next lead after each disposition

### Module 2 — Follow-Up Agenda (`/agenda`)
- Partitioned into: **Overdue**, **Today's Schedule**, **Upcoming Demos**
- Web Notifications API 5-minute pre-alerts for upcoming tasks
- One-click mark as completed

### Module 3 — Kanban Pipeline (`/pipeline`)
- 5-column drag-and-drop board using `@hello-pangea/dnd`
- Per-column revenue (₹) and credit aggregation
- Dragging to Payment Pending / Closed Won auto-triggers Payment Modal

### Module 4 — Payment Collection (`/payments`)
- 18% GST auto-calculation with TDS deduction support
- MinIO drag-and-drop receipt upload (presigned direct upload)
- Ops verification queue with screenshot lightbox
- Approve → auto-closes deal to Closed Won + provisions credits

### Module 5 — EOD Reports (`/reports`)
- Real-time 10-metric dashboard per rep + team totals
- Rep leaderboard with 🥇🥈🥉 rankings
- Date picker for historical reports
- One-click CSV export

---

## 🔐 RBAC Roles

| Role | Dialer | Agenda | Pipeline | Payments | Reports | Team |
|---|---|---|---|---|---|---|
| `super_admin` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `sales_manager` | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| `sales_rep` | ✅ | ✅ | ✅ own | ✅ own | — | — |
| `accounts_ops` | — | — | — | ✅ all | — | — |

---

## 🛠 Tech Stack
- **Frontend + API**: Next.js 14 App Router, TypeScript, Tailwind CSS
- **ORM**: Prisma + PostgreSQL 16
- **Auth**: JWT (jose) with HttpOnly cookies
- **Drag-and-drop**: @hello-pangea/dnd
- **Data fetching**: TanStack Query v5
- **File storage**: MinIO (dev) → AWS S3 (prod, toggle via env)
- **CSV parsing**: papaparse + xlsx
- **Toasts**: sonner

---

## 🔧 Useful Commands
```bash
npm run db:studio     # Open Prisma Studio (visual DB browser)
npm run db:migrate    # Run a new migration
npm run db:reset      # Reset DB and re-run all migrations
docker-compose down   # Stop all containers
```
