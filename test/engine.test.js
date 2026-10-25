"use strict";
var test = require("node:test");
var assert = require("node:assert");
var P = require("../src/engine.js");

test("daysInMonth knows month lengths and leap years", function () {
  assert.strictEqual(P.daysInMonth(2026, 1), 31);
  assert.strictEqual(P.daysInMonth(2026, 2), 28);
  assert.strictEqual(P.daysInMonth(2024, 2), 29);
  assert.strictEqual(P.daysInMonth(2026, 4), 30);
});

test("parseDate rejects impossible dates and bad shapes", function () {
  assert.deepStrictEqual(P.parseDate("2026-01-18"), { year: 2026, month: 1, day: 18 });
  assert.strictEqual(P.parseDate("2026-02-30"), null);
  assert.strictEqual(P.parseDate("2026-13-01"), null);
  assert.strictEqual(P.parseDate("18/01/2026"), null);
  assert.strictEqual(P.parseDate(""), null);
});

test("move-in counts the key day through the end of the month", function () {
  // Keys on Jan 18, 31-day month => 18..31 inclusive = 14 days.
  assert.strictEqual(P.occupiedDays({ mode: "movein", day: 18, daysInMonth: 31, countKeyDay: true }), 14);
  assert.strictEqual(P.occupiedDays({ mode: "movein", day: 18, daysInMonth: 31, countKeyDay: false }), 13);
});

test("move-out counts from the 1st to the last day", function () {
  assert.strictEqual(P.occupiedDays({ mode: "moveout", day: 10, daysInMonth: 31, countKeyDay: true }), 10);
  assert.strictEqual(P.occupiedDays({ mode: "moveout", day: 10, daysInMonth: 31, countKeyDay: false }), 9);
});

test("the Jan 18 / $1800 worked example matches both methods", function () {
  var r = P.prorate({ rent: 1800, date: "2026-01-18", mode: "movein", method: "actual" });
  assert.strictEqual(r.occupied, 14);
  assert.strictEqual(r.daysInMonth, 31);
  var byKey = {};
  r.methods.forEach(function (m) { byKey[m.key] = m; });
  assert.strictEqual(byKey.actual.amount, 812.90);
  assert.strictEqual(byKey.thirty.amount, 840.00);
});

test("a whole 31-day month: actual equals rent, flat-30 overcharges", function () {
  var r = P.prorate({ rent: 1800, date: "2026-01-01", mode: "movein", method: "actual" });
  assert.strictEqual(r.occupied, 31);
  assert.strictEqual(r.wholeMonth, true);
  var byKey = {};
  r.methods.forEach(function (m) { byKey[m.key] = m; });
  assert.strictEqual(byKey.actual.amount, 1800.00);
  assert.strictEqual(byKey.actual.overFullMonth, 0);
  assert.strictEqual(byKey.thirty.amount, 1860.00);
  assert.strictEqual(byKey.thirty.overFullMonth, 60.00);
});

test("February: flat-30 is cheaper than actual days", function () {
  var r = P.prorate({ rent: 1500, date: "2026-02-15", mode: "movein", method: "actual" });
  assert.strictEqual(r.daysInMonth, 28);
  assert.strictEqual(r.occupied, 14); // 15..28
  var byKey = {};
  r.methods.forEach(function (m) { byKey[m.key] = m; });
  // actual daily = 1500/28 = 53.57; flat30 = 50.00. Flat 30 pays less here.
  assert.ok(byKey.thirty.amount < byKey.actual.amount);
});

test("cheapest and dearest are flagged, spread is the gap", function () {
  var r = P.prorate({ rent: 1800, date: "2026-01-18", mode: "movein", method: "actual" });
  var cheap = r.methods.filter(function (m) { return m.cheapest; });
  var dear = r.methods.filter(function (m) { return m.dearest; });
  assert.ok(cheap.length >= 1);
  assert.strictEqual(dear.length, 1);
  assert.strictEqual(r.spread, P.round2(r.high - r.low));
});

test("daily-rate method uses rent x 12 / 365", function () {
  var r = P.prorate({ rent: 1800, date: "2026-01-18", mode: "movein", method: "daily" });
  var daily = r.methods.filter(function (m) { return m.key === "daily"; })[0];
  assert.strictEqual(daily.daily, P.round2(1800 * 12 / 365));
  assert.strictEqual(r.chosen.key, "daily");
});

test("exactly three distinct methods, no duplicate amounts hiding a bug", function () {
  var r = P.prorate({ rent: 1800, date: "2026-01-18", mode: "movein", method: "actual" });
  assert.strictEqual(r.methods.length, 3);
  assert.deepStrictEqual(r.methods.map(function (m) { return m.key; }), ["actual", "thirty", "daily"]);
});

test("first-month cheque adds deposit, last month and fees", function () {
  var r = P.prorate({
    rent: 1800, date: "2026-01-18", mode: "movein", method: "actual",
    deposit: 1800, lastMonth: 1800, fees: 50
  });
  assert.strictEqual(r.firstMonth.rent, 812.90);
  assert.strictEqual(r.firstMonth.total, P.round2(812.90 + 1800 + 1800 + 50));
});

test("move-out has no first-month cheque", function () {
  var r = P.prorate({ rent: 1800, date: "2026-01-10", mode: "moveout", method: "actual" });
  assert.strictEqual(r.firstMonth, null);
  assert.strictEqual(r.occupied, 10);
});

test("bad rent and bad date return errors, not numbers", function () {
  assert.strictEqual(P.prorate({ rent: 0, date: "2026-01-18" }).error, "rent");
  assert.strictEqual(P.prorate({ rent: 1800, date: "nope" }).error, "date");
});

test("rent typed with a comma still parses", function () {
  var r = P.prorate({ rent: "1,800", date: "2026-01-18", mode: "movein", method: "actual" });
  assert.strictEqual(r.rent, 1800);
});

// Fixed-term lease: two partial months with whole months in between.
test("a range with partial first and last months and full months between", function () {
  // $1500/mo, 20 Jan 2026 to 10 Mar 2026, actual-days method.
  var r = P.prorateRange({ rent: "1500", start: "2026-01-20", end: "2026-03-10", method: "actual" });
  assert.ok(!r.error);
  assert.strictEqual(r.fullMonths, 1); // all of February
  var m = r.chosen;
  // January: 20th to 31st inclusive = 12 days of 31. 1500/31*12 = 580.65
  assert.strictEqual(m.first.days, 12);
  assert.strictEqual(m.first.amount, 580.65);
  // February is a whole month at the stated rent.
  assert.strictEqual(m.fullTotal, 1500);
  // March: 1st to 10th = 10 days of 31. 1500/31*10 = 483.87
  assert.strictEqual(m.last.days, 10);
  assert.strictEqual(m.last.amount, 483.87);
  assert.strictEqual(m.total, P.round2(580.65 + 1500 + 483.87));
});

test("a range inside one month is a single partial period", function () {
  var r = P.prorateRange({ rent: "3000", start: "2026-04-05", end: "2026-04-20", method: "actual" });
  assert.strictEqual(r.sameMonth, true);
  assert.strictEqual(r.fullMonths, 0);
  // 5th to 20th inclusive = 16 days of 30. 3000/30*16 = 1600
  assert.strictEqual(r.chosen.first.days, 16);
  assert.strictEqual(r.chosen.first.amount, 1600);
  assert.strictEqual(r.chosen.last, null);
  assert.strictEqual(r.chosen.total, 1600);
});

test("the end date cannot come before the start date", function () {
  assert.strictEqual(P.prorateRange({ rent: "1000", start: "2026-05-10", end: "2026-05-01", method: "actual" }).error, "order");
  assert.strictEqual(P.prorateRange({ rent: "1000", start: "2026-06-01", end: "2026-03-01", method: "actual" }).error, "order");
});

test("dropping the last night takes a day off the final month", function () {
  var withNight = P.prorateRange({ rent: "1550", start: "2026-01-15", end: "2026-02-10", method: "actual", countKeyDay: true });
  var without = P.prorateRange({ rent: "1550", start: "2026-01-15", end: "2026-02-10", method: "actual", countKeyDay: false });
  assert.strictEqual(without.chosen.last.days, withNight.chosen.last.days - 1);
});

test("all three methods are compared and the spread is reported", function () {
  var r = P.prorateRange({ rent: "1800", start: "2026-01-18", end: "2026-03-05", method: "thirty" });
  assert.strictEqual(r.methods.length, 3);
  assert.ok(r.spread >= 0);
  assert.ok(r.methods.some(function (m) { return m.cheapest; }));
});

test("toMonthly converts a quoted period to a monthly rent", function () {
  assert.strictEqual(P.toMonthly(1200, "month"), 1200);
  // 300/week over a year is 300*52/12 = 1300/month, not 1200 (which is x4).
  assert.strictEqual(P.toMonthly(300, "week"), 1300);
  assert.strictEqual(P.toMonthly(600, "fourweek"), 650); // 600*13/12
  assert.strictEqual(P.toMonthly(15600, "year"), 1300);
});

test("weeklyGap shows how far the times-four shortcut falls short", function () {
  var g = P.weeklyGap(300);
  assert.strictEqual(g.right, 1300);
  assert.strictEqual(g.timesFour, 1200);
  assert.strictEqual(g.shortBy, 100);
});

test("a weekly rent is turned into the right monthly before prorating", function () {
  var r = P.prorate({ rent: "300", period: "week", date: "2026-03-01", method: "actual" });
  assert.ok(!r.error);
  assert.strictEqual(r.quoted, 300);
  assert.strictEqual(r.period, "week");
  assert.strictEqual(r.rent, 1300);           // 300 * 52 / 12
  assert.strictEqual(r.monthlyFromQuoted, true);
  // A whole March on actual-days is exactly the monthly rent.
  var actual = r.methods.find(function (m) { return m.key === "actual"; });
  assert.strictEqual(actual.amount, 1300);
});

test("the default period is monthly, so existing results are unchanged", function () {
  var a = P.prorate({ rent: "1300", date: "2026-03-01", method: "actual" });
  var b = P.prorate({ rent: "1300", period: "month", date: "2026-03-01", method: "actual" });
  assert.strictEqual(a.rent, 1300);
  assert.strictEqual(a.monthlyFromQuoted, false);
  assert.deepStrictEqual(a.methods, b.methods);
});

test("a weekly rent carries through a full-tenancy range too", function () {
  var r = P.prorateRange({ rent: "300", period: "week", start: "2026-01-10", end: "2026-04-20", method: "actual" });
  assert.ok(!r.error);
  assert.strictEqual(r.rent, 1300);
  assert.strictEqual(r.monthlyFromQuoted, true);
});
