# LabLink Firestore Security Specification

## 1. Data Invariants
1. **Identity Integrity**: A user registration via client SDK can only create `users/{uid}` with `role == 'student'` unless it is an authorized `@lablink.demo` demo account while `settings/demo.enabled == true` and `isDemo == true`. Users cannot self-escalate `role` or `departmentApproved`.
2. **Double-Booking Prevention**: Only `faculty` or `admin` sessions may write `equipmentDaySchedules/{equipmentId}_{YYYY-MM-DD}` and `bookings` with status `approved`/`checked_in`/`completed`. Students cannot directly write `bookings` with status `approved`, `approvals`, `allocationResults`, or `equipmentDaySchedules`.
3. **Immutable Audit Trail**: `auditLogs` are append-only (`create` allowed for signed-in staff/owners with matching `actorId`; `update` and `delete` permanently denied).
4. **Ownership Isolation**: Students may only read/create/update their own `projects`, `bookingRequests`, `notifications`, and cancel their own `bookings`. PII (`users/{uid}`) is readable only by the owner, faculty/admin in governance scope, or admin.
5. **Terminal State Locking**: Once a `bookingRequest` reaches `approved`, `rejected`, or `cancelled`, non-admin users cannot revert or mutate it.
6. **Admin Governance**: Only `admin` can create/modify/deactivate `equipment`, `laboratories`, `departments`, `maintenance`, `settings`, and approve `roleRequests`.

## 2. Dirty Dozen Adversarial Payloads
1. **Privilege Escalation on Registration**: Student creates `users/uid_x` with `{ role: 'admin', isDemo: false }` -> `PERMISSION_DENIED`.
2. **Self-Role Update**: Student updates own `users/uid_x` changing `{ role: 'faculty' }` -> `PERMISSION_DENIED`.
3. **Student Direct Approved Booking**: Student writes `bookings/bk_1` with `{ status: 'approved', studentId: uid }` -> `PERMISSION_DENIED`.
4. **Student Schedule Injection**: Student writes `equipmentDaySchedules/eq1_2026-03-03` -> `PERMISSION_DENIED`.
5. **Student Approval Forgery**: Student writes `approvals/app_1` -> `PERMISSION_DENIED`.
6. **Student Allocation Result Forgery**: Student writes `allocationResults/res_1` -> `PERMISSION_DENIED`.
7. **Shadow Ghost Field Injection**: User updates `projects/proj_1` with extra undeclared field `{ isVerified: true }` -> `PERMISSION_DENIED`.
8. **ID Poisoning**: User creates `projects/<1500_char_id>` -> `PERMISSION_DENIED` (`isValidId`).
9. **Audit Log Tampering**: Faculty or Admin attempts `update` or `delete` on `auditLogs/log_1` -> `PERMISSION_DENIED`.
10. **PII Cross-Student Read**: Student A attempts `get` on `users/student_b_uid` -> `PERMISSION_DENIED`.
11. **Demo Bypass with Non-Demo Email**: User with `evil@gmail.com` creates `users/uid` with `{ role: 'admin', isDemo: true }` -> `PERMISSION_DENIED`.
12. **Terminal Request Reopen**: Student updates `bookingRequests/req_1` from `rejected` back to `submitted` -> `PERMISSION_DENIED`.
