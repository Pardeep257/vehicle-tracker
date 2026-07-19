const CONFIG = window.TRACKER_CONFIG || {};
const form = document.querySelector("#searchForm");
const input = document.querySelector("#searchInput");
const button = document.querySelector("#searchButton");
const messageBox = document.querySelector("#messageBox");
const summary = document.querySelector("#summary");
const activeSection = document.querySelector("#activeSection");
const historySection = document.querySelector("#historySection");
const activeResults = document.querySelector("#activeResults");
const historyResults = document.querySelector("#historyResults");
const activeCount = document.querySelector("#activeCount");
const historyCount = document.querySelector("#historyCount");
const activeHeading = document.querySelector("#activeHeading");
const connectionText = document.querySelector("#connectionText");
const demoNotice = document.querySelector("#demoNotice");
const cardTemplate = document.querySelector("#vehicleCardTemplate");

const DEMO_RECORDS = [
  {
    tracker: "FWD OB", movement: "OB", date: "18-Jul-2026", shift: "Night",
    vehicleType: "32 FT", regularAdhoc: "Regular", dockNo: "4",
    vehicle: "GJ03AB1234", tripId: "TRIP-1001", consignment: "CN-3001",
    route: "Ahmedabad", arrivalTime: "07:10 PM", dockIn: "07:25 PM",
    operationTime: "", dockOut: "", status: "Loading", currentPlace: "Dock 4",
    lastActivitySort: 1784392500000, isActive: true, isAtDock: true,
    totalBags: "220", totalShipments: "1540"
  },
  {
    tracker: "RTO IB", movement: "IB", date: "18-Jul-2026", shift: "Night",
    vehicleType: "17 FT", regularAdhoc: "", dockNo: "4",
    vehicle: "GJ05XY6789", tripId: "TRIP-1002", consignment: "CN-3002",
    route: "Surat", arrivalTime: "07:20 PM", dockIn: "07:35 PM",
    operationTime: "08:20 PM", dockOut: "", status: "Unloading Completed – Waiting for Dock Out",
    currentPlace: "Dock 4", lastActivitySort: 1784395800000, isActive: true, isAtDock: true,
    totalBags: "96", totalShipments: "630"
  },
  {
    tracker: "FWD OB", movement: "OB", date: "17-Jul-2026", shift: "Night",
    vehicleType: "32 FT", regularAdhoc: "Regular", dockNo: "4",
    vehicle: "GJ03AB1234", tripId: "TRIP-0990", consignment: "CN-2990",
    route: "Vadodara", arrivalTime: "08:00 PM", dockIn: "08:15 PM",
    operationTime: "10:10 PM", dockOut: "10:25 PM", status: "Departed",
    currentPlace: "In Transit", lastActivitySort: 1784302500000, isActive: false, isAtDock: false,
    totalBags: "180", totalShipments: "1280"
  }
];

function clean(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusClass(record) {
  const text = String(record.status || "").toLowerCase();
  if (text.includes("missing") || text.includes("conflict")) return "warning";
  if (text.includes("departed") || text.includes("completed / dock released")) return "departed";
  if (text.includes("waiting") || text.includes("not arrived")) return "waiting";
  return "active";
}

function addDetail(container, label, value) {
  const item = document.createElement("div");
  item.className = "detail-item";
  item.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(clean(value))}</strong>`;
  container.appendChild(item);
}

function buildCard(record) {
  const node = cardTemplate.content.cloneNode(true);
  node.querySelector(".tracker-label").textContent = record.tracker || "TRACKER";
  node.querySelector(".vehicle-number").textContent = clean(record.vehicle);

  const chip = node.querySelector(".status-chip");
  chip.textContent = clean(record.status);
  chip.classList.add(statusClass(record));

  const details = node.querySelector(".detail-grid");
  [
    ["Route", record.route],
    ["Dock No", record.dockNo],
    ["Current Place", record.currentPlace],
    ["Trip ID", record.tripId],
    ["Date", record.date],
    ["Shift", record.shift],
    [record.movement === "IB" ? "Vehicle Arrived" : "Gate In", record.arrivalTime],
    ["Dock In", record.dockIn],
    [record.movement === "IB" ? "Unload Time" : "Loading Time", record.operationTime],
    ["Dock Out", record.dockOut]
  ].forEach(([label, value]) => addDetail(details, label, value));

  const extras = node.querySelector(".extra-grid");
  [
    ["Vehicle Type", record.vehicleType],
    ["Regular / Adhoc", record.regularAdhoc],
    ["Consignment", record.consignment],
    ["Total Bags", record.totalBags],
    ["Total Shipments", record.totalShipments],
    ["DEO / Employee", record.employeeName],
    ["Driver", record.driverName],
    ["Driver Contact", record.driverContact]
  ].forEach(([label, value]) => addDetail(extras, label, value));

  return node;
}

function showMessage(text, isError = false) {
  messageBox.textContent = text;
  messageBox.classList.toggle("error", isError);
  messageBox.classList.remove("hidden");
}

function clearView() {
  messageBox.classList.add("hidden");
  summary.classList.add("hidden");
  activeSection.classList.add("hidden");
  historySection.classList.add("hidden");
  activeResults.innerHTML = "";
  historyResults.innerHTML = "";
}

function renderSummary(data) {
  const active = data.active || [];
  const history = data.history || [];
  const trackers = new Set([...active, ...history].map(row => row.tracker).filter(Boolean));
  summary.innerHTML = `
    <div class="summary-card"><span>Active vehicles</span><strong>${active.length}</strong></div>
    <div class="summary-card"><span>History entries</span><strong>${history.length}</strong></div>
    <div class="summary-card"><span>Trackers matched</span><strong>${trackers.size}</strong></div>
  `;
  summary.classList.remove("hidden");
}

function renderResults(data, query, type) {
  const active = (data.active || []).sort((a, b) => (b.lastActivitySort || 0) - (a.lastActivitySort || 0));
  const history = (data.history || []).sort((a, b) => (b.lastActivitySort || 0) - (a.lastActivitySort || 0));

  renderSummary({ active, history });

  activeHeading.textContent = type === "dock"
    ? `Active vehicles at Dock ${query}`
    : "Current vehicle position";

  activeCount.textContent = active.length;
  historyCount.textContent = history.length;

  if (active.length) {
    active.forEach(record => activeResults.appendChild(buildCard(record)));
    activeSection.classList.remove("hidden");
  }

  if (history.length) {
    history.slice(0, CONFIG.HISTORY_LIMIT || 20)
      .forEach(record => historyResults.appendChild(buildCard(record)));
    historySection.classList.remove("hidden");
  }

  if (!active.length && !history.length) {
    showMessage("No matching record found. Check the vehicle number or dock number.");
  } else if (!active.length) {
    showMessage("No active trip found. Latest completed trips are shown below.");
  }
}

function resolveType(query, selected) {
  if (selected !== "auto") return selected;
  return /^[a-zA-Z]*\s*\d{1,3}$/i.test(query.trim()) && !/[A-Z]{2,}/i.test(query)
    ? "dock"
    : "vehicle";
}

function demoSearch(query, type) {
  const q = query.trim().toUpperCase().replace(/^DOCK[\s-]*/i, "");
  const matched = DEMO_RECORDS.filter(row => {
    if (type === "dock") return String(row.dockNo).toUpperCase() === q;
    return String(row.vehicle).toUpperCase().includes(q);
  });
  return {
    ok: true,
    active: matched.filter(row => type === "dock" ? row.isAtDock : row.isActive),
    history: matched.filter(row => type === "dock" ? !row.isAtDock : !row.isActive)
  };
}

async function apiSearch(query, type) {
  const endpoint = String(CONFIG.API_URL || "").trim();
  if (!endpoint || endpoint.includes("PASTE_YOUR")) {
    throw new Error("Apps Script URL is not configured in config.js.");
  }
  const url = new URL(endpoint);
  url.searchParams.set("action", "search");
  url.searchParams.set("q", query);
  url.searchParams.set("type", type);
  url.searchParams.set("_", Date.now());

  const response = await fetch(url.toString(), { method: "GET", redirect: "follow" });
  if (!response.ok) throw new Error(`Server returned ${response.status}.`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "Search failed.");
  return data;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  clearView();

  const query = input.value.trim();
  if (!query) return;

  const selected = form.querySelector('input[name="searchType"]:checked').value;
  const type = resolveType(query, selected);

  button.disabled = true;
  button.textContent = "Searching…";
  connectionText.textContent = "Searching";

  try {
    const data = CONFIG.DEMO_MODE ? demoSearch(query, type) : await apiSearch(query, type);
    renderResults(data, query.replace(/^dock[\s-]*/i, ""), type);
    connectionText.textContent = CONFIG.DEMO_MODE ? "Demo data" : "Live data";
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Unable to load tracker data.", true);
    connectionText.textContent = "Connection error";
  } finally {
    button.disabled = false;
    button.textContent = "Search";
  }
});

if (CONFIG.DEMO_MODE) {
  demoNotice.textContent = "Demo mode is ON. Try Dock 4 or vehicle GJ03AB1234. After Apps Script deployment, paste the URL in config.js and set DEMO_MODE to false.";
  demoNotice.classList.remove("hidden");
  input.value = "4";
}
