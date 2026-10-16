// Kee, the house key who helps you work out the rent. Kee watches your
// pointer (or the box you're typing in on a phone), gives a tip for the step
// you're on when tapped, jingles when the numbers land, and throws off a few
// sparkles if you tap five times fast. Everything Kee says goes through the
// bubble's live region, so screen readers hear it too.
(function () {
  "use strict";
  var btn = document.getElementById("kee");
  var bubble = document.getElementById("kee-bubble");
  var dock = document.getElementById("kee-dock");
  var hide = document.getElementById("kee-hide");
  if (!btn) {
    window.Kee = { react: function () {}, context: function () {}, say: function () {} };
    return;
  }

  var still = matchMedia("(prefers-reduced-motion: reduce)");
  var baseMood = "sleepy", tipKey = "start";
  var flashing = false, flashTimer = null, bubbleTimer = null, tapTimes = [], tipIndex = {};
  var greeted = false;

  var TIPS = {
    start: [
      "Hi, I'm Kee! Pop in the monthly rent and the day you get the keys.",
      "Not sure which method your lease uses? I'll show all four so you can check.",
      "Moving out instead of in? Flip the switch at the top."
    ],
    details: [
      "Count the day you get the keys. You have them, so that day is yours to pay for.",
      "February is where the four methods disagree the most.",
      "The flat 30-day way can cost a touch more in a 31-day month."
    ],
    result: [
      "These four can differ by real money. Your lease says which one counts.",
      "If the lease doesn't name a method, it's fair to ask before you pay.",
      "Copy the breakdown and send it over if a number looks off."
    ]
  };

  function setMood(m) { btn.setAttribute("data-mood", m); }

  function say(text, ms) {
    if (dock.classList.contains("tucked")) return;
    bubble.textContent = text;
    bubble.classList.remove("pop");
    void bubble.offsetWidth;
    bubble.classList.add("pop");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { bubble.textContent = ""; }, ms || 7000);
  }

  function flash(m, ms) {
    setMood(m);
    flashing = true;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { flashing = false; setMood(baseMood); }, ms || 1400);
  }

  function play(cls) {
    if (still.matches) return;
    btn.classList.remove("hop", "jingle");
    void btn.offsetWidth;
    btn.classList.add(cls);
  }
  btn.addEventListener("animationend", function () { btn.classList.remove("hop", "jingle"); });

  function context(c) {
    if (c.bad) { tipKey = "start"; baseMood = "worried"; }
    else if (!c.ready) { tipKey = "start"; baseMood = "sleepy"; }
    else if (!c.result) { tipKey = "details"; baseMood = "happy"; }
    else { tipKey = "result"; baseMood = "happy"; }
    if (!flashing) setMood(baseMood);
    if (!greeted) {
      greeted = true;
      setTimeout(function () { if (!bubble.textContent && baseMood === "sleepy") say(TIPS.start[0], 9000); }, 900);
    }
  }

  function nextTip() {
    var list = TIPS[tipKey] || TIPS.result;
    var i = tipIndex[tipKey] || 0;
    tipIndex[tipKey] = (i + 1) % list.length;
    return list[i];
  }

  btn.addEventListener("click", function () {
    if (dock.classList.contains("tucked")) {
      dock.classList.remove("tucked");
      remember(false);
      say("I'm back! Tap me any time for a tip.");
      play("hop");
      return;
    }
    var now = Date.now();
    tapTimes = tapTimes.filter(function (t) { return now - t < 1600; });
    tapTimes.push(now);
    if (tapTimes.length >= 5) {
      tapTimes = [];
      play("jingle");
      flash("wow", 1200);
      sparkle(10);
      say("Jingle jingle! New keys, new place.");
      return;
    }
    play("hop");
    if (baseMood === "sleepy") flash("happy", 1600);
    say(nextTip());
  });

  hide.addEventListener("click", function () {
    dock.classList.add("tucked");
    bubble.textContent = "";
    remember(true);
  });

  function remember(tucked) {
    try { localStorage.setItem("prorate.keeTucked", tucked ? "1" : ""); } catch (e) {}
  }
  try { if (localStorage.getItem("prorate.keeTucked")) dock.classList.add("tucked"); } catch (e) {}

  // Eyes follow the pointer, a few pixels at most.
  var pupils = btn.querySelectorAll(".k-pupil");
  var target = null, frame = 0;
  function look() {
    frame = 0;
    if (!target) return;
    var r = btn.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height * 0.4;
    var dx = target.x - cx, dy = target.y - cy;
    var d = Math.hypot(dx, dy) || 1;
    var reach = Math.min(1, d / 220);
    var x = (dx / d) * 3 * reach, y = (dy / d) * 3.4 * reach;
    pupils.forEach(function (p) { p.style.transform = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px)"; });
  }
  window.addEventListener("pointermove", function (ev) {
    target = { x: ev.clientX, y: ev.clientY };
    if (!frame) frame = requestAnimationFrame(look);
  }, { passive: true });
  document.addEventListener("focusin", function (ev) {
    var r = ev.target.getBoundingClientRect && ev.target.getBoundingClientRect();
    if (!r || ev.target === btn) return;
    target = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    if (!frame) frame = requestAnimationFrame(look);
  });

  (function blink() {
    setTimeout(function () {
      if (baseMood !== "sleepy" && !document.hidden) {
        btn.classList.add("blink");
        setTimeout(function () { btn.classList.remove("blink"); }, 140);
      }
      blink();
    }, 2600 + Math.random() * 3800);
  })();

  // Little gold sparkles fly off the key.
  function sparkle(n) {
    if (still.matches) return;
    var r = btn.getBoundingClientRect();
    for (var i = 0; i < n; i++) {
      var s = document.createElement("span");
      s.className = "spark";
      s.textContent = "✦";
      s.style.left = r.left + r.width * (0.3 + Math.random() * 0.4) + "px";
      s.style.top = r.top + r.height * 0.25 + "px";
      s.style.fontSize = (10 + Math.random() * 12) + "px";
      document.body.appendChild(s);
      var dx = (Math.random() - 0.5) * 220, dy = -(60 + Math.random() * 160);
      var a = s.animate([
        { transform: "translate(0,0) scale(0.4) rotate(0deg)", opacity: 1 },
        { transform: "translate(" + dx * 0.6 + "px," + dy + "px) scale(1.2) rotate(120deg)", opacity: 1, offset: 0.6 },
        { transform: "translate(" + dx + "px," + (dy + 180) + "px) scale(0.6) rotate(240deg)", opacity: 0 }
      ], { duration: 1200 + Math.random() * 600, easing: "ease-out" });
      a.onfinish = (function (node) { return function () { node.remove(); }; })(s);
    }
  }

  function react(what) {
    switch (String(what)) {
      case "movein": play("hop"); say("Moving in. I'll add up the day-one cheque too."); break;
      case "moveout": play("hop"); say("Moving out. I'll count from the 1st to your last day."); break;
      case "keyday:off": flash("worried", 1200); say("Dropping the key day saves the landlord a day. Fair if you really don't stay it."); break;
      case "method:thirty": flash("wow", 1100); say("Flat 30-day. In a long month that's a bit more than the exact-days way."); break;
      case "result": play("jingle"); flash("party", 1500); say("There's your breakdown. The highlighted one is what I totalled."); break;
      case "copied": play("hop"); flash("party", 1200); say("Copied! Send it along."); break;
      case "shared": play("hop"); say("Link copied. It carries your numbers, nothing else."); break;
    }
  }

  window.Kee = { react: react, context: context, say: say };
})();
