export default {
  async fetch(request, env) {
    const allowed = new Set([
      "https://amanagroup.org",
      "https://www.amanagroup.org",
      "https://ronineditingwork-bro.github.io"
    ]);
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": allowed.has(origin) ? origin : "https://www.amanagroup.org",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === "GET") {
      return json({ ok: true, service: "AMANA Telegram Leads" }, 200, cors);
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405, cors);
    }

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return json({ ok: false, error: "Telegram secrets are not configured" }, 500, cors);
    }

    let data;
    try {
      const raw = await request.text();
      data = JSON.parse(raw || "{}");
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400, cors);
    }

    const type = clean(data.type || "lead", 40);
    const name = clean(data.name, 120);
    const phone = clean(data.phone, 80);
    const email = clean(data.email, 160);
    const company = clean(data.company, 160);
    const topic = clean(data.topic || data.service || "Заявка", 160);
    const message = clean(data.message || data.comment, 2500);
    const page = clean(data.page, 500);

    if (!name && !phone && !email) {
      return json({ ok: false, error: "Contact details are required" }, 400, cors);
    }

    let title = "Новая заявка AMANA";
    if (type === "order") title = "Новый заказ AMANA";
    else if (type === "price_request") title = "Запрос цены — AMANA";
    else if (type === "callback") title = "Обратный звонок — AMANA";

    const lines = [
      "<b>" + esc(title) + "</b>",
      "",
      name ? "Имя: " + esc(name) : "",
      phone ? "Телефон: " + esc(phone) : "",
      email ? "E-mail: " + esc(email) : "",
      company ? "Компания: " + esc(company) : "",
      topic ? "Тема: " + esc(topic) : ""
    ].filter(Boolean);

    if (type === "order" && Array.isArray(data.items)) {
      lines.push("", "<b>Корзина:</b>");
      data.items.slice(0, 40).forEach((item, i) => {
        const itemName = clean(item.name, 180);
        const sku = clean(item.sku, 80);
        const color = clean(item.colorName, 100);
        const qty = Number(item.qty) || 1;
        const price = Number(item.price) || 0;
        lines.push(
          (i + 1) + ". " + esc(itemName) +
          (sku ? " · " + esc(sku) : "") +
          (color ? " · " + esc(color) : "") +
          " · " + qty + " шт." +
          (price ? " · " + money(price * qty) : "")
        );
      });
      const total = Number(data.total) || 0;
      if (total) lines.push("", "<b>Итого: " + money(total) + "</b>");
    }

    if (message) lines.push("", "Комментарий:", esc(message));
    if (page) lines.push("", "Страница: " + esc(page));

    const tg = await fetch(
      "https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: lines.join("\n"),
          parse_mode: "HTML",
          disable_web_page_preview: true
        })
      }
    );

    const result = await tg.json().catch(() => ({}));
    if (!tg.ok || result.ok === false) {
      return json({ ok: false, error: "Telegram delivery failed" }, 502, cors);
    }

    return json({ ok: true }, 200, cors);
  }
};

function clean(value, max) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
}

function esc(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function money(value) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(value)) + " ₽";
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors)
  });
}
