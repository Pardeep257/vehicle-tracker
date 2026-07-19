# RJK Logistics Control Tower V2

## What is included

- Secure Master Admin setup
- Separate User ID and password for every user
- Custom module permissions for every account
- Shift 1, Shift 2 and Shift 3 analytics
- Shift 3 operational-date logic:
  - 19 July Shift 3 starts at 22:00
  - Activity after midnight and before 08:00 still counts under 19 July
- Tracker Shift column is the final source of truth
- Vehicle and Trip ID shown together
- FWD IB, FWD OB, RTO IB and RTO OB separate analysis
- 2-hour loading and unloading SLA
- Silent 10-second backend refresh
- No page reload, filter reset, typing interruption or scroll jump
- CSV export
- Excel-compatible multi-sheet `.xls` export
- Create Google Sheet export
- Shift handover report
- Alerts, data-quality checks and audit log
- Original tracker sheets remain read-only

## Important SLA assumption

The 2-hour loading/unloading SLA is calculated from **Dock In to Loading/Unloading completion**.
Dock Out pending is monitored separately using the Dock Release SLA.

## Step 1 — Apps Script

1. Open the current `RJK Control Tower API` Apps Script project.
2. Open `Code.gs`.
3. Select all old code and delete it.
4. Paste the full content of `apps-script/Code.gs`.
5. Save.
6. Project Settings → Time zone → `(GMT+05:30) India Standard Time`.
7. Deploy → Manage deployments → Edit/Pencil.
8. Choose `New version`.
9. Execute as: `Me`.
10. Who has access: `Anyone`.
11. Deploy.

The current `/exec` URL remains the same when the existing deployment is updated.

## Step 2 — GitHub

Upload/replace these files in the repository root:

- `.nojekyll`
- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `manifest.webmanifest`
- `service-worker.js`

Do not upload the `apps-script` folder to GitHub.

Commit message:

`Upgrade to secure shift-aware Control Tower V2`

## Step 3 — First website setup

Open:

`https://pardeep257.github.io/vehicle-tracker/?v=2`

The site will show **Create Master Admin**.

Default setup code:

`RJK-SETUP-257`

Create your own Master Admin User ID and password. The setup screen permanently closes after the first Master Admin is created.

For better security, change `MASTER_SETUP_CODE` in Code.gs before deployment.

## User access

Master Admin can assign these permissions separately:

- Control Tower
- Dock & Vehicles
- Trip Search
- Alerts
- Shift Analytics
- Reports
- Download / Export
- User Management
- Settings
- Audit Log

## Live refresh

- Active browser tab: every 10 seconds
- Hidden/background tab: every 60 seconds
- Data refresh is read-only
- The page does not reload
- Search text and analytics filters are not reset
- Search and analytics results are not replaced while the user is working
- A second refresh does not start while the previous request is still running

## Google Sheet export note

Because the Apps Script web app runs as the deployment owner, a generated Google Sheet is created in the Google Drive of the Apps Script deployment owner.
