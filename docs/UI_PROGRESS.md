# LabLink Nexus — Frontend Immersion & Craft Progress

Status: **In Progress (Starting F1)**
Scope Lock: Frontend presentation only. Zero changes to Firebase Auth, Firestore schemas/rules, `server.ts`, `src/data/repo.ts` write/transaction logic, `src/engine/*`, or `vitest` tests.

## Phase Plan
- [x] **F0** — Image assets mapped to `/public/images/...` + `UI_PROGRESS.md` initialized
- [ ] **F1** — Tokens (`src/index.css`), `departmentThemes.ts`, `imageManifest.ts`, `AppImage.tsx`, `SceneBackdrop.tsx`, shared UI kit (`Primitives.tsx`), and procedural 3D model library (`src/three/models/*`) + `Equipment3DViewer.tsx`
- [ ] **F2** — `AppShell.tsx` (glass sidebar, `Ctrl/Cmd+K` search palette, breadcrumbs, mobile bottom tab bar, Tier-aware backdrop) & additive routes in `App.tsx`
- [ ] **F3** — Cinematic `LandingPage.tsx` & Tier B split-layout Auth pages (`LoginPage`, `RegisterPage`, `ForgotPasswordPage`)
- [ ] **F4** — 3D Campus Explorer (`CampusExplorerScene.tsx`, `CampusExplorerPage.tsx` L1/L2/L3 + 2D isometric fallback) & `DepartmentPage.tsx`
- [ ] **F5** — AI Command Center (`AiRecommendationsPage.tsx` / `/student/command-center`)
- [ ] **F6** — Equipment Catalogue (`EquipmentExplorePage`, `EquipmentCard`) & Detail (`EquipmentDetailPage`, `BookingCalendar`)
- [ ] **F7** — Student Workspace (`StudentDashboard`, `ProjectsPage`, `ProjectFormPage`, `ProjectDetailPage`, `StudentBookingsPage`, `NotificationsPage`, `ProfilePage`)
- [ ] **F8** — Faculty (`FacultyDashboard`, `FacultyRequestsPage`, `FacultyRequestDetailPage`, `FacultyCalendarPage`, `FacultyEquipmentPage`, `ConflictResolutionStudioPage`) & Admin/Shared (`AdminDashboard`, `CampusNetworkGraph`, `Admin*Page`, `AnalyticsPage`)
- [ ] **F9–F10** — Orphan check, route -> component wiring table, `compile_applet`, `lint_applet`, `npm test`, and `playwright-cli` desktop (`1440x900`) & mobile (`390x844`) verification

## Visual-Only Logic Adjustments Log
- *(None yet)*
