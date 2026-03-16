const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const port = Number(process.env.PORT) || 3000;
const allowedOrigin = process.env.ALLOWED_ORIGIN || "*";

const dataFile = path.join(__dirname, "data", "dates.json");

async function ensureDataFile() {
  const directory = path.dirname(dataFile);
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, "[]\n", "utf8");
  }
}

async function readDates() {
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, "utf8");
  return JSON.parse(raw);
}

async function writeDates(dates) {
  await fs.writeFile(dataFile, `${JSON.stringify(dates, null, 2)}\n`, "utf8");
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  response.end(JSON.stringify(body));
}

function parseRequestBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";
    request.on("data", (chunk) => { rawBody += chunk; });
    request.on("end", () => {
      try { resolve(JSON.parse(rawBody || "{}")); } 
      catch { reject(new Error("Invalid JSON")); }
    });
    request.on("error", reject);
  });
}

const server = http.createServer(async (request, response) => {
  // Handle CORS Preflight
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);

  // GET Route
  if (request.method === "GET" && url.pathname === "/api/dates") {
    try {
      const dates = await readDates();
      sendJson(response, 200, dates);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  // POST Route
  if (request.method === "POST" && url.pathname === "/api/dates") {
    try {
      const body = await parseRequestBody(request);
      const label = String(body.label || "").trim();
      const dateValue = new Date(body.date);

      if (!label || Number.isNaN(dateValue.getTime())) {
        sendJson(response, 400, { error: "Valid label and date are required" });
        return;
      }

      const dates = await readDates();
      const newEntry = {
        id: crypto.randomUUID(),
        label,
        date: dateValue.toISOString(),
      };
      dates.push(newEntry);
      await writeDates(dates);
      sendJson(response, 201, newEntry);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(port, () => console.log(`Server on port ${port}`));
