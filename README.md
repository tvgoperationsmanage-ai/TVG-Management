# TVG Management — PRO Functional V3

V3 is built directly from the verified PRO Functional V1 working package. The V1 HTML/CSS/JS/Firebase architecture is the baseline; the workflow layer is additive rather than a rewrite.

## Added workflow features
- In-app notification bell with unread badge.
- Employee leave/application submission notifies active management profiles.
- Management approval/rejection records reviewer, time and optional note and notifies the employee.
- Pending leave/application Action Center on the management dashboard.
- Monthly Leave and Application archive folders, newest month first. Current month opens automatically.
- Employee-side cancellation of pending requests.
- Search/status filters and CSV export on leave/application registers.
- Native date/time/month picker support.

## Important
The existing V1 attendance, Firebase project, collections, navigation and HR modules are preserved. Security rules remain the same functional-stage rules supplied with V1; security hardening should be done only after the workflow is live-tested.

## Testing
Static tests performed before release: JavaScript syntax, JSON parsing, required files, HTTP smoke test and ZIP integrity. Live Firebase authentication, Firestore writes and real GPS behavior still require TVG's deployed Firebase project and real accounts; they are not claimed as live-tested here.

## Offline / Management Entry (V4)

If an employee cannot use the app because their phone is unavailable, left at home, damaged, or another operational issue has been physically verified, management can enter the employee's records on their behalf.

Management can use:

- **Attendance → Management Entry** for check-in, check-out, date, status, reason and management notes.
- **Leaves → Management Entry** to record a leave request for an employee.
- **Applications → Management Entry** to record an employee request.
- **Employee Report → Activity / Note** to record verified operational activity that does not fit attendance or leave.

Manual records are explicitly marked `Management Manual` and include the management user, timestamp and reason/note. This keeps the report transparent instead of making a manual entry look like a GPS/app check-in. Employee monthly reports combine app/GPS records with management entries and manual activity history.

The existing approval workflow remains in place: management-entered leave/application requests start as `Pending` unless the organization later defines a different workflow.

This is an operational fallback, not a replacement for normal employee self-service attendance.


## V7 PWA installation (production-ready)

This build includes a web app manifest, 192px/512px TVG icons, a service worker, offline app-shell caching, and an in-app install button when the browser exposes the install prompt.

### Employee installation
1. Open the TVG HTTPS GitHub Pages link.
2. Sign in normally.
3. On supported Android/Chrome devices, use the **Install TVG app** button when it appears, or Chrome → **Install app / Add to Home screen**.
4. On iPhone/iPad, open the link in Safari → **Share** → **Add to Home Screen**.
5. Launch TVG from the new home-screen icon.

The app must be served over HTTPS for production installation and browser geolocation. GitHub Pages provides HTTPS.

### PWA update behavior
The service worker caches only the local application shell/assets. Firebase authentication and Firestore remain network-backed. When a new deployment is published, the service-worker cache version changes so the new shell can replace the previous cached version.

## V9 HR / Payroll Upgrade

This release keeps the V8 working architecture and adds controlled HR master-data and reporting capabilities:

- employee job/designation, duties and employment type
- branch/shop assignment and reporting-to relationship
- configurable weekly company off per employee
- salary type and salary amount
- overtime rate, allowances, manual deductions and commission/incentive fields
- company assets issued summary on the employee profile
- branch-wise workforce report
- employee monthly attendance/salary-period report
- CSV and Excel-compatible `.xls` exports
- browser print / Save as PDF workflow
- mobile-safe modal with a sticky Save button

The salary report intentionally does not assume statutory tax or payroll law. TVG-approved policy should be applied before treating the estimated net as final payroll.
