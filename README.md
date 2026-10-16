# Textora Engage — Enterprise Sales & Outreach CRM

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare)](https://workers.cloudflare.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS%204-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)

**Textora Engage** is a high-velocity, unified Sales CRM engineered to streamline cold outreach, pipeline tracking, demo scheduling, payment collection, and end-of-day sales reporting. It replaces fragmented spreadsheets with an integrated, role-governed workspace for sales reps, managers, and administrators.

---

## 🌟 Key Modules & Capabilities

### 1. 📞 Smart Dialer Console (`/dialer`)
* **Auto-Advancing Lead Queue:** Continuously feeds qualified leads directly to reps without manual searching.
* **One-Click Native Calling:** `tel:` integration automatically launches native dialers (Windows Phone Link, VoIP softphones, or mobile devices).
* **WhatsApp Direct Pitch:** Instant `wa.me` deep linking with pre-configured sales copy and personalized lead parameters.
* **Instant Disposition Workflow:** 7 standardized call outcomes (*RNR, Connected, Callback Requested, Demo Scheduled, Not Interested, Already Using, Invalid Number*) with immediate task generation.

### 2. 📋 Lead Management & Bulk Ingestion (`/leads`)
* **High-Speed CSV / Excel Importer:** Upload thousands of contacts with automated phone normalization, country-code validation, and deduplication.
* **Intelligent Lead Assignment:** Bulk assign leads directly to sales representatives or distribute evenly using round-robin logic.
* **Lead Tracking & Filtering:** Search by contact name, company, vertical, status, source, and assigned rep.

### 3. 📊 Real-Time Analytics & Dashboards (`/dashboard`)
* **Live Sales Metrics:** Track total calls made, connect rates, scheduled demos, active pipeline value, and won revenue.
* **Role-Adaptive Views:** Specialized metrics tailored for Super Admins, Sales Managers, and individual Sales Reps.
* **Rep Leaderboard:** Live performance rankings (🥇🥈🥉) highlighting top converters and call volume leaders.

### 4. 📅 Smart Task & Demo Agenda (`/agenda`)
* **Triage Organization:** Separated into **Overdue Actions**, **Today's Commitments**, and **Upcoming Demos**.
* **Proactive Alerts:** Visual urgency indicators and upcoming reminder notifications to eliminate dropped leads.
* **One-Click Completion:** Close or advance follow-up tasks directly from the agenda stream.

### 5. 💼 Visual Kanban Deal Pipeline (`/pipeline`)
* **Drag-and-Drop Pipeline Stages:** Built with fluid drag-and-drop interactions to track deals from initial discovery to closed business.
* **Stage Revenue Forecasting:** Dynamic revenue (₹) and volume summaries per pipeline stage.
* **Automated Ops Hand-off:** Moving deals to *Payment Pending* automatically triggers payment intake.

### 6. 💳 Payment Collection & Operations (`/payments`)
* **Automated Tax Calculation:** Instant 18% GST calculation with optional TDS deductions.
* **Receipt & Invoice Verification:** Secure drag-and-drop proof-of-payment upload via S3 / object storage.
* **Operations Verification Queue:** Dedicated review lightbox for accounts and finance ops to verify transactions before provisioning customer credits.

### 7. 📈 EOD Sales Reporting (`/reports`)
* **Automated End-of-Day Aggregation:** Compiles total calls, talk time, dispositions, and revenue closed across the team.
* **Historical Auditing:** Date-filtered reporting with one-click CSV export for executive review.

### 8. 👥 Team & Access Governance (`/team`, `/profile`)
* **Granular Role-Based Access Control (RBAC):** Distinct permissions across administrative, management, rep, and accounts personnel.
* **User Lifecycle Management:** Super Admins can add team members, update permissions, or toggle account status (Active / Suspended).
* **Secure Credential Management:** Super Admin-managed password resets and controlled account recovery.

---

## 🔐 Role-Based Access Matrix

| Feature Module | Super Admin | Sales Manager | Sales Rep | Accounts Ops |
| :--- | :---: | :---: | :---: | :---: |
| **Executive Dashboard** | Full Team | Full Team | Personal | — |
| **Dialer Console** | ✅ | ✅ | Assigned Leads | — |
| **Lead Directory** | Full Access | Full Access | Assigned Leads | — |
| **Bulk Import & Assignment** | ✅ | ✅ | — | — |
| **Task & Demo Agenda** | Full Team | Full Team | Personal | — |
| **Kanban Deal Pipeline** | Full Team | Full Team | Personal Deals | — |
| **Payment Verification** | Approve / View | View | Submit Deals | Full Approval |
| **EOD Reports & Exports** | Full Team | Full Team | — | — |
| **Team Management** | Full Access | View Only | — | — |

---

## 🛠 Architecture & Tech Stack

```
                                  [ Cloudflare Global Edge ]
                                              │
                         ┌────────────────────┴────────────────────┐
                         ▼                                         ▼
                 [ Static Assets / CDN ]                [ Next.js Server Function ]
                 (Images, CSS, Chunks)                  (workerd OpenNext Runtime)
                                                                   │
                                                ┌──────────────────┴──────────────────┐
                                                ▼                                     ▼
                                      [ PostgreSQL Database ]                 [ Object Storage ]
                                      (Direct TCP via pg/SSL)                 (Payment Receipts)
```

* **Framework:** Next.js 16 (App Router, Turbopack) & React 19
* **Language:** TypeScript 5 (Strict Mode)
* **Styling & UI:** Tailwind CSS v4, Radix UI primitives, Lucide Icons, Sonner toasts
* **State & Drag-and-Drop:** TanStack Query v5, `@hello-pangea/dnd`
* **Database & Connectivity:** PostgreSQL 16 over secure TLS via `pg` and per-request client pooling
* **Authentication:** Stateless JWT (`jose`) using secure HttpOnly, SameSite cookies
* **Edge Deployment:** Cloudflare Workers via `@opennextjs/cloudflare`

---

## 🚀 Getting Started (Local Development)

### 1. Prerequisites
* Node.js 20.x or higher
* Docker & Docker Compose (for local database & storage)
* npm / pnpm / yarn

### 2. Clone and Install
```bash
git clone https://github.com/aaditya-01-28/crm.git
cd crm/textora-engage
npm install
```

### 3. Start Local Services
Launch local PostgreSQL and MinIO object storage:
```bash
docker-compose up -d
```

### 4. Configure Environment
Copy the sample environment file:
```bash
cp .env.example .env.local
```

Populate the required keys in `.env.local`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/textora_engage"
JWT_SECRET="your-secure-32-character-secret-key-here"
JWT_EXPIRY="15m"
JWT_REFRESH_EXPIRY="7d"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 5. Setup Database Schema & Seed
```bash
# Push database schema migrations
npm run db:migrate

# Seed initial roles and test data
npm run db:seed
```

### 6. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🚢 Production Deployment (Cloudflare Workers)

This project is optimized for Cloudflare Workers using `@opennextjs/cloudflare`.

```bash
# Build Next.js application & bundle Worker
npm run build:worker

# Deploy to Cloudflare Workers
npm run deploy
```

Set production secrets securely in Cloudflare:
```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put JWT_SECRET
```

---

## 🔒 Security & Data Protection

* **No Hardcoded Credentials:** All database connection strings, JWT signing keys, and secrets are strictly provided via environment variables.
* **HttpOnly Session Tokens:** Session credentials cannot be accessed via client-side JavaScript, protecting against Cross-Site Scripting (XSS).
* **Prepared SQL Parameterization:** All SQL database queries utilize parameterized inputs (`$1`, `$2`), eliminating SQL injection vulnerabilities.
* **Role Enforcement Middleware:** Server-side route validation guarantees that users cannot escalate privileges or access unauthorized team data.

---

## 📄 License
Internal proprietary software developed for **Textora Technologies Pvt Ltd**. All rights reserved.
