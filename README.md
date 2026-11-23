# LabLink — The Intelligent Campus Resource Network

**One Campus. Every Lab. Unlimited Possibilities.**

LabLink is a production-grade campus laboratory resource-sharing and fair-allocation platform built with React, TypeScript, Tailwind CSS, Three.js (`@react-three/fiber`), Recharts, Firebase Authentication, Cloud Firestore, and server-side Google Gemini (`@google/genai`).

---

## Architecture Overview

1. **Deterministic Hybrid Intelligence (`src/engine/`)**
   - **12 Hard Constraint Validators (`constraints.ts`)**: Equipment active/operational status, maintenance overlap, lab operating hours, confirmed booking capacity overlap, min/max duration bounds, valid time range, hardware spec match (CUDA, VRAM, cores, precision), department/certification permissions, and project deadline cutoff.
   - **5-Factor Priority Scoring (`scoring.ts`)**:
     - Deadline Urgency (default `35%`, piecewise-linear anchor curve)
     - Equipment Necessity (`25%`, free compatible alternatives count)
     - 30-Day Usage Fairness (`20%`, linear decay against configurable fair-use threshold)
     - Slot Feasibility (`15%`, exact requested slot vs earliest shifted window)
     - Waiting Time (`5%`, capped at 168h)
   - **Sequential Assignment & Alternatives (`allocator.ts`)**: Assigns highest-priority feasible windows without double booking, computes same-equipment alternatives, alternative compatible equipment, nearby labs, split-booking segments, and waitlist fairness rank.
   - **What-If Simulator (`runWhatIf`)**: Pure state cloning guarantees live bookings are never mutated while tuning factor weights.

2. **Transactional Booking & Hardened Security (`firestore.rules` + `src/data/repo.ts`)**
   - Confirmed approvals run inside a Firestore `runTransaction` locking `equipmentDaySchedules/{equipmentId}_{YYYY-MM-DD}` alongside `bookings`, `bookingRequests`, `approvals`, `notifications`, and `auditLogs`.
   - Students can only create accounts with `role: 'student'` and request elevated roles via `roleRequests` reviewed by administrators.
   - Faculty overrides on non-#1 or non-recommended slots enforce a minimum 20-character justification recorded immutably in `approvals` and `auditLogs`.

3. **Server-Side Gemini API Proxy (`server.ts`)**
   - `POST /api/ai/explain`: Explains deterministic engine outputs using `gemini-4-hydrogen`, validated against engine numbers (`validateExplanationAgainstEngine`) with rule-based fallback.
   - `POST /api/ai/search`: Extracts structured inventory filter JSON (`nlSearchFilterSchema`) with keyword fallback.
   - `POST /api/ai/assistant`: Grounded RAG over retrieved inventory, user requests, and deterministic alternatives.
   - `POST /api/ai/insights`: Executive analytics insights strictly bound to computed metric keys.
   - `GEMINI_API_KEY` stays strictly server-side; never exposed in the client bundle.

---

## Setup & Configuration

### 1. Environment Variables
Set in AI Studio Secrets or `.env` (see `.env.example`):
- `GEMINI_API_KEY` — Enables live Gemini responses on `/api/ai/*` (without it, endpoints cleanly return labeled rule-based/retrieval fallbacks).

### 2. Firebase Console Configuration
Firebase project configuration is stored in `firebase-applet-config.json` and security rules are deployed in `firestore.rules`. To enable full cloud auth for real users:
1. Open **Firebase Console -> Authentication -> Sign-in method** and enable **Email/Password** and **Google**.
2. Open **Authentication -> Settings -> Authorized domains** and add your preview/deployment hostname.
3. Sign in with the bootstrapped admin email (`pruthviskgl06@gmail.com`) and visit **Admin -> Settings -> Seed / Reset Firestore Demo Data** to populate `departments`, `laboratories`, `equipment`, and `settings/demo`.

### 3. Local Demo Mode (Zero-Friction Evaluation)
If Firebase Email/Password sign-in or domain authorization is not yet enabled, LabLink includes a **Local Demo Mode** backed by `localStorage` (`lablink_demo_dataset_v1`) with the complete Section 10 3-student GPU contention scenario and a persistent banner + Reset Demo Data button.

---

## Running & Testing

```bash
npm install
npm test          # Runs Vitest unit tests (Section 10 scenario, constraints, What-If, concurrency lock)
npm run lint      # TypeScript check (tsc --noEmit)
npm run dev       # Starts Express + Vite dev server on http://localhost:3000
npm run build     # Production Vite build
```

## Security Honesty Note
For serverless deployment without paid Cloud Functions, deterministic priority scores and slot validations run client-side prior to Firestore transaction verification, while `firestore.rules` strictly enforces RBAC, prevents student self-approval or privilege escalation, locks `equipmentDaySchedules` writes to staff, and protects immutable audit trails. In a full enterprise Cloud Functions deployment, `runAllocationEngine` and transactional approval would execute inside a server-verified Cloud Function.
