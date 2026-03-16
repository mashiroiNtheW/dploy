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
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  response.end(JSON.stringify(body));
}

function parseRequestBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;
      if (rawBody.length > 1_000_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(JSON.parse(rawBody || "{}"));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    request.on("error", reject);
  });
}

function isValidIsoDate(value) {
  return !Number.isNaN(Date.parse(value));
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: "Missing request URL" });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/dates") {
    try {
      const dates = await readDates();
      sendJson(response, 200, dates);
    } catch (error) {
      sendJson(response, 500, { error: error.message });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/dates") {
    try {
      const body = await parseRequestBody(request);
      const label = String(body.label || "").trim();
      const date = String(body.date || "").trim();

      if (!label || !date) {
        sendJson(response, 400, { error: "Both label and date are required" });
        return;
      }

      if (label.length > 80) {
        sendJson(response, 400, { error: "Label must be 80 characters or less" });
        return;
      }

      if (!isValidIsoDate(date)) {
        sendJson(response, 400, { error: "Date must be a valid ISO timestamp" });
        return;
      }

      const dates = await readDates();
      const newEntry = {
        id: crypto.randomUUID(),
        label,
        date: new Date(date).toISOString(),
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

server.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
