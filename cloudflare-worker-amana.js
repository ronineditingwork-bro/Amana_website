// Cloudflare Worker for AMANA КП заявки.
// Configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID as Worker secrets.

const ALLOWED_ORIGINS = new Set([
  "https://amanagroup.org",
  "https://www.amanagroup.org"
]);

function responseHeaders(origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };

  if (ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Accept, Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }

  return headers;
}

function jsonResponse(payload, status, origin) {
  return new Response(JSON.stringify(payload), {
    status: status,
    headers: responseHeaders(origin)
  });
}

function clean(value, limit) {
  return String(value == null ? "" : value)
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, limit || 1000);
}

function makeTelegramMessage(data) {
  const fields = [
    ["Тип заявки", clean(data.topic, 200)],
    ["Номер КП", clean(data.offer, 100)],
    ["Заказчик", clean(data.client, 300)],
    ["Объект", clean(data.object, 300)],
    ["Контакт", clean(data.contact, 300)],
    ["Состав", clean(data.positions, 2800)],
    ["Итого", clean(data.total, 300)]
  ];

  let message = "Новая заявка AMANA\n\n" + fields
    .filter(function (field) { return field[1]; })
    .map(function (field) { return field[0] + ":\n" + field[1]; })
    .join("\n\n");

  if (message.length > 3900) {
    message = message.slice(0, 3899) + "…";
  }

  return message;
}

async function readPayload(request) {
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    return await request.json();
  }

  const form = await request.formData();
  const data = {};
  for (const entry of form.entries()) {
    if (typeof entry[1] === "string") data[entry[0]] = entry[1];
  }
  return data;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      if (!ALLOWED_ORIGINS.has(origin)) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, {
        status: 204,
        headers: responseHeaders(origin)
      });
    }

    if (request.method === "GET") {
      return jsonResponse({ ok: true, service: "AMANA Telegram notifications" }, 200, origin);
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed" }, 405, origin);
    }

    if (!ALLOWED_ORIGINS.has(origin)) {
      return jsonResponse({ ok: false, error: "Origin is not allowed" }, 403, origin);
    }

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return jsonResponse({ ok: false, error: "Telegram secrets are not configured" }, 500, origin);
    }

    let data;
    try {
      data = await readPayload(request);
    } catch (_error) {
      return jsonResponse({ ok: false, error: "Invalid request body" }, 400, origin);
    }

    if (!data || typeof data !== "object" || !clean(data.contact, 300)) {
      return jsonResponse({ ok: false, error: "A contact is required" }, 400, origin);
    }

    const message = makeTelegramMessage(data);
    let telegramResponse;
    let telegramResult;

    try {
      telegramResponse = await fetch(
        "https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: env.TELEGRAM_CHAT_ID,
            text: message,
            disable_web_page_preview: true
          })
        }
      );
      telegramResult = await telegramResponse.json();
    } catch (_error) {
      console.error("AMANA Telegram delivery request failed");
      return jsonResponse({ ok: false, error: "Telegram delivery failed" }, 502, origin);
    }

    if (!telegramResponse.ok || !telegramResult || !telegramResult.ok) {
      console.error(
        "AMANA Telegram API rejected the request",
        telegramResponse.status,
        telegramResult && telegramResult.description ? telegramResult.description : "No API description"
      );
      return jsonResponse({ ok: false, error: "Telegram delivery failed" }, 502, origin);
    }

    return jsonResponse({ ok: true }, 200, origin);
  }
};
