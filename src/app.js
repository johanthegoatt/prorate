// Prorate app: read the form, run the engine, show the four methods, the
// day-one cheque and the two traps. State lives in the URL fragment so a
// breakdown can be shared as a link without anything leaving the browser.
(function () {
  "use strict";
  var E = window.Prorate;
  var $ = function (id) { return document.getElementById(id); };

  var els = {
    segIn: $("seg-in"), segOut: $("seg-out"),
    rent: $("rent"), date: $("date"), keyday: $("keyday"),
    dateLabel: $("date-label"), keydayLabel: $("keyday-label"),
    deposit: $("deposit"), lastmonth: $("lastmonth"), fees: $("fees"),
    stepFirst: $("step-first"),
    method: $("method"),
    sub: $("sub"), methods: $("methods"), spread: $("spread"),
    cheque: $("cheque"), chequeLines: $("cheque-lines"),
    traps: $("traps"), trapList: $("trap-list"),
    copy: $("copy"), share: $("share"), status: $("status"),
    cur: $("cur")
  };

  var mode = "movein";
  var sym = guessSymbol();
  els.cur.textContent = sym;
  Array.prototype.forEach.call(document.querySelectorAll(".cur"), function (n) { n.textContent = sym; });

  function guessSymbol() {
    var lang = (navigator.language || "en-US").toLowerCase();
    if (/-gb$/.test(lang)) return "£";
    if (/-(ie|de|fr|es|it|nl|pt|at|be|fi|gr)$/.test(lang)) return "€";
    if (/-ph$/.test(lang)) return "₱";
    if (/-in$/.test(lang)) return "₹";
    return "$";
  }

  function money(n) {
    var v = Math.round((n + Number.EPSILON) * 100) / 100;
    return sym + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function setMode(next, fromUser) {
    mode = next === "moveout" ? "moveout" : "movein";
    var isIn = mode === "movein";
    els.segIn.classList.toggle("on", isIn);
    els.segOut.classList.toggle("on", !isIn);
    els.segIn.setAttribute("aria-checked", String(isIn));
    els.segOut.setAttribute("aria-checked", String(!isIn));
    els.dateLabel.textContent = isIn ? "Day you get the keys" : "Your last day";
    els.keydayLabel.textContent = isIn
      ? "Count the day you get the keys (you have them, so you pay for it)"
      : "Count your last night (you're still there, so you pay for it)";
    els.stepFirst.hidden = !isIn;
    if (fromUser && window.Kee) Kee.react(isIn ? "movein" : "moveout");
    render();
  }

  els.segIn.addEventListener("click", function () { setMode("movein", true); });
  els.segOut.addEventListener("click", function () { setMode("moveout", true); });

  els.keyday.addEventListener("change", function () {
    if (!els.keyday.checked && window.Kee) Kee.react("keyday:off");
    render();
  });
  els.method.addEventListener("change", function () {
    if (els.method.value === "thirty" && window.Kee) Kee.react("method:thirty");
    render();
  });
  ["rent", "date", "deposit", "lastmonth", "fees"].forEach(function (k) {
    els[k].addEventListener("input", render);
  });

  function current() {
    return {
      rent: els.rent.value,
      date: els.date.value,
      mode: mode,
      method: els.method.value,
      countKeyDay: els.keyday.checked,
      deposit: els.deposit.value,
      lastMonth: els.lastmonth.value,
      fees: els.fees.value
    };
  }

  var lastResult = null;

  function render() {
    var input = current();
    var r = E.prorate(input);
    var hasRent = String(input.rent).trim() !== "";
    var hasDate = String(input.date).trim() !== "";

    els.rent.setAttribute("aria-invalid", hasRent && r.error === "rent" ? "true" : "false");

    if (r.error) {
      lastResult = null;
      els.sub.textContent = "";
      els.methods.innerHTML = "<p class='hint'>" +
        (!hasRent || !hasDate ? "Enter the rent and the date to see the breakdown."
          : r.error === "rent" ? "That rent doesn't look like a number."
          : "That date can't be right.") + "</p>";
      els.spread.textContent = "";
      els.cheque.hidden = true;
      els.traps.hidden = true;
      if (window.Kee) Kee.context({ ready: hasRent && hasDate, result: false, bad: !!r.error && hasRent && hasDate });
      return;
    }

    lastResult = r;
    var verb = r.mode === "movein" ? "Moving in on the " : "Last day the ";
    els.sub.textContent = verb + ordinal(r.day) + " of " + r.monthName + ": you pay for " +
      r.occupied + " of " + r.daysInMonth + " days.";

    els.methods.innerHTML = "";
    r.methods.forEach(function (m) {
      var row = document.createElement("div");
      row.className = "method" + (m.key === r.chosen.key ? " pick" : "");
      var tags = "";
      if (m.key === r.chosen.key) tags += "<span class='tag pick'>Totalled</span>";
      if (m.cheapest) tags += "<span class='tag good'>Lowest</span>";
      if (m.dearest) tags += "<span class='tag warn'>Highest</span>";
      if (m.key === "actual" && r.wholeMonth) tags += "<span class='tag good'>= one month</span>";
      row.innerHTML =
        "<div class='m-main'>" +
          "<h3>" + m.name + " " + tags + "</h3>" +
          "<p class='m-daily'>" + money(m.daily) + " a day × " + r.occupied + " day" + (r.occupied === 1 ? "" : "s") + "</p>" +
          "<p class='m-note'>" + m.note + "</p>" +
        "</div>" +
        "<div class='m-amount'>" + money(m.amount) + "</div>";
      els.methods.appendChild(row);
    });

    if (r.spread > 0) {
      els.spread.innerHTML = "For the same " + r.occupied + " days, the three methods range from " +
        money(r.low) + " to " + money(r.high) + " — a <b>" + money(r.spread) +
        "</b> gap. Your lease (or local law) decides which one applies; ask if it doesn't say.";
    } else {
      els.spread.textContent = "";
    }

    renderCheque(r);
    renderTraps(r);
    if (window.Kee) Kee.context({ ready: true, result: true });
  }

  function renderCheque(r) {
    if (!r.firstMonth) { els.cheque.hidden = true; return; }
    var f = r.firstMonth;
    var lines = [["Part-month rent (" + r.chosen.name.toLowerCase() + ")", f.rent]];
    if (f.deposit) lines.push(["Security deposit", f.deposit]);
    if (f.lastMonth) lines.push(["Last month's rent", f.lastMonth]);
    if (f.fees) lines.push(["Other fees", f.fees]);
    var html = lines.map(function (l) {
      return "<div class='line'><span>" + l[0] + "</span><span>" + money(l[1]) + "</span></div>";
    }).join("");
    html += "<div class='line total'><span>Due on day one</span><span>" + money(f.total) + "</span></div>";
    els.chequeLines.innerHTML = html;
    els.cheque.hidden = false;
  }

  function renderTraps(r) {
    var thirty = r.methods.filter(function (m) { return m.key === "thirty"; })[0];
    var actual = r.methods.filter(function (m) { return m.key === "actual"; })[0];
    var items = [];
    var gap = E.round2(thirty.amount - actual.amount);
    items.push("<b>Which method.</b> The flat 30-day method keeps the daily rate the same all year, so a full " +
      r.daysInMonth + "-day month comes to more than one month's rent. The exact-days method is the only one where a whole month equals your rent exactly." +
      (gap !== 0 ? " Here the two differ by " + money(Math.abs(gap)) + "." : ""));
    items.push("<b>The key day.</b> " +
      (r.mode === "movein" ? "Count the day you pick up the keys." : "Count your last night.") +
      " Quietly dropping it takes a day off what you're charged — about " + money(actual.daily) + " here.");
    els.trapList.innerHTML = items.map(function (t) { return "<li>" + t + "</li>"; }).join("");
    els.traps.hidden = false;
  }

  function ordinal(n) {
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  // Copy a plain-text breakdown.
  els.copy.addEventListener("click", function () {
    var r = lastResult;
    if (!r) { flash("Fill in the rent and date first."); return; }
    var lines = [];
    lines.push("Prorate — " + (r.mode === "movein" ? "moving in" : "moving out") +
      " on the " + ordinal(r.day) + " of " + r.monthName);
    lines.push("Rent " + money(r.rent) + "/month, " + r.occupied + " of " + r.daysInMonth + " days");
    lines.push("");
    r.methods.forEach(function (m) {
      lines.push((m.key === r.chosen.key ? "> " : "  ") + m.name + ": " + money(m.amount) +
        " (" + money(m.daily) + "/day)");
    });
    lines.push("");
    lines.push("Gap between methods: " + money(r.spread));
    if (r.firstMonth) {
      lines.push("");
      lines.push("Day-one cheque: " + money(r.firstMonth.total));
    }
    copyText(lines.join("\n"), "copied", "Breakdown copied.");
  });

  els.share.addEventListener("click", function () {
    var url = location.origin + location.pathname + "#" + encode(current());
    copyText(url, "shared", "Share link copied.");
  });

  function copyText(text, event, ok) {
    function done() { flash(ok); if (window.Kee) Kee.react(event); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else { fallbackCopy(text, done); }
  }
  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.left = "-9999px";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { flash("Couldn't copy — select and copy by hand."); }
    ta.remove();
  }
  var flashTimer = null;
  function flash(msg) {
    els.status.textContent = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { els.status.textContent = ""; }, 3500);
  }

  // State in the URL fragment: r=rent, d=date, m=in/out, x=method, k=0/1, and
  // the day-one extras. Short keys, nothing personal.
  function encode(s) {
    var p = new URLSearchParams();
    if (s.rent) p.set("r", s.rent);
    if (s.date) p.set("d", s.date);
    p.set("m", s.mode === "moveout" ? "out" : "in");
    p.set("x", s.method);
    p.set("k", s.countKeyDay ? "1" : "0");
    if (s.deposit) p.set("dep", s.deposit);
    if (s.lastMonth) p.set("lm", s.lastMonth);
    if (s.fees) p.set("f", s.fees);
    return p.toString();
  }
  function decode() {
    var raw = location.hash.replace(/^#/, "");
    if (!raw) return false;
    var p = new URLSearchParams(raw);
    if (p.has("r")) els.rent.value = p.get("r");
    if (p.has("d")) els.date.value = p.get("d");
    if (p.has("x")) els.method.value = p.get("x");
    els.keyday.checked = p.get("k") !== "0";
    if (p.has("dep")) els.deposit.value = p.get("dep");
    if (p.has("lm")) els.lastmonth.value = p.get("lm");
    if (p.has("f")) els.fees.value = p.get("f");
    setMode(p.get("m") === "out" ? "moveout" : "movein", false);
    return true;
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  if (!decode()) {
    els.date.value = today();
    setMode("movein", false);
  }
  render();
})();
