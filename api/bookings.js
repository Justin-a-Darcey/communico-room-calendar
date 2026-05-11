import axios from "axios";

const BASE   = process.env.COMMUNICO_BASE ?? "https://api.communico.co";
const KEY    = process.env.COMMUNICO_KEY;
const SECRET = process.env.COMMUNICO_SECRET;

async function getToken() {
  const base64 = Buffer.from(`${KEY}:${SECRET}`).toString("base64");
  const res = await axios.post(
    `${BASE}/v3/token`,
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${base64}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  return res.data.access_token;
}

async function fetchAllReservations(token, params) {
  const pageSize = 200;
  let start = 0;
  let collected = [];
  let total = Infinity;

  while (collected.length < total && collected.length < 5000) {
    const res = await axios.get(`${BASE}/v3/reserve/reservations`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { ...params, limit: pageSize, start },
    });

    const payload = res.data?.data ?? res.data;
    total = payload?.total ?? 0;
    const entries = payload?.entries ?? [];
    collected = [...collected, ...entries];
    start += pageSize;
    if (entries.length < pageSize || collected.length >= total) break;
  }

  return collected;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { locationId, startDate, endDate } = req.query;

  if (!locationId || !startDate || !endDate) {
    return res.status(400).json({ error: "locationId, startDate, and endDate are required" });
  }

  try {
    const token = await getToken();

    const params = {
      locationId, startDate, endDate,
      fields: "contactName,contactEmail,contactPhone,roomName,setupTime,breakdownTime,locationName,type,groupName,expectedAttendees,patronNotes,eventNotes,layout",
    };

    const [approved, pending] = await Promise.all([
      fetchAllReservations(token, { ...params, status: "approved" }),
      fetchAllReservations(token, { ...params, status: "pending" }),
    ]);
    const reservations = [...approved, ...pending];

    const bookings = reservations
      .map((r) => ({
        reservationId:     r.reservationId,
        roomId:            r.roomId,
        roomName:          r.roomName ?? "",
        displayName:       r.displayName ?? "",
        startTime:         r.startTime ?? "",
        endTime:           r.endTime ?? "",
        setupTime:         r.setupTime ?? 0,
        breakdownTime:     r.breakdownTime ?? 0,
        contactName:       r.contactName ?? "",
        contactPhone:      r.contactPhone ?? "",
        contactEmail:      r.contactEmail ?? "",
        locationId:        r.locationId,
        locationName:      r.locationName ?? "",
        status:            r.status ?? "approved",
        type:              r.type ?? "patron",
        groupName:         r.groupName ?? "",
        expectedAttendees: r.expectedAttendees ?? 0,
        patronNotes:       r.patronNotes ?? "",
        eventNotes:        r.eventNotes ?? "",
        layout:            r.layout ?? "",
      }));

    res.setHeader("Cache-Control", "public, s-maxage=60");
    res.json(bookings);
  } catch (err) {
    const status = err.response?.status;
    const body   = err.response?.data;
    console.error("bookings error:", err.message, "| HTTP:", status, "| body:", JSON.stringify(body));
    res.status(500).json({
      error: "Failed to fetch reservations",
      detail: err.message,
      apiStatus: status ?? null,
      apiBody: body ?? null,
    });
  }
}
