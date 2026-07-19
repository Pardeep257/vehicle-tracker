# RJK Logistics Control Tower

Premium logistics control-tower web application connected to the existing Google Sheet trackers.

## Modules
- Live Control Tower KPIs
- Multi-vehicle Dock Board
- Vehicle and Dock Search
- Automated SLA and Data Quality Alerts
- Shift, Route and 7-Day Analytics
- WhatsApp-ready Live Report
- 48-hour stale-entry protection
- Installable PWA and Dark/Light theme

## Apps Script update
1. Open the existing standalone `Vehicle Tracker API` Apps Script.
2. Delete the full old `Code.gs`.
3. Paste `apps-script/Code.gs`.
4. Save.
5. Deploy → Manage deployments → Edit/Pencil.
6. Select **New version**.
7. Deploy.

The `/exec` URL stays the same.

## GitHub update
Upload/replace these files in the root of the existing repository:
- index.html
- styles.css
- app.js
- config.js
- manifest.webmanifest
- service-worker.js
- .nojekyll

Commit the changes. GitHub Pages will rebuild automatically.

## Automation thresholds
Edit at the top of `Code.gs`:
- `ACTIVE_WINDOW_HOURS = 48`
- `YARD_WAITING_SLA_MIN = 60`
- `OPERATION_SLA_MIN = 180`
- `DOCK_RELEASE_SLA_MIN = 30`
