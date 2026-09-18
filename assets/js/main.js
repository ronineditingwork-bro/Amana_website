/* AMANA GROUP — interaction layer.
   Everything here is progressive enhancement: without JS the site is a
   complete, readable, navigable document. */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------ line masks */
  // Wrap each visual line of a heading so it can wipe up from behind a mask.
  var sourceText = new WeakMap();

  function split(el) {
    if (!sourceText.has(el)) {
      // <br> carries no text of its own — turn it into a space first.
      var raw = el.innerHTML.replace(/<br\s*\/?>/gi, " ");
      var probe = document.createElement("div");
      probe.innerHTML = raw;
      sourceText.set(el, probe.textContent.replace(/\s+/g, " ").trim());
    }
    var words = sourceText.get(el).split(" ");
    var frag = document.createDocumentFragment();
    words.forEach(function (w, i) {
      var s = document.createElement("span");
      s.className = "word";
      s.textContent = w;
      frag.appendChild(s);
      if (i < words.length - 1) frag.appendChild(document.createTextNode(" "));
    });
    el.textContent = "";
    el.appendChild(frag);

    // group the words into lines by the top of their line box
    var lines = [], current = null, top = null;
    Array.prototype.forEach.call(el.querySelectorAll(".word"), function (w) {
      if (top === null || Math.abs(w.offsetTop - top) > 2) {
        top = w.offsetTop;
        current = [];
        lines.push(current);
      }
      current.push(w.textContent);
    });

    el.textContent = "";
    lines.forEach(function (line, i) {
      var outer = document.createElement("span");
      outer.className = "line-mask";
      var inner = document.createElement("span");
      inner.textContent = line.join(" ");
      inner.style.transitionDelay = i * 90 + "ms";
      outer.appendChild(inner);
      el.appendChild(outer);
    });
  }

  function setupSplits() {
    if (reduced) return;
    Array.prototype.forEach.call(document.querySelectorAll("[data-split]"), function (el) {
      var wasIn = el.classList.contains("is-in");
      split(el);
      if (wasIn) {
        Array.prototype.forEach.call(el.querySelectorAll(".line-mask"), function (l) {
          l.classList.add("is-in");
        });
      }
    });
  }

  /* --------------------------------------------------------------- reveals */
  function show(el) {
    el.classList.add("is-in");
    Array.prototype.forEach.call(el.querySelectorAll(".line-mask"), function (l) {
      l.classList.add("is-in");
    });
  }

  function setupReveals() {
    var items = Array.prototype.slice.call(
      document.querySelectorAll("[data-reveal], [data-split]"));

    if (!("IntersectionObserver" in window) || reduced) {
      items.forEach(show);
      Array.prototype.forEach.call(document.querySelectorAll(".line-mask"), function (el) {
        el.classList.add("is-in");
      });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        show(e.target);
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0 });

    // Anything already on the first screen plays as a load-in sequence rather
    // than waiting for a scroll that may never come.
    var intro = [], vh = window.innerHeight;
    items.forEach(function (el) {
      if (el.parentElement && el.parentElement.hasAttribute("data-stagger")) {
        el.style.setProperty("--i", Array.prototype.indexOf.call(el.parentElement.children, el));
      }
      if (!el.offsetParent && el.offsetWidth === 0 && el.offsetHeight === 0) return;
      if (el.getBoundingClientRect().top < vh - 8) intro.push(el);
      else io.observe(el);
    });
    intro.forEach(function (el, i) {
      setTimeout(function () { show(el); }, 260 + i * 110);
    });
  }

  /* ---------------------------------------------------------------- header */
  function setupHeader() {
    var header = document.querySelector(".header");
    if (!header) return;
    var last = window.scrollY, ticking = false;

    function update() {
      var y = window.scrollY;
      header.classList.toggle("is-solid", y > 24);
      if (!root.classList.contains("is-menu-open")) {
        header.classList.toggle("is-hidden", y > 320 && y > last + 4);
      }
      last = y;
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ------------------------------------------------------------------ menu */
  function setupMenu() {
    var burger = document.querySelector(".burger");
    var menu = document.getElementById("menu");
    if (!burger || !menu) return;
    function toggle(open) {
      root.classList.toggle("is-menu-open", open);
      burger.setAttribute("aria-expanded", String(open));
      menu.setAttribute("aria-hidden", String(!open));
      document.body.style.overflow = open ? "hidden" : "";
      Array.prototype.forEach.call(menu.querySelectorAll(".menu__list a"), function (a, i) {
        a.style.transitionDelay = open ? 120 + i * 60 + "ms" : "0ms";
      });
    }
    burger.addEventListener("click", function () {
      toggle(!root.classList.contains("is-menu-open"));
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) toggle(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && root.classList.contains("is-menu-open")) toggle(false);
    });
    toggle(false);
  }

  /* ---------------------------------------------------------------- поиск */
  // Указатель лежит отдельным файлом и тянется по первому открытию: класть
  // 270 КБ в каждую страницу ради строки поиска незачем.
  function setupSearch() {
    var panel = document.getElementById("search");
    var input = document.querySelector("[data-search-input]");
    var list = document.querySelector("[data-search-results]");
    var hint = document.querySelector("[data-search-hint]");
    if (!panel || !input || !list) return;

    var index = null, loading = null, active = -1, last = "";

    function key(s) { return String(s).toUpperCase().replace(/[^A-Z0-9А-ЯЁ]/g, ""); }

    function load() {
      if (index || loading) return loading || Promise.resolve();
      loading = fetch("assets/search-index.json")
        .then(function (r) { return r.json(); })
        .then(function (rows) {
          index = rows.map(function (r) {
            return { r: r, k: key(r.s), n: r.n.toLowerCase() };
          });
          if (last) render(last);
        })
        .catch(function () {
          hint.textContent = "Указатель поиска не загрузился — обновите страницу.";
        });
      return loading;
    }

    function open(yes) {
      panel.hidden = !yes;
      root.classList.toggle("is-search-open", yes);
      document.body.style.overflow = yes ? "hidden" : "";
      Array.prototype.forEach.call(document.querySelectorAll("[data-search-open]"),
        function (b) { b.setAttribute("aria-expanded", String(yes)); });
      if (yes) { load(); input.focus(); input.select(); }
    }

    function money(n) {
      return n ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "\u2009") + "\u2009\u20bd" : "";
    }

    function find(q) {
      var qk = key(q), ql = q.toLowerCase().trim(), out = [];
      for (var i = 0; i < index.length && out.length < 24; i++) {
        var it = index[i], rank = -1;
        if (qk && it.k.indexOf(qk) >= 0) rank = 0;          // артикул — точнее всего
        else if (ql && it.n.indexOf(ql) >= 0) rank = 1;
        if (rank >= 0) out.push({ it: it.r, rank: rank });
      }
      out.sort(function (a, b) { return a.rank - b.rank; });
      return out.slice(0, 12);
    }

    function render(q) {
      last = q;
      active = -1;
      if (!index) { list.innerHTML = ""; hint.textContent = "Загружаем указатель…"; return; }
      if (!q.trim()) {
        list.innerHTML = "";
        hint.textContent = "Ищем по артикулу и названию во всех брендах.";
        return;
      }
      var hits = find(q);
      if (!hits.length) {
        list.innerHTML = "";
        hint.textContent = "Ничего не нашли по запросу «" + q + "».";
        return;
      }
      hint.textContent = hits.length + (hits.length === 1 ? " совпадение" :
                         hits.length < 5 ? " совпадения" : " совпадений");
      list.innerHTML = hits.map(function (h, i) {
        var r = h.it;
        var skus = r.s.split(" ");
        var shown = skus.slice(0, 3).join(", ") + (skus.length > 3 ? " и ещё " + (skus.length - 3) : "");
        return '<li><a class="search__hit" href="' + r.h + '" data-i="' + i + '">' +
               '<span class="search__name">' + r.n + "</span>" +
               '<span class="search__meta">' + r.b + " · " + r.c + "</span>" +
               '<span class="search__sku">' + shown + "</span>" +
               '<span class="search__price">' + (r.p ? "от " + money(r.p) : "") + "</span>" +
               "</a></li>";
      }).join("");
    }

    function move(step) {
      var hits = list.querySelectorAll(".search__hit");
      if (!hits.length) return;
      active = (active + step + hits.length) % hits.length;
      Array.prototype.forEach.call(hits, function (a, i) {
        a.classList.toggle("is-active", i === active);
      });
      hits[active].scrollIntoView({ block: "nearest" });
    }

    Array.prototype.forEach.call(document.querySelectorAll("[data-search-open]"),
      function (b) {
        b.addEventListener("click", function (e) { e.preventDefault(); open(true); });
      });
    var close = document.querySelector("[data-search-close]");
    if (close) close.addEventListener("click", function () { open(false); });
    panel.addEventListener("click", function (e) {
      if (e.target === panel) open(false);
    });
    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") {
        var hits = list.querySelectorAll(".search__hit");
        var go = hits[active >= 0 ? active : 0];
        if (go) { e.preventDefault(); window.location.href = go.getAttribute("href"); }
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && root.classList.contains("is-search-open")) open(false);
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ""));
      if (!typing && (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "k"))) {
        e.preventDefault(); open(true);
      }
    });
    open(false);
  }

  /* -------------------------------------------------------------- parallax */
  function setupParallax() {
    if (reduced || window.matchMedia("(max-width: 900px)").matches) return;
    var items = Array.prototype.slice.call(document.querySelectorAll("[data-parallax]"));
    if (!items.length) return;
    var ticking = false;

    function frame() {
      var vh = window.innerHeight;
      items.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        var amount = parseFloat(el.dataset.parallax) || 0.08;
        var progress = (r.top + r.height / 2 - vh / 2) / vh;
        var target = el.querySelector("img") || el;
        target.style.transform = "translate3d(0," + (-progress * amount * 100).toFixed(2) + "px,0) scale(1.08)";
      });
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(frame); }
    }, { passive: true });
    window.addEventListener("resize", frame, { passive: true });
    frame();
  }

  /* ----------------------------------------------------- page transitions */
  function setupTransitions() {
    if (reduced) return;

    document.addEventListener("click", function (e) {
      var a = e.target.closest("a");
      if (!a) return;
      var href = a.getAttribute("href");
      if (!href || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      if (a.target === "_blank" || a.hasAttribute("download")) return;
      if (href.charAt(0) === "#" || /^(mailto:|tel:|https?:)/.test(href)) {
        if (a.hostname && a.hostname !== window.location.hostname) return;
        if (href.charAt(0) === "#") return;
      }
      if (a.origin && a.origin !== window.location.origin) return;
      e.preventDefault();
      root.classList.add("is-leaving");
      var go = function () { window.location.href = a.href; };
      setTimeout(go, 460);
    });

    window.addEventListener("pageshow", function (e) {
      if (e.persisted) root.classList.remove("is-leaving");
    });
  }

  /* -------------------------------------------------------------- catalog */
  // Каталог держит три витрины — по одной на бренд. Бренд переключает
  // витрину и прячет группы фильтров, которые к ней не относятся;
  // остальные группы отбирают карточки внутри активной витрины.
  function setupCatalog() {
    var scope = document.querySelector("[data-catalog]");
    if (!scope) return;
    var cards = Array.prototype.slice.call(scope.querySelectorAll("[data-tags]"));
    var buttons = Array.prototype.slice.call(scope.querySelectorAll("button.filter__btn[data-group]"));
    var grids = Array.prototype.slice.call(scope.querySelectorAll("[data-brand-grid]"));
    var counter = scope.querySelector("[data-count]");
    var label = scope.querySelector("[data-brand-label]");
    var BRAND_LABEL = {
      deante: "Deante · Польша",
      italon: "Italon · керамогранит",
      kkpol: "KK POL · инженерия",
      whitecross: "WHITECROSS · Польша"
    };
    var state = { brand: "deante", collection: "all", category: "all", finish: "all",
                  line: "all", effect: "all", format: "all",
                  kkkind: "all", kkcoll: "all", kkfinish: "all",
                  wcsec: "all", wccoll: "all", wcfinish: "all" };
    var GROUPS = {
      deante: ["collection", "category", "finish"],
      italon: ["line", "effect", "format"],
      kkpol: ["kkkind", "kkcoll", "kkfinish"],
      whitecross: ["wcsec", "wccoll", "wcfinish"]
    };

    function apply() {
      var live = GROUPS[state.brand] || [];
      var shown = 0;
      cards.forEach(function (card) {
        var tags = card.dataset.tags.split(/\s+/);
        var ok = tags.indexOf(state.brand) > -1 || (state.brand === "deante" &&
                 !card.hasAttribute("data-brand-card"));
        if (ok) {
          ok = live.every(function (g) {
            return state[g] === "all" || tags.indexOf(state[g]) > -1;
          });
        }
        card.classList.toggle("is-hidden", !ok);
        if (ok) shown++;
      });
      grids.forEach(function (g) {
        g.hidden = g.dataset.brandGrid !== state.brand;
        // витрина скрыта на старте, поэтому наблюдатель появления её не видел
        if (!g.hidden) {
          Array.prototype.forEach.call(g.querySelectorAll("[data-reveal]"), function (el) {
            el.classList.add("is-in");
          });
        }
      });
      Array.prototype.forEach.call(scope.querySelectorAll("[data-brand-group]"), function (g) {
        g.hidden = g.dataset.brandGroup !== state.brand;
      });
      Array.prototype.forEach.call(scope.querySelectorAll(".filters__groups > div"), function (g) {
        var own = g.querySelector("button.filter__btn[data-group]");
        if (!own || g.hasAttribute("data-brand-group")) return;
        var grp = own.dataset.group;
        if (grp === "brand") return;
        g.hidden = live.indexOf(grp) === -1;
      });
      if (counter) counter.textContent = String(shown).padStart(2, "0");
      if (label) label.textContent = BRAND_LABEL[state.brand] || "";
      buttons.forEach(function (b) {
        b.setAttribute("aria-pressed", String(state[b.dataset.group] === b.dataset.value));
      });
    }

    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        state[b.dataset.group] = b.dataset.value;
        if (b.dataset.group === "brand") {
          ["collection", "category", "finish", "line", "effect", "format",
           "kkkind", "kkcoll", "kkfinish", "wcsec", "wccoll", "wcfinish"]
            .forEach(function (g) { state[g] = "all"; });
        }
        apply();
      });
    });

    // Ссылки вида catalog.html?b=italon и catalog.html?c=blur открывают
    // каталог сразу отобранным.
    var q = new URLSearchParams(location.search);
    var pb = q.get("b"), pc = q.get("c");
    if (pb && GROUPS[pb]) state.brand = pb;
    if (pc && buttons.some(function (b) {
      return b.dataset.group === "collection" && b.dataset.value === pc;
    })) { state.brand = "deante"; state.collection = pc; }

    var toggle = scope.querySelector(".filters__toggle");
    if (toggle) {
      toggle.addEventListener("click", function () {
        var panel = toggle.closest(".filters");
        var open = panel.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(open));
      });
    }
    apply();
  }

  /* ----------------------------------------------------- фильтр витрин-сеток */
  // Чипы над сеткой — ссылки на её якорь: без JS они просто ведут к сетке,
  // с JS отбирают карточки. Группа задаётся на списке чипов
  // (data-filter-group), а карточка несёт свои значения в data-filter-<группа>.
  // Внутри группы условия складываются по «или», между группами — по «и».
  function setupCollectionFilter() {
    var root = document.querySelector("[data-collections]");
    if (!root) return;
    var cards = Array.prototype.slice.call(root.querySelectorAll("[data-filter-card]"));
    var lines = Array.prototype.slice.call(root.querySelectorAll(".tile-line"));
    var groups = Array.prototype.slice.call(document.querySelectorAll("[data-filter-group]"));
    var chips = [];
    groups.forEach(function (g) {
      chips = chips.concat(Array.prototype.slice.call(g.querySelectorAll(".chip")));
    });
    if (!cards.length || !chips.length) return;

    var state = {};
    groups.forEach(function (g) { state[g.dataset.filterGroup] = []; });
    var count = root.querySelector("[data-collections-count]");
    var reset = root.querySelector("[data-collections-reset]");

    function plural(n, one, few, many) {
      var n10 = n % 10, n100 = n % 100;
      if (n10 === 1 && n100 !== 11) return one;
      if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
      return many;
    }

    // Карточка, вернувшаяся из-под фильтра, могла ни разу не попасть в поле
    // зрения наблюдателя — показываем её сразу, без анимации появления.
    function settle(card) {
      if (card.hasAttribute("data-reveal")) card.classList.add("is-in");
      Array.prototype.forEach.call(card.querySelectorAll("[data-reveal]"), function (el) {
        el.classList.add("is-in");
      });
    }

    function groupOf(chip) {
      return chip.closest("[data-filter-group]").dataset.filterGroup;
    }

    function matches(card, group) {
      if (!state[group].length) return true;
      var key = "filter" + group.charAt(0).toUpperCase() + group.slice(1);
      var have = (card.dataset[key] || "").split(/\s+/).filter(Boolean);
      return state[group].some(function (v) { return have.indexOf(v) > -1; });
    }

    function apply() {
      var shown = 0, active = 0;
      Object.keys(state).forEach(function (g) { active += state[g].length; });
      cards.forEach(function (card) {
        var ok = Object.keys(state).every(function (g) { return matches(card, g); });
        card.hidden = !ok;
        if (ok) { settle(card); shown++; }
      });
      lines.forEach(function (line) {
        var all = Array.prototype.slice.call(line.querySelectorAll("[data-filter-card]"));
        var open = all.filter(function (c) { return !c.hidden; }).length;
        line.hidden = !open;
        var badge = line.querySelector(".tile-line__count");
        if (badge) {
          if (!badge.dataset.total) badge.dataset.total = badge.textContent;
          badge.textContent = open === all.length
            ? badge.dataset.total
            : (open < 10 ? "0" + open : String(open)) + " " +
              plural(open, badge.dataset.one || "коллекция",
                     badge.dataset.few || "коллекции",
                     badge.dataset.many || "коллекций");
        }
      });
      chips.forEach(function (chip) {
        chip.setAttribute("aria-pressed",
          String(state[groupOf(chip)].indexOf(chip.dataset.filter) > -1));
      });
      if (count) {
        count.textContent = active
          ? shown + " из " + cards.length
          : "все " + cards.length;
      }
      if (reset) reset.hidden = !active;
      root.classList.toggle("is-filtered", active > 0);
    }

    chips.forEach(function (chip) {
      chip.addEventListener("click", function (e) {
        e.preventDefault();
        var group = groupOf(chip), v = chip.dataset.filter;
        var at = state[group].indexOf(v);
        if (at > -1) state[group].splice(at, 1);
        else state[group].push(v);
        apply();
        root.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    if (reset) {
      reset.addEventListener("click", function (e) {
        e.preventDefault();
        Object.keys(state).forEach(function (g) { state[g] = []; });
        apply();
      });
    }
    apply();
  }

  /* -------------------------------------------------------------- finishes */
  function setupSwatches() {
    var group = document.querySelector("[data-swatches]");
    if (!group) return;
    var label = document.querySelector("[data-swatch-label]");
    var swatches = Array.prototype.slice.call(group.querySelectorAll(".swatch"));
    swatches.forEach(function (s) {
      s.addEventListener("click", function () {
        swatches.forEach(function (o) { o.setAttribute("aria-pressed", String(o === s)); });
        if (label) label.textContent = s.dataset.name || "";
      });
    });
  }

  /* ------------------------------------------------------------------ form */
  /* ---------------------------------------------------------------- форма */
  // Сайт статический, письма отправлять некому. Если задан data-endpoint —
  // отдаём заявку ему фоном; если нет — открываем письмо в почте гостя на
  // адрес из data-mailto. Пустая кнопка хуже обоих вариантов.
  function setupForm() {
    var form = document.querySelector("[data-form]");
    if (!form) return;
    var status = form.querySelector(".form__status");
    var button = form.querySelector("[type=submit]");

    function say(key) {
      if (!status) return;
      status.textContent = status.dataset[key] || "";
      status.classList.toggle("is-shown", !!status.textContent);
    }

    function letter() {
      var to = form.dataset.mailto;
      if (!to) return false;
      var f = new FormData(form);
      var LABEL = { name: "Имя", company: "Компания", email: "E-mail",
                    phone: "Телефон", topic: "Тема", message: "Сообщение" };
      var lines = [];
      f.forEach(function (v, k) {
        if (String(v).trim()) lines.push((LABEL[k] || k) + ": " + v);
      });
      var subject = "Заявка с сайта — " + (f.get("topic") || "Amana Group");
      window.location.href = "mailto:" + to +
        "?subject=" + encodeURIComponent(subject) +
        "&body=" + encodeURIComponent(lines.join("\n"));
      return true;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var endpoint = form.dataset.endpoint;
      if (!endpoint) {
        say(letter() ? "mail" : "failed");
        return;
      }
      say("sending");
      if (button) button.disabled = true;
      fetch(endpoint, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" }
      }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        form.reset();
        say("sent");
      }).catch(function () {
        // не дошло — не теряем заявку, отдаём её почте гостя
        say(letter() ? "mail" : "failed");
      }).then(function () {
        if (button) button.disabled = false;
      });
    });
  }

  /* ------------------------------------------------------------------ boot */
  function init() {
    setupSplits();
    setupReveals();
    setupHeader();
    setupMenu();
    setupSearch();
    setupParallax();
    setupTransitions();
    setupCatalog();
    setupCollectionFilter();
    setupSwatches();
    setupForm();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Content revealed after load (a route swap, injected markup) can ask for the
  // same measuring pass.
  document.addEventListener("amana:refresh", function () {
    setupSplits();
    setupReveals();
    setupParallax();
  });

  // Webfonts can reflow a heading after it was split; re-measure once they land.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(setupSplits);
  }

})();
