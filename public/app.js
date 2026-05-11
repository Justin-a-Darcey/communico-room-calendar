// ── Constants ────────────────────────────────────────────────────────────────

const OPEN_HOUR  = 9;   // 9:00 AM
const CLOSE_HOUR = 21;  // 9:00 PM
const TOTAL_MINS = (CLOSE_HOUR - OPEN_HOUR) * 60; // 720 minutes

const BOOKING_COLORS = {
  staff:  "#60a5fa", // blue-400  — internal/staff reservations
  patron: "#f87171", // red-400   — patron/public reservations
};

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const DAY_ABBRS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  branches:     [],
  bookings:     [],
  locationId:   null,
  roomId:       null,
  allRoomsMode: false,
  year:         new Date().getFullYear(),
  month:        new Date().getMonth() + 1, // 1-based
  loading:      false,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const branchSelect   = $("branch-select");
const roomSelect     = $("room-select");
const allRoomsBtn    = $("all-rooms-btn");
const monthSelect    = $("month-select");
const yearSelect     = $("year-select");
const prevMonthBtn   = $("prev-month-btn");
const nextMonthBtn   = $("next-month-btn");
const todayBtn       = $("today-btn");
const findSlotBtn    = $("find-slot-btn");
const calendarOuter  = $("calendar-outer");
const calendarInner  = $("calendar-inner");
const emptyState     = $("empty-state");
const emptyStateMsg  = $("empty-state-msg");
const loadingState   = $("loading-state");
const errorState     = $("error-state");
const errorMsg       = $("error-msg");
const retryBtn       = $("retry-btn");
const statsBar       = $("stats-bar");
const tooltip        = $("tooltip");
const modalOverlay   = $("modal-overlay");
const modalClose     = $("modal-close");
const modalDate      = $("modal-date");
const modalRoomName  = $("modal-room-name");
const modalRoomSel   = $("modal-room-select");
const modalSearchBtn = $("modal-search-btn");
const modalResults   = $("modal-results");
const modalResLabel  = $("modal-results-label");
const modalResList   = $("modal-results-list");
const lastUpdated    = $("last-updated");

// ── Initialization ────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  populateYearSelect();
  restoreFromUrl();
  syncMonthYearSelects();
  setupEventListeners();
  await loadBranches();
});

function populateYearSelect() {
  const current = new Date().getFullYear();
  for (let y = current - 1; y <= current + 2; y++) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  }
}

function restoreFromUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get("locationId")) state.locationId = parseInt(p.get("locationId"));
  if (p.get("roomId"))     state.roomId     = parseInt(p.get("roomId"));
  if (p.get("allRooms"))   state.allRoomsMode = p.get("allRooms") === "1";
  if (p.get("year"))       state.year  = parseInt(p.get("year"));
  if (p.get("month"))      state.month = parseInt(p.get("month"));
}

function syncMonthYearSelects() {
  monthSelect.value = state.month;
  yearSelect.value  = state.year;
}

function pushUrl() {
  const p = new URLSearchParams();
  if (state.locationId) p.set("locationId", state.locationId);
  if (state.roomId && !state.allRoomsMode) p.set("roomId", state.roomId);
  if (state.allRoomsMode) p.set("allRooms", "1");
  p.set("year",  state.year);
  p.set("month", state.month);
  history.replaceState(null, "", "?" + p.toString());
}

// ── Event listeners ───────────────────────────────────────────────────────────

function setupEventListeners() {
  branchSelect.addEventListener("change", onBranchChange);
  roomSelect.addEventListener("change", onRoomChange);
  allRoomsBtn.addEventListener("click", onAllRoomsToggle);
  monthSelect.addEventListener("change", () => {
    state.month = parseInt(monthSelect.value);
    onDateChange();
  });
  yearSelect.addEventListener("change", () => {
    state.year = parseInt(yearSelect.value);
    onDateChange();
  });
  prevMonthBtn.addEventListener("click", () => {
    if (state.month === 1) { state.month = 12; state.year--; }
    else state.month--;
    syncMonthYearSelects();
    onDateChange();
  });
  nextMonthBtn.addEventListener("click", () => {
    if (state.month === 12) { state.month = 1; state.year++; }
    else state.month++;
    syncMonthYearSelects();
    onDateChange();
  });
  todayBtn.addEventListener("click", onTodayClick);
  findSlotBtn.addEventListener("click", openFindSlotModal);
  retryBtn.addEventListener("click", () => loadBookings());

  document.addEventListener("mousemove", (e) => {
    if (!tooltip.classList.contains("hidden")) positionTooltip(e.clientX, e.clientY);
  });

  modalClose.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  modalSearchBtn.addEventListener("click", runFindSlot);

  document.querySelectorAll(".dur-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".dur-btn").forEach((b) => {
        b.classList.remove("bg-teal-700", "text-white", "border-teal-700");
        b.classList.add("border-slate-300", "text-slate-600", "hover:bg-slate-50");
      });
      btn.classList.add("bg-teal-700", "text-white", "border-teal-700");
      btn.classList.remove("border-slate-300", "text-slate-600", "hover:bg-slate-50");
    });
  });
  document.querySelector('.dur-btn[data-mins="60"]')?.click();
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadBranches() {
  showEmptyState("Loading branches…");
  try {
    const res = await fetch("/api/branches");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.branches = await res.json();
    populateBranchSelect();

    if (state.locationId) {
      branchSelect.value = state.locationId;
      populateRoomSelect(state.locationId);
      if (state.roomId && !state.allRoomsMode) roomSelect.value = state.roomId;
      await loadBookings();
    } else {
      showEmptyState("Select a branch and room to view availability");
    }
  } catch (err) {
    showError("Failed to load branch data. Check your connection.");
    console.error("loadBranches:", err);
  }
}

async function loadBookings() {
  if (!state.locationId) return;
  if (!state.roomId && !state.allRoomsMode) return;

  state.loading = true;
  showLoading();
  pushUrl();

  const firstDay  = new Date(state.year, state.month - 1, 1);
  const lastDay   = new Date(state.year, state.month, 0);
  const startDate = formatDate(firstDay);
  const endDate   = formatDate(lastDay);

  // Pass roomId for server-side filtering when in single-room mode (Reserve API supports this)
  const roomParam = (!state.allRoomsMode && state.roomId)
    ? `&roomId=${state.roomId}`
    : "";

  try {
    const res = await fetch(
      `/api/bookings?locationId=${state.locationId}&startDate=${startDate}&endDate=${endDate}${roomParam}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.bookings = await res.json();

    updateStats();
    renderCalendar();
    showCalendar();

    const now = new Date();
    lastUpdated.textContent = `Updated ${formatTime12(now.getHours(), now.getMinutes())}`;
    lastUpdated.classList.remove("hidden");
  } catch (err) {
    showError("Failed to load reservations. The Communico API may be unavailable.");
    console.error("loadBookings:", err);
  } finally {
    state.loading = false;
  }
}

// ── Branch / Room selectors ───────────────────────────────────────────────────

function populateBranchSelect() {
  branchSelect.innerHTML = '<option value="">— Select a branch —</option>';
  for (const branch of state.branches) {
    const opt = document.createElement("option");
    opt.value = branch.locationId;
    opt.textContent = branch.locationName;
    branchSelect.appendChild(opt);
  }
}

function populateRoomSelect(locationId) {
  const branch = state.branches.find((b) => b.locationId === locationId);
  roomSelect.innerHTML = '<option value="">— Select a room —</option>';
  roomSelect.disabled  = !branch;
  if (!branch) return;

  for (const room of branch.rooms) {
    const opt = document.createElement("option");
    opt.value = room.roomId;
    opt.textContent = room.roomName;
    roomSelect.appendChild(opt);
  }

  allRoomsBtn.classList.remove("hidden");
  updateAllRoomsBtn();
}

function updateAllRoomsBtn() {
  if (state.allRoomsMode) {
    allRoomsBtn.textContent = "Single Room";
    allRoomsBtn.classList.add("bg-teal-700", "text-white", "border-teal-700");
    allRoomsBtn.classList.remove("text-slate-600", "border-slate-300");
    roomSelect.disabled = true;
  } else {
    allRoomsBtn.textContent = "All Rooms";
    allRoomsBtn.classList.remove("bg-teal-700", "text-white", "border-teal-700");
    allRoomsBtn.classList.add("text-slate-600", "border-slate-300");
    roomSelect.disabled = false;
  }
}

function onBranchChange() {
  const locationId = parseInt(branchSelect.value) || null;
  state.locationId  = locationId;
  state.roomId      = null;
  state.allRoomsMode = false;
  state.bookings    = [];
  populateRoomSelect(locationId);
  updateAllRoomsBtn();
  findSlotBtn.disabled = true;
  hideStats();
  showEmptyState(locationId
    ? "Select a room to view availability"
    : "Select a branch and room to view availability"
  );
  calendarOuter.classList.add("hidden");
}

function onRoomChange() {
  const roomId = parseInt(roomSelect.value) || null;
  state.roomId       = roomId;
  state.allRoomsMode = false;
  updateAllRoomsBtn();
  findSlotBtn.disabled = !roomId;
  if (roomId) loadBookings();
  else showEmptyState("Select a room to view availability");
}

function onAllRoomsToggle() {
  state.allRoomsMode = !state.allRoomsMode;
  updateAllRoomsBtn();
  if (state.allRoomsMode) {
    state.roomId = null;
    roomSelect.value = "";
    findSlotBtn.disabled = false;
    loadBookings();
  } else {
    findSlotBtn.disabled = !state.roomId;
    if (state.roomId) loadBookings();
    else showEmptyState("Select a room to view availability");
  }
}

function onDateChange() {
  pushUrl();
  if (state.locationId && (state.roomId || state.allRoomsMode)) loadBookings();
}

function onTodayClick() {
  const today = new Date();
  const needsReload = state.year !== today.getFullYear() || state.month !== today.getMonth() + 1;
  state.year  = today.getFullYear();
  state.month = today.getMonth() + 1;
  syncMonthYearSelects();
  if (needsReload && state.locationId && (state.roomId || state.allRoomsMode)) {
    loadBookings();
  } else {
    scrollToToday();
  }
}

// ── Calendar rendering ────────────────────────────────────────────────────────

function renderCalendar() {
  calendarInner.innerHTML = "";
  if (state.allRoomsMode) renderAllRoomsCalendar();
  else renderSingleRoomCalendar();
}

function renderSingleRoomCalendar() {
  const room = getRoomName(state.roomId);
  calendarInner.appendChild(buildTimeRuler(room ? `📍 ${room}` : "Date / Day"));

  for (const day of getDaysInMonth(state.year, state.month)) {
    const dateStr  = formatDate(day);
    const dayBookings = state.bookings.filter((b) => b.startTime.startsWith(dateStr));
    calendarInner.appendChild(buildDayRow(day, dayBookings));
  }
}

function renderAllRoomsCalendar() {
  const branch = state.branches.find((b) => b.locationId === state.locationId);
  const rooms  = branch?.rooms ?? [];

  calendarInner.appendChild(buildTimeRuler("Date / Day"));

  for (const day of getDaysInMonth(state.year, state.month)) {
    const dateStr    = formatDate(day);
    const todayFlag  = isToday(day);
    const pastFlag   = isPast(day);
    const weekendFlag = isWeekend(day);

    const header = document.createElement("div");
    header.className = "day-group-header" +
      (todayFlag ? " bg-amber-50 text-amber-800" : "") +
      (pastFlag  ? " text-slate-400" : "");
    header.style.minWidth = "100%";
    header.innerHTML = `
      <div class="w-20 flex-shrink-0"></div>
      <span class="font-semibold">${DAY_ABBRS[day.getDay()]}&nbsp;${day.getMonth() + 1}/${day.getDate()}</span>
      ${todayFlag ? '<span class="ml-2 text-xs bg-amber-400 text-white px-1.5 py-0.5 rounded-full">Today</span>' : ""}
    `;
    calendarInner.appendChild(header);

    for (const room of rooms) {
      const roomBookings = state.bookings.filter(
        (b) => b.startTime.startsWith(dateStr) && b.roomId === room.roomId
      );
      calendarInner.appendChild(
        buildAllRoomsRoomRow(room, day, roomBookings, pastFlag, weekendFlag)
      );
    }
  }
}

function buildTimeRuler(labelText) {
  const row = document.createElement("div");
  row.className = "cal-row time-ruler-row";

  const label = document.createElement("div");
  label.className = "day-label header";
  label.style.cssText =
    "font-size:10px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;background:white;";
  label.textContent = labelText;

  const ruler = document.createElement("div");
  ruler.className = "ruler-bar";
  ruler.style.height = "34px";

  for (let h = OPEN_HOUR; h <= CLOSE_HOUR; h++) {
    const pct = ((h - OPEN_HOUR) * 60) / TOTAL_MINS * 100;

    const tick = document.createElement("div");
    tick.className = "hour-tick";
    tick.style.left = pct + "%";
    tick.textContent = formatHour(h);
    ruler.appendChild(tick);

    const line = document.createElement("div");
    line.className = "hour-tick-line";
    line.style.left = pct + "%";
    ruler.appendChild(line);
  }

  row.appendChild(label);
  row.appendChild(ruler);
  return row;
}

function buildDayRow(day, bookings) {
  const row = document.createElement("div");
  row.className = "cal-row";
  if (isToday(day))     row.classList.add("is-today");
  else if (isPast(day)) row.classList.add("is-past");
  if (isWeekend(day))   row.classList.add("is-weekend");
  row.dataset.date = formatDate(day);

  const label = document.createElement("div");
  label.className = "day-label";
  label.innerHTML = `
    <span class="day-name">${DAY_ABBRS[day.getDay()]}</span>
    <span class="day-date">${day.getMonth() + 1}/${day.getDate()}</span>
    ${isToday(day) ? '<span style="font-size:9px;background:#f59e0b;color:white;padding:1px 4px;border-radius:4px;margin-top:2px">Today</span>' : ""}
  `;

  row.appendChild(label);
  row.appendChild(buildTimelineBar(bookings, false));
  return row;
}

function buildAllRoomsRoomRow(room, day, bookings, pastFlag, weekendFlag) {
  const row = document.createElement("div");
  row.className = "cal-row" +
    (weekendFlag ? " is-weekend" : "") +
    (pastFlag    ? " is-past"    : "");
  row.style.minHeight = "36px";
  row.dataset.date = formatDate(day);

  const label = document.createElement("div");
  label.className = "room-row-label";
  label.textContent = room.roomName;
  label.title = room.roomName;

  row.appendChild(label);
  row.appendChild(buildTimelineBar(bookings, true));
  return row;
}

function buildTimelineBar(bookings, showRoomInTooltip) {
  const bar = document.createElement("div");
  bar.className = "timeline-bar";

  // Hour and half-hour grid lines
  for (let h = OPEN_HOUR; h <= CLOSE_HOUR; h++) {
    const pct = ((h - OPEN_HOUR) * 60) / TOTAL_MINS * 100;
    const line = document.createElement("div");
    line.className = "grid-line hour";
    line.style.left = pct + "%";
    bar.appendChild(line);

    if (h < CLOSE_HOUR) {
      const half = document.createElement("div");
      half.className = "grid-line half";
      half.style.left = ((h - OPEN_HOUR) * 60 + 30) / TOTAL_MINS * 100 + "%";
      bar.appendChild(half);
    }
  }

  for (const booking of bookings) {
    const block = buildBookingBlock(booking, showRoomInTooltip);
    if (block) bar.appendChild(block);
  }

  return bar;
}

function buildBookingBlock(booking, showRoomInTooltip) {
  const color = booking.type === "staff" ? BOOKING_COLORS.staff : BOOKING_COLORS.patron;

  // Core event time in minutes from OPEN_HOUR
  const startMins = parseReserveMinutes(booking.startTime);
  const endMins   = parseReserveMinutes(booking.endTime);

  if (endMins <= 0 || startMins >= TOTAL_MINS) return null;

  // Expand block to include setup/breakdown buffers
  const setupMins     = booking.setupTime     ?? 0; // integer minutes
  const breakdownMins = booking.breakdownTime ?? 0;

  const blockStart = Math.max(0, startMins - setupMins);
  const blockEnd   = Math.min(TOTAL_MINS, endMins + breakdownMins);
  if (blockEnd <= blockStart) return null;

  const blockDuration = blockEnd - blockStart;
  const leftPct  = (blockStart / TOTAL_MINS) * 100;
  const widthPct = (blockDuration / TOTAL_MINS) * 100;

  const block = document.createElement("div");
  block.className = "booking-block" + (booking.status === "pending" ? " is-pending" : "");
  block.style.left    = leftPct + "%";
  block.style.width   = widthPct + "%";
  block.style.background = color;

  // ── Setup band (lighter, left portion) ──────────────────
  const setupBandPct = ((Math.max(blockStart, startMins) - blockStart) / blockDuration) * 100;

  // ── Breakdown band (lighter, right portion) ──────────────
  const bdStartInBlock = (Math.max(blockStart, endMins) - blockStart) / blockDuration * 100;
  const bdWidthPct     = 100 - bdStartInBlock;

  // Only render bands if there actually is setup/breakdown time
  if (setupBandPct > 0) {
    const setup = document.createElement("div");
    setup.className = "band-setup";
    setup.style.width = setupBandPct + "%";
    setup.style.background = color;
    block.appendChild(setup);
  }
  if (bdWidthPct > 0 && bdStartInBlock < 100) {
    const bd = document.createElement("div");
    bd.className = "band-breakdown";
    bd.style.width = bdWidthPct + "%";
    bd.style.background = color;
    block.appendChild(bd);
  }

  const label = document.createElement("span");
  label.className = "booking-label";
  label.textContent = booking.displayName || "Booking";
  block.appendChild(label);

  block.addEventListener("mouseenter", () => showTooltip(booking, color, showRoomInTooltip));
  block.addEventListener("mouseleave", hideTooltip);

  return block;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function updateStats() {
  let totalMinsBooked = 0;
  for (const b of state.bookings) {
    const dur = parseReserveMinutes(b.endTime) - parseReserveMinutes(b.startTime);
    if (dur > 0) totalMinsBooked += dur;
  }

  const totalHours  = (totalMinsBooked / 60).toFixed(1);
  const daysInMonth = new Date(state.year, state.month, 0).getDate();
  const utilPct     = Math.round((totalMinsBooked / (daysInMonth * TOTAL_MINS)) * 100);

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === state.year && today.getMonth() + 1 === state.month;
  let todayText = "—";

  if (isCurrentMonth) {
    const todayStr     = formatDate(today);
    const todayCount   = state.bookings.filter((b) => b.startTime.startsWith(todayStr)).length;
    const nextSlot     = findNextAvailableToday(todayStr);
    todayText = nextSlot
      ? `Next open: ${nextSlot}`
      : todayCount === 0
        ? "No bookings"
        : `${todayCount} booking${todayCount !== 1 ? "s" : ""}`;
  }

  $("stat-bookings").textContent = state.bookings.length;
  $("stat-hours").textContent    = `${totalHours} hrs`;
  $("stat-util").textContent     = `${utilPct}%`;
  $("stat-util-bar").style.width = `${Math.min(100, utilPct)}%`;
  $("stat-today").textContent    = todayText;

  statsBar.classList.remove("hidden");
}

function findNextAvailableToday(todayStr) {
  const now     = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes() - OPEN_HOUR * 60;
  if (nowMins >= TOTAL_MINS) return null;

  const sorted = state.bookings
    .filter((b) => b.startTime.startsWith(todayStr))
    .map((b) => ({
      start: parseReserveMinutes(b.startTime) - (b.setupTime ?? 0),
      end:   parseReserveMinutes(b.endTime)   + (b.breakdownTime ?? 0),
    }))
    .sort((a, b) => a.start - b.start);

  let cursor = Math.max(0, nowMins);
  for (const b of sorted) {
    if (cursor + 30 <= b.start) return minutesToTime12(cursor);
    cursor = Math.max(cursor, b.end);
  }
  if (cursor + 30 <= TOTAL_MINS) return minutesToTime12(cursor);
  return null;
}

function hideStats() { statsBar.classList.add("hidden"); }

// ── Tooltip ───────────────────────────────────────────────────────────────────

function showTooltip(booking, color, showRoom) {
  const isStaff    = booking.type === "staff";
  const isPending  = booking.status === "pending";
  const typeLabel  = isStaff ? "Internal / Staff" : "Patron / Public";
  const typeBg     = isStaff ? "#dbeafe" : "#fee2e2";
  const typeColor  = isStaff ? "#1d4ed8" : "#b91c1c";

  $("tt-accent").style.background = color;
  $("tt-title").textContent = booking.displayName || "Booking";

  const badge = $("tt-type-badge");
  badge.textContent     = isPending ? "⏳ Pending" : typeLabel;
  badge.style.background = isPending ? "#fef3c7" : typeBg;
  badge.style.color      = isPending ? "#92400e"  : typeColor;

  if (showRoom && booking.roomName) {
    $("tt-room").textContent = `📍 ${booking.roomName}`;
    $("tt-room").classList.remove("hidden");
  } else {
    $("tt-room").classList.add("hidden");
  }

  const startDisplay = formatReserveTime(booking.startTime);
  const endDisplay   = formatReserveTime(booking.endTime);
  $("tt-times").textContent = `${startDisplay} – ${endDisplay}`;

  const durationMins = parseReserveMinutes(booking.endTime) - parseReserveMinutes(booking.startTime);
  $("tt-duration").textContent = formatDuration(durationMins);

  // Setup / Breakdown (show if either is non-zero)
  if ((booking.setupTime ?? 0) > 0 || (booking.breakdownTime ?? 0) > 0) {
    const parts = [];
    if (booking.setupTime > 0)     parts.push(`${booking.setupTime} min setup`);
    if (booking.breakdownTime > 0) parts.push(`${booking.breakdownTime} min breakdown`);
    $("tt-setup").textContent = parts.join(" · ");
    $("tt-setup-row").classList.remove("hidden");
  } else {
    $("tt-setup-row").classList.add("hidden");
  }

  // Contact info
  const hasContact = booking.contactName || booking.contactPhone || booking.contactEmail;
  if (hasContact) {
    const parts = [
      booking.contactName  ? `<span class="font-medium text-slate-700">${escHtml(booking.contactName)}</span>` : "",
      booking.contactPhone ? `<span>📞 ${escHtml(booking.contactPhone)}</span>` : "",
      booking.contactEmail ? `<span>✉ ${escHtml(booking.contactEmail)}</span>` : "",
    ].filter(Boolean);
    $("tt-contact").innerHTML = parts.join('<span class="text-slate-300 mx-1">·</span>');
    $("tt-contact-row").classList.remove("hidden");
  } else {
    $("tt-contact-row").classList.add("hidden");
  }

  // Notes
  const notes = (booking.patronNotes || booking.eventNotes || "").trim();
  if (notes) {
    $("tt-desc").textContent = notes;
    $("tt-desc-row").classList.remove("hidden");
  } else {
    $("tt-desc-row").classList.add("hidden");
  }

  // Expected attendees
  if (booking.expectedAttendees > 0) {
    $("tt-attendees").textContent = `👥 ${booking.expectedAttendees} expected`;
    $("tt-attendees-row").classList.remove("hidden");
  } else {
    $("tt-attendees-row").classList.add("hidden");
  }

  tooltip.classList.remove("hidden");
}

function hideTooltip() { tooltip.classList.add("hidden"); }

function positionTooltip(mouseX, mouseY) {
  const w = tooltip.offsetWidth  || 280;
  const h = tooltip.offsetHeight || 180;
  const margin = 14;
  let x = mouseX + margin;
  let y = mouseY + margin;
  if (x + w > window.innerWidth  - margin) x = mouseX - w - margin;
  if (y + h > window.innerHeight - margin) y = mouseY - h - margin;
  if (x < margin) x = margin;
  if (y < margin) y = margin;
  tooltip.style.left = x + "px";
  tooltip.style.top  = y + "px";
}

// ── Find a Slot modal ─────────────────────────────────────────────────────────

function openFindSlotModal() {
  const today = new Date();
  const defaultDate = (today.getFullYear() === state.year && today.getMonth() + 1 === state.month)
    ? formatDate(today)
    : formatDate(new Date(state.year, state.month - 1, 1));

  modalDate.value = defaultDate;
  modalDate.min   = formatDate(new Date(state.year, state.month - 1, 1));
  modalDate.max   = formatDate(new Date(state.year, state.month, 0));

  if (state.allRoomsMode) {
    modalRoomName.classList.add("hidden");
    modalRoomSel.classList.remove("hidden");
    const branch = state.branches.find((b) => b.locationId === state.locationId);
    if (branch) {
      modalRoomSel.innerHTML = "";
      for (const room of branch.rooms) {
        const opt = document.createElement("option");
        opt.value = room.roomId;
        opt.textContent = room.roomName;
        modalRoomSel.appendChild(opt);
      }
    }
  } else {
    modalRoomSel.classList.add("hidden");
    modalRoomName.classList.remove("hidden");
    modalRoomName.textContent = getRoomName(state.roomId) || "Selected Room";
  }

  modalResults.classList.add("hidden");
  modalOverlay.classList.remove("hidden");
}

function closeModal() { modalOverlay.classList.add("hidden"); }

function runFindSlot() {
  const dateStr = modalDate.value;
  if (!dateStr) return;

  const selectedDur  = document.querySelector(".dur-btn.bg-teal-700");
  const durationMins = selectedDur ? parseInt(selectedDur.dataset.mins) : 60;
  const roomId = state.allRoomsMode ? parseInt(modalRoomSel.value) : state.roomId;
  if (!roomId) return;

  const slots = findAvailableSlots(dateStr, roomId, durationMins);
  const dateLong = formatDateLong(new Date(dateStr + "T00:00:00"));

  modalResLabel.textContent = slots.length > 0
    ? `${slots.length} available window${slots.length !== 1 ? "s" : ""} on ${dateLong}`
    : `No ${formatDuration(durationMins)} windows on ${dateLong}`;

  modalResList.innerHTML = "";
  if (slots.length === 0) {
    const none = document.createElement("p");
    none.className = "text-sm text-slate-400 italic py-1";
    none.textContent = "The room is fully booked during open hours.";
    modalResList.appendChild(none);
  } else {
    for (const slot of slots) {
      const item = document.createElement("div");
      item.className =
        "flex items-center justify-between bg-green-50 border border-green-200 rounded-md px-3 py-2";
      item.innerHTML = `
        <div>
          <span class="text-sm font-semibold text-green-800">
            ${minutesToTime12(slot.start)} – ${minutesToTime12(slot.end)}
          </span>
          <span class="text-xs text-green-600 ml-2">${formatDuration(slot.end - slot.start)} available</span>
        </div>
        <span class="text-xs text-green-500">✓ Open</span>
      `;
      modalResList.appendChild(item);
    }
  }

  modalResults.classList.remove("hidden");
}

function findAvailableSlots(dateStr, roomId, durationMins) {
  // Use the full blocked window (including setup/breakdown) for accuracy
  const occupied = state.bookings
    .filter((b) => b.roomId === roomId && b.startTime.startsWith(dateStr))
    .map((b) => ({
      start: Math.max(0, parseReserveMinutes(b.startTime) - (b.setupTime ?? 0)),
      end:   Math.min(TOTAL_MINS, parseReserveMinutes(b.endTime) + (b.breakdownTime ?? 0)),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);

  const slots  = [];
  let cursor   = 0;

  for (const b of occupied) {
    if (b.start - cursor >= durationMins) slots.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (TOTAL_MINS - cursor >= durationMins) slots.push({ start: cursor, end: TOTAL_MINS });

  return slots;
}

// ── UI state helpers ──────────────────────────────────────────────────────────

function showEmptyState(msg) {
  emptyStateMsg.textContent = msg;
  emptyState.classList.remove("hidden");
  loadingState.classList.add("hidden");
  errorState.classList.add("hidden");
  calendarOuter.classList.add("hidden");
}

function showLoading() {
  loadingState.classList.remove("hidden");
  emptyState.classList.add("hidden");
  errorState.classList.add("hidden");
  calendarOuter.classList.add("hidden");
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorState.classList.remove("hidden");
  loadingState.classList.add("hidden");
  emptyState.classList.add("hidden");
  calendarOuter.classList.add("hidden");
}

function showCalendar() {
  calendarOuter.classList.remove("hidden");
  emptyState.classList.add("hidden");
  loadingState.classList.add("hidden");
  errorState.classList.add("hidden");

  const today = new Date();
  if (today.getFullYear() === state.year && today.getMonth() + 1 === state.month) {
    requestAnimationFrame(scrollToToday);
  } else {
    calendarOuter.scrollTop = 0;
  }
}

function scrollToToday() {
  const row = calendarInner.querySelector(".cal-row.is-today, .day-group-header.bg-amber-50");
  if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRoomName(roomId) {
  const branch = state.branches.find((b) => b.locationId === state.locationId);
  return branch?.rooms.find((r) => r.roomId === roomId)?.roomName ?? null;
}

function getDaysInMonth(year, month) {
  const days = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLong(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function isToday(date) {
  const t = new Date();
  return date.getFullYear() === t.getFullYear() &&
         date.getMonth()    === t.getMonth() &&
         date.getDate()     === t.getDate();
}

function isPast(date) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  return d < t;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// "YYYY-MM-DD HH:MM:SS" → minutes from OPEN_HOUR (may be negative if before open)
function parseReserveMinutes(dateTimeStr) {
  if (!dateTimeStr) return 0;
  const [, timePart = "00:00:00"] = dateTimeStr.split(" ");
  const [h, m] = timePart.split(":").map(Number);
  return h * 60 + m - OPEN_HOUR * 60;
}

// Minutes from OPEN_HOUR → "H:MM AM/PM"
function minutesToTime12(mins) {
  const total = OPEN_HOUR * 60 + mins;
  return formatTime12(Math.floor(total / 60), total % 60);
}

function formatTime12(h, m) {
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// "YYYY-MM-DD HH:MM:SS" → "H:MM AM/PM"
function formatReserveTime(dateTimeStr) {
  if (!dateTimeStr) return "";
  const [, timePart = "00:00:00"] = dateTimeStr.split(" ");
  const [h, m] = timePart.split(":").map(Number);
  return formatTime12(h, m);
}

function formatHour(h) {
  if (h === 12) return "12 PM";
  if (h === 0)  return "12 AM";
  return h > 12 ? `${h - 12} PM` : `${h} AM`;
}

function formatDuration(mins) {
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
