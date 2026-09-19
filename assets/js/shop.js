/* AMANA GROUP — корзина и коммерческое предложение.
   Состав корзины хранится только в браузере покупателя (localStorage);
   на сервер ничего не отправляется. */
(function () {
  "use strict";

  var KEY = "amana.cart.v1";
  var CFG = window.AMANA_CONFIG || {};
  var CURRENCY = CFG.currency || "₽";
  var VAT = typeof CFG.vat === "number" ? CFG.vat : 20;
  var VAT_INCLUDED = CFG.vatIncluded !== false;
  var VAT_SHOW = CFG.vatShow !== false;
  var LEAD = CFG.lead || {};

  /* ------------------------------------------------------------- хранилище */
  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter(valid) : [];
    } catch (e) { return []; }
  }

  function valid(i) {
    return i && typeof i.sku === "string" && typeof i.price === "number" && i.qty > 0;
  }

  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
    document.dispatchEvent(new CustomEvent("amana:cart", { detail: list }));
  }

  function keyOf(i) { return i.sku + "|" + (i.color || ""); }

  function add(item) {
    var list = read();
    var found = null;
    list.forEach(function (i) { if (keyOf(i) === keyOf(item)) found = i; });
    if (found) found.qty = Math.min(999, found.qty + item.qty);
    else list.push(item);
    write(list);
  }

  function setQty(key, qty) {
    var list = read().map(function (i) {
      if (keyOf(i) === key) i.qty = Math.max(0, Math.min(999, qty));
      return i;
    }).filter(function (i) { return i.qty > 0; });
    write(list);
  }

  function remove(key) {
    write(read().filter(function (i) { return keyOf(i) !== key; }));
  }

  function totals(list) {
    var base = list.reduce(function (a, i) { return a + i.price * i.qty; }, 0);
    var vat, net, sum;
    if (VAT_INCLUDED) {          // цены уже с НДС — выделяем его из суммы
      sum = base;
      vat = Math.round(base * VAT / (100 + VAT));
      net = sum - vat;
    } else {                     // цены без НДС — начисляем сверху
      net = base;
      vat = Math.round(base * VAT / 100);
      sum = net + vat;
    }
    return { sum: sum, vat: vat, net: net,
             count: list.reduce(function (a, i) { return a + i.qty; }, 0) };
  }

  function money(n) {
    return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " " + CURRENCY;
  }

  /* Керамогранит продаётся коробками: price в позиции — цена коробки,
     rate — цена квадратного метра, pack — метры в одной коробке. */
  function area(n) {
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " м²";
  }

  function packNote(i) {
    return i.pack ? "коробка " + area(i.pack) : "";
  }

  /* --------------------------------------------------------------- витрина */
  function variantsOf(scope) {
    try { return JSON.parse(scope.dataset.variants || "[]"); } catch (e) { return []; }
  }

  function activeVariant(scope) {
    var list = variantsOf(scope);
    if (!list.length) return null;
    var dot = scope.querySelector("[data-colors] .dot[aria-pressed='true'], [data-swatches] .swatch[aria-pressed='true'], [data-swatches] .swatch-text[aria-pressed='true']");
    var slug = dot ? dot.dataset.color : null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].color === slug) return list[i];
    }
    return list[0];
  }

  function setColor(scope, slug) {
    var dots = scope.querySelectorAll("[data-colors] .dot, [data-swatches] .swatch, [data-swatches] .swatch-text");
    Array.prototype.forEach.call(dots, function (d) {
      d.setAttribute("aria-pressed", String(d.dataset.color === slug));
    });
    var v = activeVariant(scope);
    if (!v) return;
    var shot = scope.querySelector("[data-shot]");
    var swatch = scope.querySelector("[data-swatch]");
    if (shot && v.img) shot.src = v.img;
    if (shot && swatch) {
      /* снимка на этот цвет может не быть — тогда в кадре стоит выкраска */
      shot.hidden = !v.img;
      swatch.hidden = !!v.img;
      if (!v.img) {
        if (v.hex) swatch.style.setProperty("--c", v.hex);
        var nm = swatch.querySelector("[data-swatch-name]");
        if (nm) nm.textContent = v.colorName || "";
      }
    }
    Array.prototype.forEach.call(scope.querySelectorAll("[data-price-label]"), function (el) {
      el.textContent = money(v.price);
    });
    Array.prototype.forEach.call(scope.querySelectorAll("[data-sku-label]"), function (el) {
      el.textContent = v.sku;
    });
    Array.prototype.forEach.call(scope.querySelectorAll("[data-rate-label]"), function (el) {
      if (v.rate) el.textContent = money(v.rate) + "/м²";
    });
    var label = scope.querySelector("[data-swatch-label]");
    if (label) label.textContent = v.colorName || "";
  }

  function qtyOf(scope) {
    var input = scope.querySelector("[data-qty-input]");
    var n = input ? parseInt(input.value, 10) : 1;
    return isNaN(n) || n < 1 ? 1 : Math.min(999, n);
  }

  function bindShowcase() {
    document.addEventListener("click", function (e) {
      var dot = e.target.closest("[data-colors] .dot, [data-swatches] .swatch, [data-swatches] .swatch-text");
      if (dot) {
        e.preventDefault();
        var scope = dot.closest("[data-product]");
        if (scope) setColor(scope, dot.dataset.color);
        return;
      }

      var dec = e.target.closest("[data-qty-dec]");
      var inc = e.target.closest("[data-qty-inc]");
      if (dec || inc) {
        var box = (dec || inc).closest("[data-qty]");
        var input = box.querySelector("[data-qty-input]");
        var n = parseInt(input.value, 10) || 1;
        input.value = Math.max(1, Math.min(999, n + (inc ? 1 : -1)));
        return;
      }

      var btn = e.target.closest("[data-add]");
      if (!btn) return;
      e.preventDefault();
      var scope = btn.closest("[data-product]");
      if (!scope) return;
      var v = activeVariant(scope);
      if (!v) return;
      add({
        sku: v.sku,
        name: scope.dataset.name,
        cat: scope.dataset.cat || "",
        price: v.price,
        img: v.img,
        color: v.color,
        colorName: v.colorName,
        unit: v.unit || "",
        pack: v.pack || 0,
        rate: v.rate || 0,
        qty: qtyOf(scope)
      });
      btn.classList.add("is-added");
      var label = btn.querySelector("span");
      var was = label ? label.textContent : "";
      if (label) label.textContent = "Добавлено";
      setTimeout(function () {
        btn.classList.remove("is-added");
        if (label) label.textContent = was;
      }, 1600);
    });
  }

  /* ---------------------------------------------------------------- бейдж */
  function paintBadge() {
    var t = totals(read());
    Array.prototype.forEach.call(document.querySelectorAll("[data-cart-count]"), function (el) {
      el.textContent = t.count ? String(t.count) : "";
      el.classList.toggle("is-empty", !t.count);
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-cart-link]"), function (el) {
      el.classList.toggle("has-items", t.count > 0);
    });
  }

  /* --------------------------------------------------------------- корзина */
  function renderCart() {
    var root = document.querySelector("[data-cart-root]");
    if (!root) return;
    var list = read();
    var empty = document.querySelector("[data-cart-empty]");
    var body = document.querySelector("[data-cart-body]");

    if (empty) empty.hidden = list.length > 0;
    if (body) body.hidden = list.length === 0;
    if (!list.length) { root.innerHTML = ""; paintSums(totals(list)); return; }

    root.innerHTML = list.map(function (i) {
      var k = keyOf(i);
      var src = i.img || "";
      return '<div class="line" data-key="' + k + '">' +
        '<div class="line__shot">' + (src ? '<img src="' + src + '" alt="" width="1000" height="1250" loading="lazy">' : '') + '</div>' +
        '<div class="line__info">' +
          '<p class="line__name">' + i.name + '</p>' +
          '<p class="line__meta">' + i.cat + (i.colorName ? ' · ' + i.colorName : '') +
            (i.pack ? ' · ' + packNote(i) : '') + '</p>' +
          '<p class="line__sku">' + i.sku + '</p>' +
        '</div>' +
        '<div class="qty" data-qty>' +
          '<button type="button" data-line-dec aria-label="Меньше">−</button>' +
          '<input type="text" inputmode="numeric" value="' + i.qty + '" aria-label="Количество" data-line-qty>' +
          '<button type="button" data-line-inc aria-label="Больше">+</button>' +
        '</div>' +
        '<div class="line__price">' + money(i.price) +
          (i.rate ? '<span class="line__rate">' + money(i.rate) + '/м²</span>' : '') + '</div>' +
        '<div class="line__sum">' + money(i.price * i.qty) + '</div>' +
        '<button class="line__x" type="button" data-line-remove aria-label="Удалить">×</button>' +
      '</div>';
    }).join("");
    paintSums(totals(list));
  }

  function paintSums(t) {
    var set = function (sel, val) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (el) {
        el.textContent = val;
      });
    };
    set("[data-sum-net]", money(t.net));
    set("[data-sum-vat]", money(t.vat));
    set("[data-sum-total]", money(t.sum));
    set("[data-sum-count]", String(t.count));
    set("[data-vat-rate]", String(VAT) + "%");
    // строки с НДС управляются настройкой продавца, а не правкой разметки
    Array.prototype.forEach.call(document.querySelectorAll("[data-vat-row]"), function (el) {
      el.hidden = !VAT_SHOW;
    });
  }

  function bindCart() {
    var root = document.querySelector("[data-cart-root]");
    if (!root) return;
    root.addEventListener("click", function (e) {
      var line = e.target.closest(".line");
      if (!line) return;
      var k = line.dataset.key;
      var input = line.querySelector("[data-line-qty]");
      if (e.target.closest("[data-line-remove]")) return remove(k);
      if (e.target.closest("[data-line-inc]")) return setQty(k, (parseInt(input.value, 10) || 1) + 1);
      if (e.target.closest("[data-line-dec]")) return setQty(k, (parseInt(input.value, 10) || 1) - 1);
    });
    root.addEventListener("change", function (e) {
      var input = e.target.closest("[data-line-qty]");
      if (!input) return;
      setQty(input.closest(".line").dataset.key, parseInt(input.value, 10) || 0);
    });
    var clear = document.querySelector("[data-cart-clear]");
    if (clear) clear.addEventListener("click", function () { write([]); });
  }

  /* --------------------------------------------------------- заявка из корзины */
  function bindOrder() {
    var form = document.querySelector("[data-order-form]");
    if (!form) return;
    var status = form.querySelector("[data-order-status]");
    var button = form.querySelector("[type=submit]");
    var endpoint = "https://luxauto-5588.pleshkovaleksey.workers.dev/";

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var list = read();
      if (!list.length) {
        if (status) status.textContent = "Корзина пуста.";
        return;
      }

      var f = new FormData(form);
      var t = totals(list);
      var lines = list.map(function (i, n) {
        return (n + 1) + ". " + i.name + " · " + i.sku +
          (i.colorName ? " · " + i.colorName : "") +
          " · " + i.qty + " шт. · " + money(i.price * i.qty);
      });

      var name = String(f.get("name") || "");
      var phone = String(f.get("phone") || "");
      var email = String(f.get("email") || "");
      var comment = String(f.get("comment") || "");
      var detail = ["AMANA GROUP — новый заказ из корзины"]
        .concat(lines)
        .concat(["Итого: " + money(t.sum), comment ? "Комментарий: " + comment : "", "Источник: " + location.href])
        .filter(Boolean)
        .join("\n");

      var payload = {
        source: "AMANA GROUP",
        type: "order",
        name: name,
        phone: phone,
        email: email,
        items: list,
        total: t.sum,
        page: location.href,
        brand: "AMANA GROUP",
        model: "Корзина · " + t.count + " поз.",
        service: "Новый заказ",
        date: new Date().toLocaleDateString("ru-RU"),
        plate: email,
        mileage: "",
        comment: detail
      };

      if (status) status.textContent = "Отправляем заказ…";
      if (button) button.disabled = true;
      fetch(endpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(payload)
      }).then(function () {
        if (status) status.textContent = "Заказ отправлен менеджеру AMANA в Telegram. Мы свяжемся с вами.";
        form.reset();
      }).catch(function () {
        if (status) status.textContent = "Не удалось отправить. Позвоните: +7 989 266 9 266.";
      }).then(function () {
        if (button) button.disabled = false;
      });
    });
  }

  /* -------------------------------------------------- коммерческое предложение */
  function renderOffer() {
    var root = document.querySelector("[data-offer-root]");
    if (!root) return;
    var list = read();
    var empty = document.querySelector("[data-offer-empty]");
    var doc = document.querySelector("[data-offer-doc]");
    if (empty) empty.hidden = list.length > 0;
    if (doc) doc.hidden = list.length === 0;

    root.innerHTML = list.map(function (i, n) {
      var shot = i.img
        ? '<img class="offer__shot" src="' + i.img + '" alt="" width="880" height="1100">'
        : "";
      return "<tr>" +
        "<td>" + (n + 1) + "</td>" +
        "<td>" + shot + "</td>" +
        "<td>" + i.sku + "</td>" +
        "<td><b>" + i.name + "</b><br><span class=\"offer__cat\">" + i.cat + "</span></td>" +
        "<td>" + (i.colorName || "—") + "</td>" +
        "<td class=\"num-cell\">" + i.qty +
          (i.pack ? " кор.<br><span class=\"offer__area\">" + area(i.qty * i.pack) + "</span>" : "") + "</td>" +
        "<td class=\"num-cell\">" + money(i.price) +
          (i.rate ? "<br><span class=\"offer__area\">" + money(i.rate) + "/м²</span>" : "") + "</td>" +
        "<td class=\"num-cell\">" + money(i.price * i.qty) + "</td>" +
      "</tr>";
    }).join("");
    paintSums(totals(list));

    var setText = function (sel, val) {
      var el = document.querySelector(sel);
      if (el && val) el.textContent = val;
    };
    setText("[data-lead-stock]", LEAD.stock);
    setText("[data-lead-order]", LEAD.order);
    setText("[data-lead-note]", LEAD.note);

    var d = new Date();
    var num = document.querySelector("[data-offer-number]");
    var date = document.querySelector("[data-offer-date]");
    var till = document.querySelector("[data-offer-till]");
    var pad = function (n) { return String(n).padStart(2, "0"); };
    var fmt = function (x) { return pad(x.getDate()) + "." + pad(x.getMonth() + 1) + "." + x.getFullYear(); };
    if (num && !num.textContent.trim()) {
      num.textContent = "№ " + String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) +
                        pad(d.getDate()) + "-" + pad(Math.floor(Math.random() * 90) + 10);
    }
    if (date) date.textContent = fmt(d);
    if (till) {
      var t = new Date(d.getTime() + 14 * 864e5);
      till.textContent = fmt(t);
    }
  }

  function bindOffer() {
    var print = document.querySelector("[data-offer-print]");
    if (print) print.addEventListener("click", function () { window.print(); });
  }

  /* ------------------------------------------------------------------ старт */
  function init() {
    bindShowcase();
    bindCart();
    bindOrder();
    bindOffer();
    renderCart();
    renderOffer();
    paintBadge();
    document.addEventListener("amana:cart", function () {
      paintBadge();
      renderCart();
      renderOffer();
    });
    window.addEventListener("storage", function (e) {
      if (e.key === KEY) { paintBadge(); renderCart(); renderOffer(); }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
