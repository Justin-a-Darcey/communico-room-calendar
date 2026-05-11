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

function dateStr(date) {
  return date.toISOString().split("T")[0];
}

async function fetchAllRooms(token) {
  const pageSize = 200;
  let start = 0;
  let collected = [];
  let total = Infinity;

  while (collected.length < total) {
    const res = await axios.get(`${BASE}/v3/reserve/rooms`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit: pageSize, start },
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

async function fetchLocationNames(token) {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + 30);

  const res = await axios.get(`${BASE}/v3/attend/events`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { startDate: dateStr(now), endDate: dateStr(future), limit: 200, start: 0 },
  });

  const payload = res.data?.data ?? res.data;
  const entries = payload?.entries ?? [];

  const map = new Map();
  for (const e of entries) {
    if (e.locationId && !map.has(e.locationId)) {
      map.set(e.locationId, e.locationName ?? `Location ${e.locationId}`);
    }
  }
  return map;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const token = await getToken();

    const [rooms, locationNames] = await Promise.all([
      fetchAllRooms(token),
      fetchLocationNames(token),
    ]);

    const locationMap = new Map();
    for (const room of rooms) {
      if (!room.locationId) continue;
      if (!locationMap.has(room.locationId)) {
        locationMap.set(room.locationId, {
          locationId: room.locationId,
          locationName: locationNames.get(room.locationId) ?? `Location ${room.locationId}`,
          rooms: [],
        });
      }
      locationMap.get(room.locationId).rooms.push({
        roomId:        room.roomId,
        roomName:      room.name ?? "Unknown Room",
        roomType:      room.roomType ?? null,
        setupTime:     room.setupTime ?? 0,
        breakdownTime: room.breakdownTime ?? 0,
        staffBookable: room.staffBookable ?? true,
      });
    }

    const branches = [...locationMap.values()]
      .map((loc) => ({
        ...loc,
        rooms: loc.rooms.sort((a, b) => a.roomName.localeCompare(b.roomName)),
      }))
      .sort((a, b) => a.locationName.localeCompare(b.locationName));

    res.setHeader("Cache-Control", "public, s-maxage=3600");
    res.json(branches);
  } catch (err) {
    console.error("branches error:", err.message);
    res.status(500).json({ error: "Failed to fetch branch data" });
  }
}
