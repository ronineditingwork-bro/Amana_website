/* Тайная комната: машинка с иллюминатором и карта направления.
   Карта лежит под машинкой, машинка — сплошное полотно с дырой на месте
   люка. «Запуск» просто разгоняет это полотно мимо зрителя: дыра растёт,
   карта остаётся. Так переход выглядит как влёт в иллюминатор, но не
   требует ни морфинга, ни второго рисунка. */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var map = document.querySelector("[data-map]");
  var svg = document.getElementById("map");
  var cam = document.getElementById("camera");
  var machine = document.querySelector("[data-machine]");
  if (!svg || !cam) return;

  var box = svg.viewBox.baseVal;
  var view = { x: box.width / 2, y: box.height / 2, k: 1 };
  var MIN = 0.5, MAX = 3.2;

  /* Поле шире материка — вокруг него нарочно оставлено море. Показывать
     сразу середину поля нельзя: в кадр попадёт вода и обрезанный картуш.
     Начальный вид ставим по габаритам самой земли. */
  var bb = (svg.getAttribute("data-bbox") || "").split(" ").map(Number);

  function fit() {
    if (bb.length !== 4 || !bb[2]) return;
    var vw = svg.clientWidth || window.innerWidth;
    var vh = svg.clientHeight || window.innerHeight;
    var cover = Math.max(vw / box.width, vh / box.height);
    var landW = bb[2] - bb[0], landH = bb[3] - bb[1];
    // 0.94 — поля вокруг материка, чтобы он не упирался в края экрана
    var k = Math.min(vw / (landW * cover), vh / (landH * cover)) * 0.94;
    view.k = Math.max(MIN, Math.min(MAX, k));
    view.x = (bb[0] + bb[2]) / 2;
    view.y = (bb[1] + bb[3]) / 2;
  }

  /* Карта выведена с preserveAspectRatio=slice: она покрывает окно, а не
     вписывается в него. Значит один экранный пиксель — это не box.width
     на ширину элемента, а обратная величина от большего из двух
     масштабов. Без этого перетаскивание на телефоне уезжало боком. */
  function unitsPerPixel() {
    var sx = (svg.clientWidth || window.innerWidth) / box.width;
    var sy = (svg.clientHeight || window.innerHeight) / box.height;
    return 1 / (Math.max(sx, sy) * view.k);
  }

  function apply() {
    var u = unitsPerPixel();
    var halfW = (svg.clientWidth || window.innerWidth) * u / 2;
    var halfH = (svg.clientHeight || window.innerHeight) * u / 2;
    // держим карту в кадре: за край воды уезжать некуда. Если видно
    // больше, чем есть карты, — просто ставим её по центру
    view.x = halfW * 2 >= box.width ? box.width / 2
           : Math.max(halfW, Math.min(box.width - halfW, view.x));
    view.y = halfH * 2 >= box.height ? box.height / 2
           : Math.max(halfH, Math.min(box.height - halfH, view.y));
    cam.setAttribute("transform",
      "translate(" + (box.width / 2) + " " + (box.height / 2) + ") " +
      "scale(" + view.k + ") " +
      "translate(" + (-view.x) + " " + (-view.y) + ")");
  }

  function zoom(mult) {
    view.k = Math.max(MIN, Math.min(MAX, view.k * mult));
    apply();
  }

  /* ------------------------------------------------------- перетаскивание */

  var drag = null, moved = 0, pressed = null;

  svg.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY };
    moved = 0;
    // землю запоминаем здесь: ниже мы захватываем указатель на корневом
    // svg, и до самой земли событие click уже не доходит — цель события
    // подменяется элементом захвата
    pressed = e.target.closest ? e.target.closest(".land") : null;
    svg.setPointerCapture(e.pointerId);
    svg.classList.add("is-dragging");
  });

  svg.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var u = unitsPerPixel();
    view.x -= (e.clientX - drag.x) * u;
    view.y -= (e.clientY - drag.y) * u;
    moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
    drag = { x: e.clientX, y: e.clientY };
    apply();
  });

  function endDrag() { drag = null; svg.classList.remove("is-dragging"); }

  svg.addEventListener("pointerup", function (e) {
    var hit = pressed;
    endDrag();
    pressed = null;
    // короткое нажатие без протяжки — это выбор земли, а не перетаскивание
    if (hit && moved <= 6) showLand(hit);
    void e;
  });

  svg.addEventListener("pointercancel", function () { pressed = null; endDrag(); });

  svg.addEventListener("wheel", function (e) {
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }, { passive: false });

  var zoomBar = document.querySelector("[data-zoom]");
  var zin = document.querySelector("[data-zoom-in]");
  var zout = document.querySelector("[data-zoom-out]");
  if (zin) zin.addEventListener("click", function () { zoom(1.3); });
  if (zout) zout.addEventListener("click", function () { zoom(1 / 1.3); });

  /* -------------------------------------------------------------- запуск */

  function open() {
    if (root.classList.contains("k-open")) return;
    root.classList.add("k-open");
    if (zoomBar) zoomBar.hidden = false;
    if (machine) {
      // после ухода полотна оно не должно перехватывать клики по карте
      window.setTimeout(function () { machine.hidden = true; },
                        reduced ? 0 : 1100);
    }
  }

  var knob = document.querySelector("[data-start]");
  if (knob) {
    knob.addEventListener("click", open);
    knob.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  }
  if (machine) machine.addEventListener("click", open);

  /* ------------------------------------------------------- панель раздела */

  /* объявления подняты выше обработчиков указателя: pointerup вызывает
     showLand, а объявления var/function поднимаются интерпретатором */
  var panel = document.querySelector("[data-panel]");
  var pTitle = document.querySelector("[data-panel-title]");
  var pCodes = document.querySelector("[data-panel-codes]");
  var pPhoto = document.querySelector("[data-panel-photo]");
  var pSpecs = document.querySelector("[data-panel-specs]");
  var pNote = document.querySelector("[data-panel-note]");
  var pBack = document.querySelector("[data-panel-back]");
  var pEyebrow = document.querySelector("[data-panel-eyebrow]");
  var pPrice = document.querySelector("[data-panel-price]");
  var pDesc = document.querySelector("[data-panel-desc]");

  var MODELS = {};
  try {
    var raw = document.getElementById("vard-models");
    if (raw) MODELS = JSON.parse(raw.textContent);
  } catch (e) { MODELS = {}; }

  var lastLand = null;
  var askField = document.querySelector("[data-ask-field]");
  var current = "";

  function showLand(g) {
    if (!panel) return;
    current = g.getAttribute("data-title") || "";
    lastLand = g;
    if (pEyebrow) pEyebrow.textContent = "Раздел";
    if (pPrice) pPrice.hidden = true;
    if (pDesc) pDesc.hidden = true;
    if (pSpecs) pSpecs.hidden = true;
    if (pNote) pNote.hidden = true;
    if (pBack) pBack.hidden = true;
    pCodes.hidden = false;
    pTitle.textContent = current;
    var photo = g.getAttribute("data-photo") || "";
    if (pPhoto) {
      pPhoto.hidden = !photo;
      if (photo) {
        pPhoto.src = photo;
        pPhoto.alt = current + " — кадр из каталога VÄRD";
      }
    }
    pCodes.innerHTML = "";
    (g.getAttribute("data-codes") || "").split(" ").filter(Boolean)
      .forEach(function (code) {
        var li = document.createElement("li");
        li.className = "k-sku";
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute("data-model", code);
        b.textContent = code;
        li.appendChild(b);
        pCodes.appendChild(li);
      });
    Array.prototype.forEach.call(document.querySelectorAll(".land.is-on"),
      function (x) { x.classList.remove("is-on"); });
    g.classList.add("is-on");
    panel.hidden = false;
    root.classList.add("k-panel-on");
  }

  Array.prototype.forEach.call(document.querySelectorAll(".land"), function (g) {
    g.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showLand(g); }
    });
  });

  var pClose = document.querySelector("[data-panel-close]");
  if (pClose) pClose.addEventListener("click", function () {
    panel.hidden = true;
    root.classList.remove("k-panel-on");
    Array.prototype.forEach.call(document.querySelectorAll(".land.is-on"),
      function (x) { x.classList.remove("is-on"); });
  });

  /* ---------------------------------------------------------- меню и лист */

  var menu = document.querySelector("[data-menu]");
  var sheet = document.querySelector("[data-sheet]");
  var sheetName = document.querySelector("[data-sheet-name]");

  function setHidden(el, v) { if (el) el.hidden = v; }

  var mOpen = document.querySelector("[data-menu-open]");
  var mClose = document.querySelector("[data-menu-close]");
  if (mOpen) mOpen.addEventListener("click", function () { setHidden(menu, false); });
  if (mClose) mClose.addEventListener("click", function () { setHidden(menu, true); });

  function openSheet(id, name) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-part]"),
      function (s) { s.hidden = s.id !== id; });
    if (sheetName) sheetName.textContent = name;
    setHidden(menu, true);
    setHidden(sheet, false);
    sheet.scrollTop = 0;
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-goto]"),
    function (b) {
      b.addEventListener("click", function () {
        openSheet(b.getAttribute("data-goto"),
                  b.querySelector("span").textContent);
      });
    });

  var sClose = document.querySelector("[data-sheet-close]");
  if (sClose) sClose.addEventListener("click", function () { setHidden(sheet, true); });

  // «Запросить подбор» из панели: несём раздел в форму, чтобы заявка
  // приходила с указанием, чем интересуются
  var ask = document.querySelector("[data-ask]");
  if (ask) ask.addEventListener("click", function () {
    if (askField) askField.value = current;
    openSheet("k-form", "Заявка");
  });


  /* ------------------------------------------------------- карточка модели */

  /* «✓» и «X» из таблиц каталога словами: галочка в столбце читается,
     только когда рядом виден столбец, а в карточке его нет */
  function value(v) {
    if (v === "✓") return "есть";
    if (v === "X" || v === "x") return "нет";
    return v;
  }

  /* 139990 → «139 990»: неразрывный пробел, чтобы цена не рвалась
     по строкам в узкой панели. */
  function money(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  }

  function showModel(code) {
    var m = MODELS[code];
    if (!m || !panel) return;
    current = code;
    if (pEyebrow) pEyebrow.textContent = m.section;
    pTitle.textContent = m.name || code;
    if (pPrice) {
      pPrice.hidden = false;
      var sku = m.sku ? "<span>Артикул " + m.sku + "</span>" : "";
      // пять моделей каталога 2025 в прайс 2026 не попали: честнее
      // написать «по запросу», чем подставить цену соседней отделки
      pPrice.className = m.price ? "k-price" : "k-price k-price--ask";
      pPrice.innerHTML = (m.price ? money(m.price) + " ₽" : "Цена по запросу")
        + sku;
    }
    if (pPhoto) {
      pPhoto.hidden = !m.photo;
      if (m.photo) { pPhoto.src = m.photo; pPhoto.alt = m.section; }
    }
    pCodes.hidden = true;
    /* Позиции из прайса 2026 в каталог 2025 не попали, таблицы у них
       нет. Показываем описание поставщика — это лучше пустого места. */
    var bare = !Object.keys(m.specs || {}).length;
    if (pDesc) {
      var only = m.desc && bare;
      pDesc.hidden = !only;
      if (only) pDesc.textContent = m.desc;
    }
    // оговорка под карточкой говорит о том источнике, который виден
    if (pNote) {
      var key = bare ? "noteDesc" : "noteSpecs";
      if (pNote.dataset[key]) pNote.textContent = pNote.dataset[key];
    }
    if (pSpecs) {
      pSpecs.innerHTML = "";
      var keys = Object.keys(m.specs || {});
      keys.forEach(function (k) {
        var dt = document.createElement("dt");
        dt.textContent = k;
        var dd = document.createElement("dd");
        dd.textContent = value(m.specs[k]);
        pSpecs.appendChild(dt);
        pSpecs.appendChild(dd);
      });
      if (m.name && m.name !== code) {
        var dt2 = document.createElement("dt");
        dt2.textContent = "Артикул";
        var dd2 = document.createElement("dd");
        dd2.textContent = code;
        pSpecs.insertBefore(dd2, pSpecs.firstChild);
        pSpecs.insertBefore(dt2, pSpecs.firstChild);
      }
      pSpecs.hidden = !keys.length;
    }
    if (pNote) pNote.hidden = false;
    if (pBack) pBack.hidden = !lastLand;
    panel.hidden = false;
    root.classList.add("k-panel-on");
    panel.scrollTop = 0;
  }

  /* Делегируем на документ: коды в панели создаются на лету, вешать на
     каждую кнопку свой обработчик незачем */
  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("[data-model]") : null;
    if (!b) return;
    var code = b.getAttribute("data-model");
    if (MODELS[code]) {
      setHidden(sheet, true);
      showModel(code);
    } else {
      if (askField) askField.value = code;
      openSheet("k-form", "Заявка");
    }
  });

  if (pBack) pBack.addEventListener("click", function () {
    if (lastLand) showLand(lastLand);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (sheet && !sheet.hidden) { setHidden(sheet, true); return; }
    if (menu && !menu.hidden) { setHidden(menu, true); return; }
    if (panel && !panel.hidden && pClose) pClose.click();
  });

  /* Подпись земли должна помещаться в её границы. Коробку — наибольший
     прямоугольник внутри территории — считает генератор карты; здесь
     название переносим на строки и ужимаем под эту коробку.

     Меряем в браузере, а не прикидываем по числу знаков: ширина строки
     зависит от шрифта, трекинга и того, какие буквы попались. */
  function fitPins() {
    var pins = document.querySelectorAll(".pin");
    for (var i = 0; i < pins.length; i++) {
      var pin = pins[i];
      var bw = +pin.getAttribute("data-w");
      var bh = +pin.getAttribute("data-h");
      var name = pin.querySelector(".pin__name");
      var num = pin.querySelector(".pin__n");
      if (!bw || !bh || !name) continue;

      var full = name.getAttribute("data-full");
      if (full === null) {
        full = name.textContent.trim();
        name.setAttribute("data-full", full);
      }
      var words = tokens(full);
      var base = 17;
      // внутренние поля, чтобы буквы не упирались в границу
      var roomW = bw - 16;
      var roomH = bh - 12;

      var best = null;
      var maxLines = Math.min(3, words.length);
      for (var n = 1; n <= maxLines; n++) {
        var lines = splitLines(words, n);
        if (lines.length !== n) continue;
        write(name, lines, base);
        var widest = 0;
        for (var j = 0; j < n; j++) {
          var len = name.childNodes[j].getComputedTextLength();
          if (len > widest) widest = len;
        }
        if (!widest) continue;
        // счётчик моделей занимает ещё строку под названием
        var tall = n * base * 1.16 + (num ? base * 0.9 : 0);
        var k = Math.min(roomW / widest, roomH / tall, 1);
        // меньше строк при прочих равных читается лучше
        if (!best || k > best.k + 0.02) best = { k: k, lines: lines };
      }
      if (!best) continue;

      // ниже 8 единиц подпись уже не прочесть — пусть лучше чуть вылезет
      var size = Math.max(base * best.k, 8);
      place(name, num, best.lines, size);

      /* Контрольный замер по факту: расчёт ведётся по длине строки, а
         рамка знака шире неё на обводку-подложку и на трекинг
         последней буквы. Дожимаем, пока подпись не войдёт в землю. */
      for (var pass = 0; pass < 4; pass++) {
        var bb = name.getBBox();
        if (bb.width <= bw - 4 && bb.height <= bh - 4) break;
        var k2 = Math.min((bw - 4) / bb.width, (bh - 4) / bb.height) * 0.98;
        var next = Math.max(size * k2, 8);
        if (next >= size - 0.1) break;
        size = next;
        place(name, num, best.lines, size);
      }
    }
  }

  function place(name, num, lines, size) {
    write(name, lines, size);
    var lh = size * 1.16;
    var top = -((lines.length - 1) * lh) / 2 + size * 0.34;
    name.setAttribute("y", top.toFixed(1));
    if (num) {
      num.setAttribute("y",
        (top + (lines.length - 1) * lh + size * 1.05).toFixed(1));
      num.style.fontSize = (size * 0.68).toFixed(1) + "px";
      num.removeAttribute("dy");
    }
  }

  /* Слова для переноса: длинное составное имя рвём по дефису, иначе
     «СТИРАЛЬНО-СУШИЛЬНЫЕ» не влезает ни в одну строку. */
  function tokens(text) {
    var out = [];
    var parts = text.split(/\s+/);
    for (var i = 0; i < parts.length; i++) {
      var bits = parts[i].split("-");
      for (var j = 0; j < bits.length; j++) {
        if (!bits[j]) continue;
        out.push(j < bits.length - 1 ? bits[j] + "-" : bits[j]);
      }
    }
    return out;
  }

  /* Делим слова на n строк так, чтобы длины строк были близки. */
  function splitLines(words, n) {
    if (n === 1) return [join(words)];
    var total = 0;
    for (var i = 0; i < words.length; i++) total += words[i].length + 1;
    var target = total / n;
    var lines = [], cur = [], len = 0;
    for (var j = 0; j < words.length; j++) {
      var add = words[j].length + 1;
      var left = words.length - j;
      // хватит ли слов на оставшиеся строки
      if (cur.length && len + add > target && lines.length < n - 1 &&
          left > n - 1 - lines.length) {
        lines.push(join(cur));
        cur = []; len = 0;
      }
      cur.push(words[j]); len += add;
    }
    if (cur.length) lines.push(join(cur));
    return lines;
  }

  /* После части с дефисом пробел не нужен: дефис уже на ней. */
  function join(words) {
    var out = "";
    for (var i = 0; i < words.length; i++) {
      if (i && out.charAt(out.length - 1) !== "-") out += " ";
      out += words[i];
    }
    return out;
  }

  /* Кегль ставим стилем, а не атрибутом: правило в таблице стилей
     перебивает презентационный атрибут, и подпись оставалась крупной. */
  function write(el, lines, size) {
    while (el.firstChild) el.removeChild(el.firstChild);
    for (var i = 0; i < lines.length; i++) {
      var ts = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      ts.setAttribute("x", "0");
      if (i) ts.setAttribute("dy", (size * 1.16).toFixed(1));
      ts.textContent = lines[i];
      el.appendChild(ts);
    }
    el.style.fontSize = size.toFixed(1) + "px";
  }

  var fitted = false;
  window.addEventListener("resize", function () {
    // пока карту не трогали, держим её вписанной; после — не дёргаем вид
    if (!fitted) fit();
    apply();
  });

  fit();
  apply();
  fitPins();
  // первый замер мог пройти по запасному начертанию: у него другая
  // ширина, и подпись легла бы мимо границ
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitPins);
  }

  svg.addEventListener("pointerdown", function () { fitted = true; });
  svg.addEventListener("wheel", function () { fitted = true; }, { passive: true });
  // без скриптов и до запуска карта видна в люке — это её исходный кадр
  void map;
})();
