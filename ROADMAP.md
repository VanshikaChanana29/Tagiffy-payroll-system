# HRMS Product Blueprint & Roadmap (Keka-style tool, built on dayflow-hrms)

## Context

Goal: extend the existing `dayflow-hrms` repo (MERN — Express/Mongoose backend + React/Vite frontend) into a full-featured HRMS similar to Keka's core functionality, rather than rebuilding from scratch — since auth, employee CRUD, attendance, leave, and basic payroll were already functional in the cloned repo.

---

## Part 1 — Original Repo Assessment (`dayflow-hrms`, as cloned)

**What already worked** (genuinely functional, not stubs):
- JWT auth (register/login/logout, email-verification flow simulated locally), 2 roles: `admin`, `employee`
- Employee CRUD + directory with search/filter, soft-deactivate, document metadata
- Attendance: check-in/out, daily/weekly/monthly views, admin regularization
- Leave: apply/approve/reject, auto leave-balance adjustment, overlap detection
- Payroll: basic salary structure (basic, HRA, allowances, deductions, tax/PF/LOP), auto gross/net calc, payslip view
- Light/dark theme, Indian demo dataset (INR), self-contained SVG avatars (no external image dependency)

**Known problems found:**
| Issue | Where | Impact | Status |
|---|---|---|---|
| `startOfMonth`/`endOfMonth` used but not imported | `server/src/controllers/attendanceController.js` (`getMyMonthlyView`) | Monthly attendance calendar endpoint threw `ReferenceError` at runtime | ✅ Fixed |
| Silent fallback to in-memory MongoDB if no local Mongo running | `server/src/config/db.js` | **Data loss on every restart** if Mongo isn't connected | ⬜ Not fixed — no local MongoDB installed yet; still running on in-memory fallback |
| JWT stored in `localStorage` | `client/src/api/client.js` | XSS token-theft risk; move to httpOnly cookie before real deployment | ⬜ Not fixed |
| "Documents" feature is metadata-only | `User.js` model, document routes | No actual file is stored (`fileUrl` always empty) | ⬜ Not fixed |
| No email/SMTP integration | whole backend | Verification tokens returned in API response instead of emailed | ⬜ Not fixed |
| Only 2 roles (`admin`, `employee`) | `User.js` enum | No Manager role/reporting hierarchy | ✅ Fixed — `manager` role + `reportingManager` field added |
| No Department/Designation entities | `User.js` | Department/designation were free-text strings | ✅ Fixed — real `Department`/`Designation` collections + Org Settings admin UI |
| No automated test suite | `server/src/test_phase*.js` | Manual console scripts, not CI-runnable | ⬜ Not fixed |
| No pagination / input validation library | `userController.js` | Won't scale past small teams | ⬜ Not fixed |

---

## Part 2 — Full Feature Blueprint

Legend: **A** = Must-have for MVP · **B** = Should-have post-MVP · **C** = Advanced/future

### 1. Admin/HR Dashboard — A
Single-screen overview — headcount, today's attendance %, pending leave approvals, upcoming birthdays/anniversaries, payroll run status. Used by Admin/HR and Manager (scoped to their team). Pulls live data from Attendance, Leave, Payroll, Onboarding — a read aggregator, not a data owner.

### 2. Employee Management — A
- **Create/Edit employee, Employee profile:** core system-of-record; everything else foreign-keys off it.
- **Departments, Designations:** ✅ now real master-data entities managed via Org Settings.
- **Teams, Reporting managers:** ✅ reporting hierarchy now exists via `reportingManager` on User.
- **Employee documents:** still metadata-only, needs real file storage.
- **Employee status:** Active/Inactive drives login + payroll eligibility.

### 3. Role-Based Access Control — A
- **Super Admin:** full system access, org settings/billing. *(not modeled separately yet — folded into `admin` for now)*
- **HR/Admin:** manage all employees, approve leave org-wide, run payroll, configure policies.
- **Manager:** ✅ role exists; ⬜ still needs scope-aware approvals (see her own team's leave/attendance instead of nothing).
- **Employee:** self-service only.

### 4. Attendance Management — A
Check-in/out, working hours, late/early/overtime, history — mostly built. Still needs configurable shift timings and an employee-initiated correction/regularization request flow (currently admin-only direct edit).

### 5. Location-Based Attendance / Geofencing — B (A if hybrid workforce is a priority)
Office locations with lat/long + radius; check-in validated server-side (Haversine formula, never trust client claims); GPS accuracy capture; location history; graceful handling when GPS permission is denied.

### 6. Leave Management — A
Leave types/balance/apply/approve built for Paid/Sick/Unpaid. Needs: configurable leave types, **Holiday calendar** (missing entirely), org-wide leave history view for HR.

### 7. Payroll Management — A (basic), B/C (statutory compliance)
Needs to move from hand-typed monthly salary docs to a reusable **Salary Structure template** + monthly **Payroll Run** batch. Full Indian statutory compliance (PF/ESI/Professional Tax/TDS/gratuity) is complex, genuinely advanced — consider a compliance API/service rather than hand-rolling tax law.

### 8. Employee Self-Service — A
Profile, attendance, leave, payslips, documents mostly exist. Missing: a generic "Requests" concept beyond leave.

### 9. Reports & Analytics — B
No filterable reports/exports exist yet beyond dashboard counts.

### 10. Notifications — B
No in-app or email notifications yet; needs SMTP first.

### 11. Employee Onboarding/Offboarding — B
No multi-step onboarding checklist or structured exit workflow yet.

### 12. Performance Management — C
Goals, reviews, feedback — not built, genuinely separate module.

### 13. Expense Management — C
Submission/approval/reimbursement — not built; can reuse the Leave approval pattern.

### 14. Helpdesk/HR Requests — C
Generic ticket entity — not built.

### 15. Organization Settings — A (basics), B (rest)
- Departments: ✅ done (Org Settings page).
- Company details, offices, holidays, shifts, attendance rules, leave policies, payroll settings: ⬜ still missing.

---

## Part 3 — Build Roadmap & Progress

### Phase 0 — Stabilize the existing foundation
- [x] Fix `getMyMonthlyView` missing date-fns import
- [ ] Replace in-memory Mongo fallback with a real persistent DB (local install or Atlas)
- [ ] Add real file storage for documents
- [ ] Move JWT off localStorage to httpOnly cookies
- [ ] Add input validation (e.g. Zod/Joi) + a real test suite

### Phase 1 — Close out MVP (area A items)
- [x] Departments & Designations as real master-data entities + Org Settings admin page
- [x] Manager role + reporting-line hierarchy (`reportingManager` field, eligible-managers endpoint)
- [ ] Scope-aware RBAC — Managers should see/approve only their own team's leave & attendance, not just log in with no view
- [ ] Holiday calendar
- [ ] Org Settings: company profile + shift/working-hours configuration
- [ ] Payroll: reusable Salary Structure template + monthly Payroll Run batch process

### Phase 2 — Should-have (area B)
- [ ] Geofencing / location-based attendance
- [ ] Reports & Analytics with CSV/Excel export
- [ ] Notifications (in-app + email once SMTP exists)
- [ ] Onboarding checklist workflow

### Phase 3 — Advanced (area C)
- [ ] Full Indian statutory payroll compliance (PF/ESI/Professional Tax/TDS/Form 16, gratuity)
- [ ] Performance Management (goals, reviews, feedback)
- [ ] Expense Management (submission, approval, reimbursement)
- [ ] Helpdesk / HR Requests

Each phase builds on entities (Employee, Department, Reporting Manager, Org Settings) established earlier, so nothing needs to be reworked later.
