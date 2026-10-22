// Prorate engine: what a part-month of rent really costs, worked out four
// ways at once, plus the full cheque you write on move-in day.
//
// There is no single rule for proration in most places, so the same move-in
// date can cost different amounts depending on which method the landlord
// uses. This works out all four, side by side, so you can see the gap and
// ask for the one the lease actually says. Pure functions, no DOM, so the
// page and `node --test` run the exact same code.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Prorate = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // The four ways rent gets split across a part month. Each sets a daily
  // rate a different way; "actual" is the only one where living a whole
  // month comes to exactly one month's rent.
  var METHODS = [
    {
      key: "actual",
      name: "Days in this month",
      note: "Rent split over the real length of the month. A whole month comes to exactly one month's rent.",
      divisor: function (dim) { return dim; }
    },
    {
      key: "thirty",
      name: "Flat 30-day month",
      note: "Rent always split over 30, whatever the month. Common in landlord software; it overcharges a little in 31-day months.",
      divisor: function () { return 30; }
    },
    {
      key: "daily",
      name: "Daily rate (365-day year)",
      note: "A year's rent split over 365 days, the same thing as the 30.42-day average month. Common at larger property managers.",
      divisor: function () { return 365 / 12; }
    }
  ];

  var MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  function num(x, d) {
    var n = typeof x === "number" ? x : parseFloat(String(x).replace(/[, ]/g, ""));
    return isFinite(n) ? n : d;
  }

  // Days in a given month. month is 1..12. Handles leap Februaries.
  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  // Parse a plain YYYY-MM-DD (what <input type="date"> gives) without letting
  // the browser's time zone shift the day. Returns {year, month, day} or null.
  function parseDate(text) {
    var m = String(text || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12) return null;
    if (d < 1 || d > daysInMonth(y, mo)) return null;
    return { year: y, month: mo, day: d };
  }

  // How many days of the month you actually pay for.
  //  - Moving in: from the move-in day to the end of the month. You get the
  //    keys on the move-in day, so that day counts (countKeyDay).
  //  - Moving out: from the 1st to your last day. If you hand the keys back
  //    in the morning and don't stay the last night, drop that day.
  function occupiedDays(opts) {
    var dim = opts.daysInMonth;
    var day = opts.day;
    var key = opts.countKeyDay !== false;
    var days;
    if (opts.mode === "moveout") {
      days = key ? day : day - 1;
    } else {
      days = key ? dim - day + 1 : dim - day;
    }
    return Math.max(0, Math.min(dim, days));
  }

  function dailyRate(rent, methodKey, dim) {
    if (methodKey === "daily") return rent * 12 / 365;
    var m = findMethod(methodKey);
    return rent / m.divisor(dim);
  }

  function findMethod(key) {
    for (var i = 0; i < METHODS.length; i++) if (METHODS[i].key === key) return METHODS[i];
    return METHODS[0];
  }

  // Work out every method for one part-month, then the full move-in cheque.
  // Returns { error } when the rent or date can't be used.
  function prorate(input) {
    var rent = num(input.rent, NaN);
    if (!(rent > 0)) return { error: "rent" };
    var d = parseDate(input.date);
    if (!d) return { error: "date" };

    var mode = input.mode === "moveout" ? "moveout" : "movein";
    var countKeyDay = input.countKeyDay !== false;
    var dim = daysInMonth(d.year, d.month);
    var occupied = occupiedDays({ mode: mode, day: d.day, daysInMonth: dim, countKeyDay: countKeyDay });

    var methods = METHODS.map(function (m) {
      var daily = dailyRate(rent, m.key, dim);
      var amount = round2(daily * occupied);
      return {
        key: m.key, name: m.name, note: m.note,
        daily: round2(daily), amount: amount,
        overFullMonth: round2(amount - rent)
      };
    });

    var amounts = methods.map(function (m) { return m.amount; });
    var low = Math.min.apply(null, amounts);
    var high = Math.max.apply(null, amounts);
    methods.forEach(function (m) {
      m.cheapest = m.amount === low;
      m.dearest = m.amount === high && high !== low;
    });

    var chosenKey = findMethod(input.method).key;
    var chosen = methods.filter(function (m) { return m.key === chosenKey; })[0];

    var firstMonth = null;
    if (mode === "movein") {
      var deposit = Math.max(0, num(input.deposit, 0));
      var lastMonth = Math.max(0, num(input.lastMonth, 0));
      var fees = Math.max(0, num(input.fees, 0));
      firstMonth = {
        rent: chosen.amount,
        deposit: deposit,
        lastMonth: lastMonth,
        fees: fees,
        total: round2(chosen.amount + deposit + lastMonth + fees)
      };
    }

    return {
      mode: mode,
      rent: rent,
      year: d.year,
      month: d.month,
      monthName: MONTHS[d.month - 1],
      day: d.day,
      daysInMonth: dim,
      occupied: occupied,
      countKeyDay: countKeyDay,
      wholeMonth: occupied === dim,
      methods: methods,
      chosen: chosen,
      low: low,
      high: high,
      spread: round2(high - low),
      firstMonth: firstMonth
    };
  }

  // A whole fixed-term lease with a start and an end date: a part-month at each
  // end and whole months in between. The partial months are prorated each way;
  // every complete month in the middle is charged at the stated monthly rent,
  // because that is what leases actually do (proration only touches the ends).
  function prorateRange(input) {
    var rent = num(input.rent, NaN);
    if (!(rent > 0)) return { error: "rent" };
    var start = parseDate(input.start);
    var end = parseDate(input.end);
    if (!start) return { error: "start" };
    if (!end) return { error: "end" };
    var startIdx = start.year * 12 + (start.month - 1);
    var endIdx = end.year * 12 + (end.month - 1);
    if (endIdx < startIdx || (endIdx === startIdx && end.day < start.day)) return { error: "order" };

    var countKeyDay = input.countKeyDay !== false;
    var sameMonth = startIdx === endIdx;
    var fullMonths = sameMonth ? 0 : (endIdx - startIdx - 1);

    var methods = METHODS.map(function (m) {
      var out = { key: m.key, name: m.name, note: m.note };
      if (sameMonth) {
        var dim = daysInMonth(start.year, start.month);
        var days = end.day - start.day + 1 - (countKeyDay ? 0 : 1);
        days = Math.max(0, Math.min(dim, days));
        var daily = dailyRate(rent, m.key, dim);
        out.first = { days: days, amount: round2(daily * days), daily: round2(daily) };
        out.last = null;
        out.fullMonths = 0;
        out.fullTotal = 0;
        out.total = out.first.amount;
      } else {
        var dimS = daysInMonth(start.year, start.month);
        var fOcc = occupiedDays({ mode: "movein", day: start.day, daysInMonth: dimS, countKeyDay: countKeyDay });
        var fDaily = dailyRate(rent, m.key, dimS);
        out.first = { days: fOcc, amount: round2(fDaily * fOcc), daily: round2(fDaily) };

        var dimE = daysInMonth(end.year, end.month);
        var lOcc = occupiedDays({ mode: "moveout", day: end.day, daysInMonth: dimE, countKeyDay: countKeyDay });
        var lDaily = dailyRate(rent, m.key, dimE);
        out.last = { days: lOcc, amount: round2(lDaily * lOcc), daily: round2(lDaily) };

        out.fullMonths = fullMonths;
        out.fullTotal = round2(fullMonths * rent);
        out.total = round2(out.first.amount + out.fullTotal + out.last.amount);
      }
      return out;
    });

    var totals = methods.map(function (m) { return m.total; });
    var low = Math.min.apply(null, totals);
    var high = Math.max.apply(null, totals);
    methods.forEach(function (m) {
      m.cheapest = m.total === low;
      m.dearest = m.total === high && high !== low;
    });
    var chosen = methods.filter(function (m) { return m.key === findMethod(input.method).key; })[0];

    return {
      mode: "range",
      rent: rent,
      start: start, end: end,
      startName: MONTHS[start.month - 1], endName: MONTHS[end.month - 1],
      sameMonth: sameMonth,
      fullMonths: fullMonths,
      methods: methods,
      chosen: chosen,
      low: low, high: high, spread: round2(high - low)
    };
  }

  return {
    METHODS: METHODS, MONTHS: MONTHS,
    round2: round2, num: num,
    daysInMonth: daysInMonth, parseDate: parseDate,
    occupiedDays: occupiedDays, dailyRate: dailyRate, prorate: prorate,
    prorateRange: prorateRange
  };
});
