const CONFIG = window.RJK_CONFIG || {};
const STATE = {
  token: localStorage.getItem("rjk_session_token") || "",
  user: null,
  permissions: [],
  settings: null,
  dashboard: null,
  search: null,
  analytics: null,
  users: [],
  audit: [],
  currentView: "control",
  syncInFlight: false,
  nextSyncAt: 0,
  syncTimer: null,
  countdownTimer: null
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanValue(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function numberValue(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN").format(numberValue(value));
}

function formatDuration(value) {
  if (value === null || value === undefined || value === "" || !Number.isFinite(Number(value))) return "—";
  const minutes = Math.max(0, Math.round(Number(value)));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function trackerClass(tracker) {
  return String(tracker || "").toLowerCase().replace(/\s+/g, "-");
}

function statusClass(status) {
  const text = String(status || "").toLowerCase();
  if (text.includes("stale") || text.includes("breach")) return "danger";
  if (text.includes("waiting") || text.includes("pending") || text.includes("not arrived")) return "waiting";
  if (text.includes("loading") || text.includes("unloading")) return "active";
  return "";
}

function hasPermission(permission) {
  return STATE.user?.master || STATE.permissions.includes(permission);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 3000);
}

function setFormMessage(id, message) {
  const element = $(id);
  element.textContent = message || "";
  element.classList.toggle("hidden", !message);
}

async function api(action, data = {}, authenticated = true) {
  if (!CONFIG.API_URL) throw new Error("API URL missing in config.js");

  const body = new URLSearchParams();
  body.set("action", action);

  if (authenticated) {
    if (!STATE.token) throw new Error("LOGIN_REQUIRED");
    body.set("token", STATE.token);
  }

  Object.entries(data).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    body.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  });

  const response = await fetch(CONFIG.API_URL, {
    method: "POST",
    body,
    redirect: "follow",
    cache: "no-store"
  });

  if (!response.ok) throw new Error(`Server returned ${response.status}`);

  const result = await response.json();

  if (!result.ok) {
    if (["LOGIN_REQUIRED", "SESSION_EXPIRED", "ACCESS_DISABLED"].includes(result.error)) {
      forceLogout(result.error === "ACCESS_DISABLED" ? "Your access has been disabled." : "Session expired. Please sign in again.");
    }
    throw new Error(result.error || "Request failed.");
  }

  return result;
}

/* =========================
   AUTH
========================= */

async function bootstrap() {
  try {
    const setup = await api("setupStatus", {}, false);
    $("#authLoading").classList.add("hidden");

    if (setup.needsSetup) {
      $("#setupForm").classList.remove("hidden");
      return;
    }

    if (STATE.token) {
      try {
        const me = await api("me");
        enterApp(me);
        return;
      } catch (error) {
        STATE.token = "";
        localStorage.removeItem("rjk_session_token");
      }
    }

    $("#loginForm").classList.remove("hidden");
  } catch (error) {
    $("#authLoading").innerHTML = `<div class="form-message">${escapeHtml(error.message)}</div>`;
  }
}

$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("#loginButton");
  button.disabled = true;
  setFormMessage("#loginMessage", "");

  try {
    const result = await api(
      "login",
      {
        userId: $("#loginUserId").value.trim(),
        password: $("#loginPassword").value
      },
      false
    );

    STATE.token = result.token;
    localStorage.setItem("rjk_session_token", STATE.token);
    enterApp(result);
    $("#loginForm").reset();
  } catch (error) {
    setFormMessage("#loginMessage", error.message);
  } finally {
    button.disabled = false;
  }
});

$("#setupForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("#setupButton");
  button.disabled = true;
  setFormMessage("#setupMessage", "");

  try {
    if ($("#setupPassword").value !== $("#setupConfirmPassword").value) {
      throw new Error("Passwords do not match.");
    }

    await api(
      "setupMaster",
      {
        setupCode: $("#setupCode").value,
        userId: $("#setupUserId").value.trim(),
        displayName: $("#setupDisplayName").value.trim(),
        password: $("#setupPassword").value
      },
      false
    );

    $("#setupForm").classList.add("hidden");
    $("#loginForm").classList.remove("hidden");
    $("#loginUserId").value = $("#setupUserId").value.trim();
    setFormMessage("#loginMessage", "Master Admin created. Sign in with your new password.");
  } catch (error) {
    setFormMessage("#setupMessage", error.message);
  } finally {
    button.disabled = false;
  }
});

function enterApp(result) {
  STATE.user = result.user;
  STATE.permissions = result.permissions || result.user?.permissions || [];
  STATE.settings = result.settings || {};
  $("#authScreen").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
  applyUserAccess();
  updateUserHeader();
  applySettingsToBrand();
  setView(firstAllowedView());
  startSilentSync(true);
}

async function forceLogout(message = "") {
  STATE.token = "";
  STATE.user = null;
  STATE.permissions = [];
  STATE.dashboard = null;
  clearTimeout(STATE.syncTimer);
  clearInterval(STATE.countdownTimer);
  localStorage.removeItem("rjk_session_token");
  $("#appShell").classList.add("hidden");
  $("#authScreen").classList.remove("hidden");
  $("#setupForm").classList.add("hidden");
  $("#authLoading").classList.add("hidden");
  $("#loginForm").classList.remove("hidden");
  if (message) setFormMessage("#loginMessage", message);
}

$("#logoutButton").addEventListener("click", async () => {
  try {
    await api("logout", {});
  } catch (ignored) {}
  forceLogout();
});

function applyUserAccess() {
  $$("[data-permission]").forEach(element => {
    const allowed = hasPermission(element.dataset.permission);
    element.classList.toggle("hidden", !allowed);
  });
}

function updateUserHeader() {
  $("#userDisplayName").textContent = STATE.user?.displayName || STATE.user?.id || "User";
  $("#userRole").textContent = STATE.user?.role || "User";
  $("#userInitial").textContent = String(STATE.user?.displayName || STATE.user?.id || "U").charAt(0).toUpperCase();
}

function firstAllowedView() {
  const preferred = ["control", "docks", "search", "analytics", "alerts", "reports", "users", "settings", "audit"];
  return preferred.find(view => {
    const button = $(`.nav-item[data-view="${view}"]`);
    return button && !button.classList.contains("hidden");
  }) || "control";
}

/* =========================
   NAVIGATION & THEME
========================= */

$$(".nav-item").forEach(button => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

function setView(view) {
  const nav = $(`.nav-item[data-view="${view}"]`);
  if (!nav || nav.classList.contains("hidden")) return;

  STATE.currentView = view;
  $$(".view").forEach(section => section.classList.toggle("active", section.id === `view-${view}`));
  $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  $("#pageTitle").textContent = {
    control: "Control Tower",
    docks: "Dock & Vehicles",
    search: "Trip Search",
    analytics: "Shift Analytics",
    alerts: "Alerts",
    reports: "Reports",
    users: "User Access",
    settings: "Settings",
    audit: "Audit Log"
  }[view] || "Control Tower";

  $("#sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (view === "users" && hasPermission("users")) loadUsers();
  if (view === "settings" && hasPermission("settings")) renderSettings();
  if (view === "audit" && hasPermission("audit")) loadAudit();

  if (view === "analytics" && hasPermission("analytics") && !STATE.analytics) {
    const operationalDate =
      STATE.dashboard?.currentContext?.primaryOperationalDate ||
      new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);

    $("#filterFrom").value = operationalDate;
    $("#filterTo").value = operationalDate;
    runAnalytics();
  }
}

$("#menuButton").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

$("#themeToggle").addEventListener("click", () => {
  const root = document.documentElement;
  const next = root.dataset.theme === "light" ? "dark" : "light";
  root.dataset.theme = next;
  localStorage.setItem("rjk_theme", next);
  renderCharts();
});

document.documentElement.dataset.theme = localStorage.getItem("rjk_theme") || "dark";

/* =========================
   SILENT 10-SECOND SYNC
========================= */

function startSilentSync(immediate = false) {
  clearTimeout(STATE.syncTimer);
  clearInterval(STATE.countdownTimer);

  if (immediate) syncDashboard(false);

  STATE.countdownTimer = setInterval(updateSyncCountdown, 1000);
  scheduleNextSync();
}

function scheduleNextSync() {
  clearTimeout(STATE.syncTimer);

  const activeSeconds = Number(STATE.settings?.refreshSeconds || CONFIG.FALLBACK_REFRESH_SECONDS || 10);
  const hiddenSeconds = Number(STATE.settings?.hiddenTabRefreshSeconds || 60);
  const seconds = document.hidden ? hiddenSeconds : activeSeconds;

  STATE.nextSyncAt = Date.now() + seconds * 1000;
  STATE.syncTimer = setTimeout(async () => {
    await syncDashboard(true);
    scheduleNextSync();
  }, seconds * 1000);
}

function updateSyncCountdown() {
  const remaining = Math.max(0, Math.ceil((STATE.nextSyncAt - Date.now()) / 1000));
  $("#nextSyncText").textContent = `${remaining}s`;
}

document.addEventListener("visibilitychange", () => {
  if (!STATE.user) return;
  if (!document.hidden) syncDashboard(true);
  scheduleNextSync();
});

$("#refreshButton").addEventListener("click", () => syncDashboard(false));

async function syncDashboard(silent = true) {
  if (STATE.syncInFlight || !STATE.user || !hasPermission("dashboard")) return;
  STATE.syncInFlight = true;

  if (!silent) {
    $("#liveState").textContent = "Refreshing";
    $("#refreshButton").disabled = true;
  }

  try {
    const snapshot = await api("dashboard");
    STATE.dashboard = snapshot;
    STATE.settings = snapshot.settings || STATE.settings;
    applySettingsToBrand();
    updateLiveStatus(true, snapshot.generatedAt);
    renderDashboardState();
  } catch (error) {
    updateLiveStatus(false, null, error.message);
    if (!silent) showToast(error.message);
  } finally {
    STATE.syncInFlight = false;
    $("#refreshButton").disabled = false;
  }
}

function updateLiveStatus(live, generatedAt, error = "") {
  $("#liveDot").classList.toggle("live", live);
  $("#liveState").textContent = live ? "Live" : "Showing last data";
  $("#lastSyncText").textContent = live
    ? `Synced ${new Date(generatedAt || Date.now()).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
    : error || "Sync temporarily unavailable";
}

function applySettingsToBrand() {
  const siteName = STATE.settings?.siteName || "RJK Logistics Control Tower";
  $("#brandName").textContent = siteName.replace("Logistics ", "");
}

function renderDashboardState() {
  if (!STATE.dashboard) return;

  renderGlobalCounts();

  /*
   * Silent refresh updates only live modules.
   * Search text, analytics filters, open groups and user forms remain untouched.
   */
  if (STATE.currentView === "control") renderControlTower();
  if (STATE.currentView === "docks") renderDockBoard();
  if (STATE.currentView === "alerts") renderAlerts();
  if (STATE.currentView === "reports") renderReports();
}

function renderGlobalCounts() {
  const data = STATE.dashboard;
  $("#navAlertCount").textContent = data.alerts?.length || 0;
  $("#contextDate").textContent = `Operational Date ${data.currentContext?.primaryOperationalDate || "—"}`;
  $("#contextShift").textContent = data.currentContext?.label || "Shift —";
}

/* =========================
   CONTROL TOWER
========================= */

function renderControlTower() {
  const data = STATE.dashboard;
  const k = data.kpis || {};
  const cards = [
    ["Active Trips", k.activeVehicles, `${k.atDock || 0} at dock`, "green"],
    ["Occupied Docks", k.occupiedDocks, `${k.multiVehicleDocks || 0} multi-vehicle`, ""],
    ["Waiting Yard", k.waitingYard, "Dock In pending", "yellow"],
    ["Loading / Unloading", k.inOperation, `${k.loading || 0} loading • ${k.unloading || 0} unloading`, "purple"],
    ["Dock Out Pending", k.operationCompletePending, "Operation complete", "yellow"],
    ["SLA Breached", k.slaBreached, "2-hour operation SLA", "red"],
    ["Critical Alerts", k.criticalAlerts, `${k.staleEntries || 0} stale entries`, "red"]
  ];

  $("#kpiGrid").innerHTML = cards
    .map(([label, value, note, color]) => `
      <article class="kpi-card ${color}">
        <span>${escapeHtml(label)}</span>
        <strong>${formatNumber(value)}</strong>
        <small>${escapeHtml(note)}</small>
      </article>
    `)
    .join("");

  const activeTrips = data.activeTrips || [];
  $("#activeTripCount").textContent = activeTrips.length;
  $("#activeTripGrid").innerHTML = activeTrips.length
    ? activeTrips.map(tripCard).join("")
    : `<div class="message">No active vehicle trip found.</div>`;

  const critical = (data.alerts || []).filter(alert => alert.priority === "critical").slice(0, 8);
  $("#criticalCount").textContent = critical.length;
  $("#priorityAlertList").innerHTML = critical.length
    ? critical.map(alertItem).join("")
    : `<div class="message">No critical alert right now.</div>`;

  $("#liveShiftMatrix").innerHTML = shiftMatrixHtml(data.shiftMatrix || []);
}

function tripCard(record) {
  const issues = record.dataIssues || [];

  return `
    <article class="trip-card ${trackerClass(record.tracker)}">
      <div class="trip-head">
        <div>
          <span class="tracker-label">${escapeHtml(record.tracker)}</span>
          <h3>${escapeHtml(cleanValue(record.vehicle))}</h3>
          <span class="trip-id">Trip: ${escapeHtml(cleanValue(record.tripId))}</span>
        </div>
        <span class="status-badge ${statusClass(record.status)}">${escapeHtml(record.status)}</span>
      </div>
      <div class="trip-details">
        ${detail("Operational Date", record.operationalDate)}
        ${detail("Shift", record.shift)}
        ${detail("Route", record.route)}
        ${detail("Dock", record.dockNo)}
        ${detail("Current Place", record.currentPlace)}
        ${detail("SLA", `${record.slaStatus || "—"} • ${formatDuration(record.operationMinutes)}`)}
        ${detail(record.movement === "IB" ? "Vehicle Arrived" : "Gate In", record.arrivalTime)}
        ${detail("Dock In", record.dockIn)}
        ${detail(record.movement === "IB" ? "Unload Time" : "Loading Time", record.operationTime)}
        ${detail("Dock Out", record.dockOut)}
      </div>
      ${issues.length ? `<div class="issue-strip">${escapeHtml(issues.join(" • "))}</div>` : ""}
    </article>
  `;
}

function detail(label, value) {
  return `<div class="detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(cleanValue(value))}</strong></div>`;
}

function alertItem(alert) {
  return `
    <article class="alert-item ${escapeHtml(alert.priority)}">
      <i></i>
      <div>
        <strong>${escapeHtml(alert.issue)}</strong>
        <p>${escapeHtml(cleanValue(alert.vehicle))} • Trip ${escapeHtml(cleanValue(alert.tripId))} • ${escapeHtml(cleanValue(alert.tracker))}</p>
      </div>
      <time>${formatDuration(alert.ageMinutes)}</time>
    </article>
  `;
}

function shiftMatrixHtml(matrix) {
  const trackers = ["FWD IB", "FWD OB", "RTO IB", "RTO OB"];
  const shifts = ["Shift 1", "Shift 2", "Shift 3"];

  return `
    <table class="shift-matrix">
      <thead><tr><th>Tracker</th>${shifts.map(shift => `<th>${shift}</th>`).join("")}</tr></thead>
      <tbody>
        ${trackers.map(tracker => `
          <tr>
            <th>${tracker}</th>
            ${shifts.map(shift => {
              const row = matrix.find(item => item.tracker === tracker && item.shift === shift) || {};
              return `
                <td>
                  <div class="matrix-title"><strong>${formatNumber(row.trips || 0)} trips</strong><span>${formatNumber(row.shipments || 0)} shipments</span></div>
                  <div class="matrix-metrics">
                    <div><span>Active</span><strong>${formatNumber(row.activeTrips || 0)}</strong></div>
                    <div><span>Completed</span><strong>${formatNumber(row.completedTrips || 0)}</strong></div>
                    <div><span>SLA Breach</span><strong>${formatNumber(row.breachedSla || 0)}</strong></div>
                    <div><span>Avg Operation</span><strong>${formatDuration(row.averageOperationMinutes)}</strong></div>
                    <div><span>Dock Out Pending</span><strong>${formatNumber(row.dockOutPending || 0)}</strong></div>
                    <div><span>Bags</span><strong>${formatNumber(row.bags || 0)}</strong></div>
                  </div>
                </td>
              `;
            }).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

/* =========================
   DOCK BOARD
========================= */

$("#dockTrackerFilter").addEventListener("change", renderDockBoard);

function renderDockBoard() {
  const filter = $("#dockTrackerFilter").value;
  const docks = (STATE.dashboard?.docks || [])
    .map(dock => ({
      ...dock,
      vehicles: (dock.vehicles || []).filter(vehicle => !filter || vehicle.tracker === filter)
    }))
    .filter(dock => dock.vehicles.length);

  $("#dockBoard").innerHTML = docks.length
    ? docks.map(dock => `
        <article class="dock-card">
          <div class="dock-card-head"><h3>Dock ${escapeHtml(dock.dockNo)}</h3><span>${dock.vehicles.length} active trip${dock.vehicles.length === 1 ? "" : "s"}</span></div>
          <div class="dock-vehicle-list">
            ${dock.vehicles.map(vehicle => `
              <div class="dock-vehicle">
                <div class="dock-vehicle-top">
                  <div><strong>${escapeHtml(cleanValue(vehicle.vehicle))}</strong><p>Trip ${escapeHtml(cleanValue(vehicle.tripId))} • ${escapeHtml(vehicle.tracker)}</p></div>
                  <span class="status-badge ${statusClass(vehicle.status)}">${escapeHtml(vehicle.status)}</span>
                </div>
                <div class="dock-meta">
                  <span>${escapeHtml(cleanValue(vehicle.shift))}</span>
                  <span>${escapeHtml(cleanValue(vehicle.operationalDate))}</span>
                  <span>Dock In ${escapeHtml(cleanValue(vehicle.dockIn))}</span>
                  <span>${escapeHtml(vehicle.slaStatus || "—")}</span>
                </div>
              </div>
            `).join("")}
          </div>
        </article>
      `).join("")
    : `<div class="message">No active dock matches this filter.</div>`;
}

/* =========================
   SEARCH
========================= */

$("#searchForm").addEventListener("submit", async event => {
  event.preventDefault();
  const query = $("#searchInput").value.trim();
  const type = document.querySelector('input[name="searchType"]:checked').value;
  const button = $("#searchButton");

  button.disabled = true;
  button.textContent = "Searching…";
  $("#searchMessage").classList.add("hidden");
  $("#activeSearchBlock").classList.add("hidden");
  $("#historySearchBlock").classList.add("hidden");

  try {
    const result = await api("search", { q: query, type });
    STATE.search = result;
    renderSearchResults();
  } catch (error) {
    $("#searchMessage").textContent = error.message;
    $("#searchMessage").classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.textContent = "Search";
  }
});

function renderSearchResults() {
  const result = STATE.search;
  const active = result.active || [];
  const history = result.history || [];

  $("#searchSummary").innerHTML = `
    <div><span>Active trips</span><strong>${active.length}</strong></div>
    <div><span>History trips</span><strong>${history.length}</strong></div>
    <div><span>Total matched</span><strong>${result.matched || 0}</strong></div>
  `;
  $("#searchSummary").classList.remove("hidden");
  $("#searchActions").classList.toggle("hidden", !(active.length || history.length));
  $("#activeSearchCount").textContent = active.length;
  $("#historySearchCount").textContent = history.length;
  $("#activeSearchTitle").textContent = result.type === "dock" ? `Active trips at Dock ${result.query}` : "Current trip position";
  $("#activeSearchGrid").innerHTML = active.map(tripCard).join("");
  $("#historySearchGrid").innerHTML = history.map(tripCard).join("");
  $("#activeSearchBlock").classList.toggle("hidden", !active.length);
  $("#historySearchBlock").classList.toggle("hidden", !history.length);

  if (!active.length && !history.length) {
    $("#searchMessage").textContent = "No matching trip found.";
    $("#searchMessage").classList.remove("hidden");
  } else if (!active.length) {
    $("#searchMessage").textContent = "No active trip. Previous trip history is shown below.";
    $("#searchMessage").classList.remove("hidden");
  } else {
    $("#searchMessage").classList.add("hidden");
  }
}

/* =========================
   ANALYTICS
========================= */

$("#analyticsForm").addEventListener("submit", async event => {
  event.preventDefault();
  await runAnalytics();
});

async function runAnalytics() {
  const button = $("#runAnalyticsButton");
  button.disabled = true;
  button.textContent = "Analysing…";

  try {
    const filters = collectAnalyticsFilters();
    const result = await api("analytics", { filters, limit: STATE.settings?.maxAnalyticsRows || 10000 });
    STATE.analytics = result;
    populateFilterOptions(result.filterOptions || {});
    renderAnalytics();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Run analysis";
  }
}

function collectAnalyticsFilters() {
  return {
    fromDate: $("#filterFrom").value,
    toDate: $("#filterTo").value,
    month: $("#filterMonth").value,
    shift: $("#filterShift").value,
    process: $("#filterProcess").value,
    movement: $("#filterMovement").value,
    tracker: $("#filterTracker").value,
    route: $("#filterRoute").value,
    dockNo: $("#filterDock").value,
    vehicle: $("#filterVehicle").value.trim(),
    tripId: $("#filterTrip").value.trim(),
    slaStatus: $("#filterSla").value,
    status: $("#filterStatus").value,
    groupBy: $("#filterGroup").value
  };
}

$$("[data-range]").forEach(button => {
  button.addEventListener("click", () => {
    const range = button.dataset.range;
    const today = new Date();
    const format = date => {
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      return local.toISOString().slice(0, 10);
    };

    $("#filterMonth").value = "";

    if (range === "today") {
      $("#filterFrom").value = format(today);
      $("#filterTo").value = format(today);
    } else if (range === "yesterday") {
      const date = new Date(today);
      date.setDate(date.getDate() - 1);
      $("#filterFrom").value = format(date);
      $("#filterTo").value = format(date);
    } else if (range === "7days") {
      const date = new Date(today);
      date.setDate(date.getDate() - 6);
      $("#filterFrom").value = format(date);
      $("#filterTo").value = format(today);
    } else if (range === "month") {
      $("#filterFrom").value = "";
      $("#filterTo").value = "";
      $("#filterMonth").value = format(today).slice(0, 7);
    } else {
      $("#analyticsForm").reset();
    }
  });
});

function populateFilterOptions(options) {
  fillSelect("#filterRoute", "All routes", options.routes || [], $("#filterRoute").value);
  fillSelect("#filterDock", "All docks", options.docks || [], $("#filterDock").value);
  fillSelect("#filterStatus", "All status", options.statuses || [], $("#filterStatus").value);
}

function fillSelect(selector, firstLabel, values, selected) {
  const select = $(selector);
  select.innerHTML = `<option value="">${escapeHtml(firstLabel)}</option>${values.map(value => `<option${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}`;
}

function renderAnalytics() {
  const data = STATE.analytics;
  const summary = data.summary || {};

  $("#analyticsActions").classList.remove("hidden");
  $("#analyticsRecordNote").textContent = `${formatNumber(data.totalRecords)} records${data.truncated ? " • table/export limited by maximum rows" : ""}`;

  const metrics = [
    ["Trips", summary.trips],
    ["Active", summary.activeTrips],
    ["Completed", summary.completedTrips],
    ["Bags", summary.bags],
    ["Shipments", summary.shipments],
    ["Within SLA", summary.withinSla],
    ["SLA Breached", summary.breachedSla],
    ["Avg Operation", formatDuration(summary.averageOperationMinutes)],
    ["Avg TAT", formatDuration(summary.averageTatMinutes)]
  ];

  $("#analyticsKpis").innerHTML = metrics.map(([label, value]) => `
    <article class="analytics-kpi"><span>${escapeHtml(label)}</span><strong>${typeof value === "number" ? formatNumber(value) : escapeHtml(cleanValue(value))}</strong></article>
  `).join("");

  $("#analyticsShiftMatrix").innerHTML = shiftMatrixHtml(data.shiftMatrix || []);
  renderRouteAnalysis();
  renderAnalyticsTable();
  renderCharts();
}

function renderRouteAnalysis() {
  const routes = STATE.analytics?.routeAnalysis || [];
  const max = Math.max(1, ...routes.map(route => numberValue(route.shipments)));

  $("#routeAnalysis").innerHTML = routes.length
    ? routes.map(route => `
        <div class="metric">
          <strong>${escapeHtml(route.name)}</strong>
          <span>${formatNumber(route.shipments)} shipments • ${formatNumber(route.trips)} trips</span>
          <div class="bar"><i style="width:${Math.max(4, numberValue(route.shipments) / max * 100)}%"></i></div>
        </div>
      `).join("")
    : `<div class="message">No route data for selected filters.</div>`;
}

function renderAnalyticsTable() {
  const records = STATE.analytics?.records || [];
  const groupBy = STATE.analytics?.filters?.groupBy || "tracker";
  const groups = {};

  records.forEach(record => {
    const value = cleanValue(record[groupBy]);
    (groups[value] ||= []).push(record);
  });

  $("#analyticsTable").innerHTML = Object.keys(groups).length
    ? Object.keys(groups).sort().map((group, index) => `
        <section class="group-block">
          <div class="group-head" data-group-index="${index}">
            <strong>${escapeHtml(group)}</strong>
            <span>${formatNumber(groups[group].length)} trips • ${formatNumber(groups[group].reduce((sum, record) => sum + numberValue(record.totalShipments), 0))} shipments</span>
          </div>
          <div class="group-table-wrap">
            <table class="group-table">
              <thead><tr><th>Operational Date</th><th>Shift</th><th>Tracker</th><th>Vehicle</th><th>Trip ID</th><th>Route</th><th>Dock</th><th>Status</th><th>SLA</th><th>Operation</th><th>Bags</th><th>Shipments</th></tr></thead>
              <tbody>
                ${groups[group].map(record => `
                  <tr class="${trackerClass(record.tracker)}">
                    <td>${escapeHtml(cleanValue(record.operationalDate))}</td>
                    <td>${escapeHtml(cleanValue(record.shift))}</td>
                    <td>${escapeHtml(cleanValue(record.tracker))}</td>
                    <td>${escapeHtml(cleanValue(record.vehicle))}</td>
                    <td>${escapeHtml(cleanValue(record.tripId))}</td>
                    <td>${escapeHtml(cleanValue(record.route))}</td>
                    <td>${escapeHtml(cleanValue(record.dockNo))}</td>
                    <td>${escapeHtml(cleanValue(record.status))}</td>
                    <td>${escapeHtml(cleanValue(record.slaStatus))}</td>
                    <td>${escapeHtml(formatDuration(record.operationMinutes))}</td>
                    <td>${escapeHtml(cleanValue(record.totalBags))}</td>
                    <td>${escapeHtml(cleanValue(record.totalShipments))}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </section>
      `).join("")
    : `<div class="message">No record matches the selected filters.</div>`;

  $$(".group-head").forEach(head => {
    head.addEventListener("click", () => {
      const table = head.nextElementSibling;
      table.classList.toggle("hidden");
    });
  });
}

/* =========================
   ALERTS & REPORTS
========================= */

$("#alertFilter").addEventListener("change", renderAlerts);

function renderAlerts() {
  const all = STATE.dashboard?.alerts || [];
  const selected = $("#alertFilter").value;
  const alerts = all.filter(alert => !selected || alert.priority === selected);
  const counts = STATE.dashboard?.alertCounts || {};

  $("#alertSummary").innerHTML = [
    ["Total", all.length],
    ["Critical", counts.critical || 0],
    ["Warning", counts.warning || 0],
    ["Data Quality", counts.data || 0]
  ].map(([label, value]) => `<article class="alert-summary-card"><span>${label}</span><strong>${formatNumber(value)}</strong></article>`).join("");

  $("#alertTableBody").innerHTML = alerts.length
    ? alerts.map(alert => `
        <tr>
          <td><span class="priority ${escapeHtml(alert.priority)}">${escapeHtml(alert.priority)}</span></td>
          <td>${escapeHtml(cleanValue(alert.operationalDate))}</td>
          <td>${escapeHtml(cleanValue(alert.shift))}</td>
          <td>${escapeHtml(cleanValue(alert.tracker))}</td>
          <td><strong>${escapeHtml(cleanValue(alert.vehicle))}</strong><br><small>${escapeHtml(cleanValue(alert.tripId))}</small></td>
          <td>${escapeHtml(cleanValue(alert.dockNo))}</td>
          <td>${escapeHtml(alert.issue)}</td>
          <td>${escapeHtml(formatDuration(alert.ageMinutes))}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="8">No alerts in this category.</td></tr>`;
}

function renderReports() {
  $("#reportText").textContent = STATE.dashboard?.reportText || "Report unavailable.";
}

$("#copyHandover").addEventListener("click", copyReport);
$("#copyReport").addEventListener("click", copyReport);

async function copyReport() {
  try {
    await navigator.clipboard.writeText(STATE.dashboard?.reportText || "");
    showToast("Shift handover copied.");
  } catch {
    showToast("Copy failed.");
  }
}

$("#downloadReport").addEventListener("click", () => {
  downloadBlob(
    `RJK-Shift-Handover-${new Date().toISOString().slice(0, 10)}.txt`,
    STATE.dashboard?.reportText || "",
    "text/plain;charset=utf-8"
  );
});

/* =========================
   USER MANAGEMENT
========================= */

const PERMISSION_LABELS = {
  dashboard: "Control Tower",
  docks: "Dock & Vehicles",
  search: "Trip Search",
  alerts: "Alerts",
  analytics: "Shift Analytics",
  reports: "Reports",
  export: "Download / Export",
  users: "User Management",
  settings: "Settings",
  audit: "Audit Log"
};

async function loadUsers() {
  try {
    const result = await api("listUsers");
    STATE.users = result.users || [];
    renderPermissionGrid(result.permissions || Object.keys(PERMISSION_LABELS));
    renderUsers();
  } catch (error) {
    showToast(error.message);
  }
}

function renderPermissionGrid(permissions) {
  $("#permissionGrid").innerHTML = permissions.map(permission => `
    <label><input type="checkbox" value="${escapeHtml(permission)}"><span>${escapeHtml(PERMISSION_LABELS[permission] || permission)}</span></label>
  `).join("");
}

function renderUsers() {
  $("#userList").innerHTML = STATE.users.length
    ? STATE.users.map(user => `
        <div class="user-card" data-user="${escapeHtml(user.id)}">
          <div><strong>${escapeHtml(user.displayName)}${user.master ? " • Master" : ""}</strong><small>${escapeHtml(user.id)} • ${escapeHtml(user.role)} • Last login ${escapeHtml(user.lastLogin ? new Date(user.lastLogin).toLocaleString("en-IN") : "Never")}</small></div>
          <span class="user-state ${user.active ? "" : "off"}">${user.active ? "Active" : "Inactive"}</span>
        </div>
      `).join("")
    : `<div class="message">No user found.</div>`;

  $$(".user-card").forEach(card => {
    card.addEventListener("click", () => editUser(card.dataset.user));
  });
}

function editUser(userId) {
  const user = STATE.users.find(item => item.id === userId);
  if (!user) return;

  $("#userEditorTitle").textContent = `Edit ${user.displayName}`;
  $("#editingUserId").value = user.id;
  $("#userIdInput").value = user.id;
  $("#userIdInput").disabled = true;
  $("#userNameInput").value = user.displayName;
  $("#userRoleInput").value = user.master ? "Admin" : user.role;
  $("#userRoleInput").disabled = Boolean(user.master);
  $("#userPasswordInput").value = "";
  $("#userPasswordInput").placeholder = "Leave blank to keep password";
  $("#userActiveInput").checked = user.active;
  $("#userActiveInput").disabled = Boolean(user.master);

  $$("#permissionGrid input").forEach(input => {
    input.checked = user.master || (user.permissions || []).includes(input.value);
    input.disabled = Boolean(user.master);
  });
}

$("#newUserButton").addEventListener("click", clearUserForm);
$("#resetUserForm").addEventListener("click", clearUserForm);

function clearUserForm() {
  $("#userEditorTitle").textContent = "Create user";
  $("#userForm").reset();
  $("#editingUserId").value = "";
  $("#userIdInput").disabled = false;
  $("#userRoleInput").disabled = false;
  $("#userActiveInput").disabled = false;
  $("#userActiveInput").checked = true;
  $("#userPasswordInput").placeholder = "Required for new user";
  $$("#permissionGrid input").forEach(input => {
    input.checked = false;
    input.disabled = false;
  });
}

$("#userRoleInput").addEventListener("change", () => {
  const presets = {
    Viewer: ["dashboard", "search"],
    Supervisor: ["dashboard", "docks", "search", "alerts", "analytics", "reports", "export"],
    Admin: ["dashboard", "docks", "search", "alerts", "analytics", "reports", "export", "users", "settings", "audit"]
  };
  const selected = presets[$("#userRoleInput").value] || [];
  $$("#permissionGrid input").forEach(input => input.checked = selected.includes(input.value));
});

$("#userForm").addEventListener("submit", async event => {
  event.preventDefault();

  const permissions = $$("#permissionGrid input:checked").map(input => input.value);

  try {
    await api("saveUser", {
      userId: $("#editingUserId").value || $("#userIdInput").value.trim(),
      displayName: $("#userNameInput").value.trim(),
      role: $("#userRoleInput").value,
      password: $("#userPasswordInput").value,
      active: $("#userActiveInput").checked,
      permissions
    });

    showToast("User saved.");
    clearUserForm();
    await loadUsers();
  } catch (error) {
    showToast(error.message);
  }
});

/* =========================
   SETTINGS & AUDIT
========================= */

function renderSettings() {
  const s = STATE.settings || {};
  $("#settingSiteName").value = s.siteName || "";
  $("#settingLoadingSla").value = s.loadingSlaMin || 120;
  $("#settingUnloadingSla").value = s.unloadingSlaMin || 120;
  $("#settingYardSla").value = s.yardWaitingSlaMin || 60;
  $("#settingDockRelease").value = s.dockReleaseSlaMin || 30;
  $("#settingStaleHours").value = s.activeWindowHours || 48;
  $("#settingRefresh").value = s.refreshSeconds || 10;
  $("#settingHiddenRefresh").value = s.hiddenTabRefreshSeconds || 60;
  $("#settingSessionHours").value = s.sessionHours || 12;
  $("#settingMaxRows").value = s.maxAnalyticsRows || 10000;
}

$("#settingsForm").addEventListener("submit", async event => {
  event.preventDefault();

  try {
    const result = await api("saveSettings", {
      siteName: $("#settingSiteName").value.trim(),
      loadingSlaMin: $("#settingLoadingSla").value,
      unloadingSlaMin: $("#settingUnloadingSla").value,
      yardWaitingSlaMin: $("#settingYardSla").value,
      dockReleaseSlaMin: $("#settingDockRelease").value,
      activeWindowHours: $("#settingStaleHours").value,
      refreshSeconds: $("#settingRefresh").value,
      hiddenTabRefreshSeconds: $("#settingHiddenRefresh").value,
      sessionHours: $("#settingSessionHours").value,
      maxAnalyticsRows: $("#settingMaxRows").value
    });

    STATE.settings = result.settings;
    applySettingsToBrand();
    startSilentSync(false);
    showToast("Settings saved.");
  } catch (error) {
    showToast(error.message);
  }
});

$("#refreshAudit").addEventListener("click", loadAudit);

async function loadAudit() {
  try {
    const result = await api("audit");
    STATE.audit = result.logs || [];
    $("#auditTableBody").innerHTML = STATE.audit.length
      ? STATE.audit.map(log => `
          <tr><td>${escapeHtml(new Date(log.time).toLocaleString("en-IN"))}</td><td>${escapeHtml(log.userId)}</td><td>${escapeHtml(log.action)}</td><td>${escapeHtml(log.details || "—")}</td></tr>
        `).join("")
      : `<tr><td colspan="4">No audit record.</td></tr>`;
  } catch (error) {
    showToast(error.message);
  }
}

/* =========================
   EXPORTS
========================= */

const EXPORT_HEADERS = [
  ["operationalDate", "Operational Date"],
  ["actualLastActivity", "Actual Last Activity"],
  ["shift", "Shift"],
  ["tracker", "Tracker"],
  ["process", "Process"],
  ["movement", "Movement"],
  ["vehicle", "Vehicle"],
  ["tripId", "Trip ID"],
  ["route", "Route"],
  ["dockNo", "Dock"],
  ["vehicleType", "Vehicle Type"],
  ["regularAdhoc", "Regular / Adhoc"],
  ["arrivalTime", "Arrival / Gate In"],
  ["dockIn", "Dock In"],
  ["operationTime", "Loading / Unloading Time"],
  ["dockOut", "Dock Out"],
  ["status", "Status"],
  ["currentPlace", "Current Place"],
  ["slaStatus", "SLA Status"],
  ["slaLimitMinutes", "SLA Limit Minutes"],
  ["operationMinutes", "Operation Minutes"],
  ["yardWaitingMinutes", "Yard Waiting Minutes"],
  ["tatMinutes", "TAT Minutes"],
  ["totalBags", "Total Bags"],
  ["totalShipments", "Total Shipments"],
  ["shortCount", "Short"],
  ["excessCount", "Excess"],
  ["consignment", "Consignment"],
  ["employeeName", "Employee"],
  ["employeeId", "Employee ID"],
  ["driverName", "Driver"],
  ["driverContact", "Driver Contact"],
  ["dataIssues", "Data Issues"]
];

function recordsForActive() {
  return STATE.dashboard?.activeTrips || [];
}

function recordsForDocks() {
  return (STATE.dashboard?.docks || []).flatMap(dock => dock.vehicles || []);
}

function recordsForSearch() {
  return [...(STATE.search?.active || []), ...(STATE.search?.history || [])];
}

function recordsForAnalytics() {
  return STATE.analytics?.records || [];
}

$("#downloadActiveCsv").addEventListener("click", () => downloadCsv("RJK-Active-Trips.csv", recordsForActive()));
$("#downloadActiveExcel").addEventListener("click", () => downloadExcel("RJK-Active-Trips.xls", recordsForActive(), "Active Trips"));
$("#downloadDockCsv").addEventListener("click", () => downloadCsv("RJK-Dock-Vehicles.csv", recordsForDocks()));
$("#downloadSearchCsv").addEventListener("click", () => downloadCsv("RJK-Search-Result.csv", recordsForSearch()));
$("#downloadSearchExcel").addEventListener("click", () => downloadExcel("RJK-Search-Result.xls", recordsForSearch(), "Search Result"));
$("#downloadAnalyticsCsv").addEventListener("click", () => downloadCsv("RJK-Filtered-Analysis.csv", recordsForAnalytics()));
$("#downloadAnalyticsExcel").addEventListener("click", () => downloadAnalyticsWorkbook());

$("#createGoogleSheetButton").addEventListener("click", async () => {
  if (!STATE.analytics) return;

  const button = $("#createGoogleSheetButton");
  button.disabled = true;
  button.textContent = "Creating…";

  try {
    const result = await api("createGoogleSheet", { filters: STATE.analytics.filters });
    showToast(`Google Sheet created: ${result.rows} rows`);
    window.open(result.url, "_blank", "noopener");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Create Google Sheet";
  }
});

function downloadCsv(filename, records) {
  if (!records.length) {
    showToast("No record available for download.");
    return;
  }

  const rows = [
    EXPORT_HEADERS.map(([, label]) => label),
    ...records.map(record =>
      EXPORT_HEADERS.map(([key]) =>
        key === "dataIssues" ? (record[key] || []).join(" | ") : record[key] ?? ""
      )
    )
  ];

  const csv = "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  downloadBlob(filename, csv, "text/csv;charset=utf-8");
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

/*
 * Excel-compatible SpreadsheetML 2003.
 * Opens directly in Microsoft Excel and supports multiple worksheets.
 */
function downloadExcel(filename, records, sheetName = "Trips") {
  if (!records.length) {
    showToast("No record available for download.");
    return;
  }

  const workbook = spreadsheetXml([
    { name: sheetName, rows: records }
  ]);

  downloadBlob(filename, workbook, "application/vnd.ms-excel");
}

function downloadAnalyticsWorkbook() {
  const records = recordsForAnalytics();

  if (!records.length) {
    showToast("Run analysis before downloading.");
    return;
  }

  const sheets = [
    { name: "All Filtered Trips", rows: records },
    { name: "FWD IB", rows: records.filter(record => record.tracker === "FWD IB") },
    { name: "FWD OB", rows: records.filter(record => record.tracker === "FWD OB") },
    { name: "RTO IB", rows: records.filter(record => record.tracker === "RTO IB") },
    { name: "RTO OB", rows: records.filter(record => record.tracker === "RTO OB") }
  ];

  downloadBlob(
    `RJK-Shift-Analysis-${new Date().toISOString().slice(0, 10)}.xls`,
    spreadsheetXml(sheets),
    "application/vnd.ms-excel"
  );
}

function spreadsheetXml(sheets) {
  const xmlEscape = value =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const worksheetXml = sheets.map(sheet => {
    const headerRow = `<Row>${EXPORT_HEADERS.map(([, label]) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${xmlEscape(label)}</Data></Cell>`).join("")}</Row>`;
    const rows = sheet.rows.map(record => `<Row>${EXPORT_HEADERS.map(([key]) => {
      const raw = key === "dataIssues" ? (record[key] || []).join(" | ") : record[key] ?? "";
      const numeric = ["slaLimitMinutes", "operationMinutes", "yardWaitingMinutes", "tatMinutes", "totalBags", "totalShipments", "shortCount", "excessCount"].includes(key) && raw !== "" && Number.isFinite(Number(raw));
      return `<Cell><Data ss:Type="${numeric ? "Number" : "String"}">${xmlEscape(raw)}</Data></Cell>`;
    }).join("")}</Row>`).join("");

    return `<Worksheet ss:Name="${xmlEscape(sheet.name.slice(0, 31))}"><Table>${headerRow}${rows}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions></Worksheet>`;
  }).join("");

  return `<?xml version="1.0"?>
  <?mso-application progid="Excel.Sheet"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
   xmlns:o="urn:schemas-microsoft-com:office:office"
   xmlns:x="urn:schemas-microsoft-com:office:excel"
   xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
   <Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#D9EAF7" ss:Pattern="Solid"/></Style></Styles>
   ${worksheetXml}
  </Workbook>`;
}

function downloadBlob(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* =========================
   CHART
========================= */

function renderCharts() {
  if (!STATE.analytics) return;
  requestAnimationFrame(() => drawTrendChart($("#dailyTrendChart"), STATE.analytics.dailyTrend || []));
}

function chartColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    primary: styles.getPropertyValue("--primary").trim() || "#5ee7f2",
    purple: styles.getPropertyValue("--purple").trim() || "#a891ff",
    muted: styles.getPropertyValue("--muted").trim() || "#91a4bb",
    line: styles.getPropertyValue("--line").trim() || "rgba(148,163,184,.16)"
  };
}

function drawTrendChart(canvas, data) {
  if (!canvas || !data.length) return;

  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 700;
  const height = Number(canvas.getAttribute("height")) || 280;
  canvas.width = width * ratio;
  canvas.height = height * ratio;

  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const colors = chartColors();
  const padding = { left: 40, right: 18, top: 18, bottom: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxTrips = Math.max(1, ...data.map(item => numberValue(item.trips)));
  const maxShipments = Math.max(1, ...data.map(item => numberValue(item.shipments)));
  const x = index => padding.left + (data.length === 1 ? chartWidth / 2 : chartWidth / (data.length - 1) * index);
  const yTrips = value => padding.top + chartHeight - numberValue(value) / maxTrips * chartHeight;
  const yShipments = value => padding.top + chartHeight - numberValue(value) / maxShipments * chartHeight;

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1;

  for (let index = 0; index <= 4; index++) {
    const y = padding.top + chartHeight / 4 * index;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  function drawLine(getY, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();

    data.forEach((item, index) => {
      const px = x(index);
      const py = getY(item);
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });

    ctx.stroke();
    ctx.fillStyle = color;

    data.forEach((item, index) => {
      ctx.beginPath();
      ctx.arc(x(index), getY(item), 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawLine(item => yTrips(item.trips), colors.primary);
  drawLine(item => yShipments(item.shipments), colors.purple);

  ctx.fillStyle = colors.muted;
  ctx.font = "10px system-ui";
  ctx.textAlign = "center";
  data.forEach((item, index) => ctx.fillText(String(item.date || "").slice(5), x(index), height - 14));
}

window.addEventListener("resize", () => {
  clearTimeout(window.__chartResize);
  window.__chartResize = setTimeout(renderCharts, 160);
});

/* =========================
   SERVICE WORKER
========================= */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        if (!registration.active?.scriptURL.includes("service-worker.js")) {
          await registration.unregister();
        }
      }
      await navigator.serviceWorker.register("service-worker.js?v=2.0.0");
    } catch (ignored) {}
  });
}

bootstrap();
