# Hub Vehicle Tracker — Standalone Setup

Use this version when another person owns the original tracker spreadsheet.

The Apps Script project is created separately in your own Google account, so you own and deploy it. It reads the original spreadsheet by Spreadsheet ID, as long as your account has access to that spreadsheet.

## Setup

1. Open the original tracker URL.
2. Copy the Spreadsheet ID between `/d/` and `/edit`.
3. Create a new standalone Google Apps Script project in your own account.
4. Paste all code from `apps-script/Code.gs`.
5. Replace:

```javascript
const SOURCE_SPREADSHEET_ID = "PASTE_ORIGINAL_SPREADSHEET_ID_HERE";
```

with the original Spreadsheet ID.

6. Confirm these tab names, or edit `TRACKERS` in the code:

```text
RTO IB
RTO OB
FWD IB
FWD OB
```

7. Set Apps Script time zone to `Asia/Kolkata`.
8. Save.
9. Select `readAllTrackers_` in the function dropdown and click Run once to authorize spreadsheet access.
10. Deploy as a Web app:
   - Execute as: Me
   - Choose the access level required for your GitHub frontend
11. Copy the `/exec` URL.
12. Paste it in `config.js` and change `DEMO_MODE` to `false`.
13. Upload the frontend files to GitHub and enable GitHub Pages.

This setup stops working if your access to the original tracker is removed, the source is deleted, or your Workspace administrator blocks Apps Script deployment.
