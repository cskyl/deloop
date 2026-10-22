/* DeLoop project page: math, interactive loop example, results chart/table, BibTeX copy, figure viewer. */
(function () {
  "use strict";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- math ---------------- */
  function renderMath() {
    if (!window.katex) return;
    document.querySelectorAll(".math[data-tex]").forEach((el) => {
      try {
        window.katex.render(el.dataset.tex, el, { displayMode: el.classList.contains("display"), throwOnError: false });
      } catch (e) { el.textContent = el.dataset.tex; }
    });
  }

  /* ---------------- interactive loop example ---------------- */
  // The baseline sequence follows the real Qwen3-8B CodeGym episode in the paper's appendix (earlier turns abridged).
  // The DeLoop sequence is a schematic of the trained behavior from the same state.
  const CALL = "FindUnvisitedOnlineServer(start_row=3, start_col=0)";
  const MARK = "MarkVisited(row=3, col=0)";
  const PRE = [
    { kind: "block", id: "early", text: "13 earlier act–observe turns", tokens: 2600,
      msg: "The agent has already worked through 13 turns of the task." },
    { kind: "step", id: "first", call: CALL, obs: "3,0", tokens: 160,
      msg: "The agent searches for an unvisited server and gets cell (3,0) back." },
    { kind: "block", id: "work", text: "further act–observe turns of real work", tokens: 1450,
      msg: "The history keeps growing and passes the 4,096-token budget." },
    { kind: "compress", tokens: 1150,
      msg: "Compression fires: the earlier turns, including the search for (3,0), are replaced by a summary." }
  ];
  const BASE = [
    { kind: "step", id: "r1", call: CALL, obs: "3,0", tokens: 160, loop: true,
      flag: "Looping action: same call, same observation as an earlier step",
      msg: "The agent re-issues the same search and gets the same cell back. The step adds no new information." },
    { kind: "step", id: "r2", call: CALL, obs: "3,0", tokens: 160, loop: true,
      flag: "Looping action again",
      msg: "Nothing has marked (3,0) as visited, so the search can only return the same cell." },
    { kind: "step", id: "b1", call: MARK, obs: "ok", tokens: 140, brk: true,
      flag: "First later non-looping action: it breaks the loop",
      msg: "Later in the same rollout, the agent finally marks the server as visited." },
    { kind: "mine",
      msg: "DeLoop mines this pair: the looping search is the rejected action, and the agent's own later MarkVisited is the chosen one." }
  ];
  const DELOOP = [
    { kind: "step", id: "d1", call: MARK, obs: "ok", tokens: 140, brk: true,
      flag: "Trained policy prefers the recovery under the same context",
      msg: "After training on its own loop pairs, the agent marks the server as visited instead of searching again." },
    { kind: "end",
      msg: "No repeat in this example: the same progress with two fewer tool calls." }
  ];

  function setupDemo() {
    const root = document.getElementById("loop-demo");
    if (!root) return;
    const trace = root.querySelector(".trace");
    const fill = root.querySelector(".ctx-fill");
    const tokOut = root.querySelector(".ctx-tokens");
    const stepsOut = root.querySelector(".t-steps");
    const loopsOut = root.querySelector(".t-loops");
    const pair = root.querySelector(".pair");
    const msg = root.querySelector(".demo-msg");
    const playBtn = root.querySelector('[data-act="play"]');
    const LIMIT = 4096;
    let mode = "base", idx = 0, tokens = 0, calls = 0, loops = 0, timer = null, compressed = false, instant = false;
    const seq = () => PRE.concat(mode === "base" ? BASE : DELOOP);

    function setTokens(n) {
      tokens = n;
      fill.style.width = Math.min(100, (n / LIMIT) * 100) + "%";
      fill.classList.toggle("hot", n > LIMIT);
      tokOut.textContent = n.toLocaleString("en-US");
    }
    function addRow(ev) {
      const li = document.createElement("li");
      li.dataset.id = ev.id || "";
      if (ev.kind === "block") {
        li.className = "summary";
        li.textContent = "⋯ " + ev.text + " ⋯";
      } else {
        li.innerHTML = '<span class="t"></span><span class="call"></span><span class="obs"></span>';
        const callEl = li.querySelector(".call");
        callEl.textContent = ev.call;
        callEl.innerHTML = callEl.innerHTML.replace("(", "(<wbr>");
        li.querySelector(".obs").textContent = ev.obs;
        if (ev.loop) li.classList.add("loop");
        if (ev.brk) li.classList.add("break");
        if (ev.flag) {
          const f = document.createElement("span");
          f.className = "flag"; f.textContent = ev.flag;
          li.appendChild(f);
        }
        li.querySelector(".t").textContent = ev.loop ? "loop" : ev.brk ? "✓" : "";
      }
      trace.appendChild(li);
      if (reduceMotion || instant) li.classList.add("in");
      else setTimeout(() => li.classList.add("in"), 30);
      return li;
    }
    function doEvent(ev) {
      if (ev.kind === "block") {
        addRow(ev); setTokens(tokens + ev.tokens);
      } else if (ev.kind === "step") {
        addRow(ev); setTokens(tokens + ev.tokens);
        if (compressed) { calls += 1; stepsOut.textContent = calls; }
        if (ev.loop) { loops += 1; loopsOut.textContent = loops; loopsOut.classList.add("bad"); }
      } else if (ev.kind === "compress") {
        const old = Array.from(trace.children);
        old.forEach((li) => li.classList.add("folded"));
        const delay = (reduceMotion || instant) ? 0 : 450;
        const fold = () => {
          old.forEach((li) => li.remove());
          addRow({ kind: "block", id: "sum", text: "summary of earlier turns (the search for (3,0) is no longer in view)" });
          setTokens(ev.tokens);
        };
        compressed = true;
        if (delay) setTimeout(fold, delay); else fold();
      } else if (ev.kind === "mine") {
        const rej = trace.querySelector('[data-id="r1"]');
        const cho = trace.querySelector('[data-id="b1"]');
        if (rej) rej.classList.add("rejected");
        if (cho) cho.classList.add("chosen");
        pair.hidden = false;
      }
      if (ev.msg) msg.textContent = ev.msg;
    }
    function step() {
      const s = seq();
      if (idx >= s.length) { stop(); return false; }
      doEvent(s[idx]); idx += 1;
      if (idx >= s.length) stop();
      return true;
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      playBtn.textContent = idx >= seq().length ? "↺ Replay" : "▶ Play";
    }
    function play() {
      if (timer) { stop(); return; }
      if (idx >= seq().length) reset();
      playBtn.textContent = "❚❚ Pause";
      step();
      timer = setInterval(step, reduceMotion ? 900 : 1500);
    }
    function reset() {
      stop(); idx = 0; calls = 0; loops = 0; compressed = false;
      trace.innerHTML = ""; pair.hidden = true; setTokens(0);
      stepsOut.textContent = "0"; loopsOut.textContent = "0"; loopsOut.classList.remove("bad");
      playBtn.textContent = "▶ Play";
      doEvent(seq()[0]); idx = 1;
      msg.textContent = mode === "base"
        ? "Press Play to watch the compressed baseline agent."
        : "Press Play to watch the DeLoop agent from the same state.";
    }
    root.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
      root.querySelectorAll("[data-mode]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      mode = b.dataset.mode; reset();
    }));
    root.querySelector('[data-act="play"]').addEventListener("click", play);
    root.querySelector('[data-act="step"]').addEventListener("click", () => { stop(); if (idx >= seq().length) reset(); step(); });
    root.querySelector('[data-act="reset"]').addEventListener("click", reset);
    stepsOut.parentElement.querySelector("dt").textContent = "Calls after compression";
    reset();

    // Static preview hook: ?demo=end (or ?demo=end-deloop) jumps to the final state.
    const q = new URLSearchParams(location.search).get("demo");
    if (q && q.startsWith("end")) {
      if (q === "end-deloop") root.querySelector('[data-mode="deloop"]').click();
      instant = true; while (idx < seq().length) step(); instant = false;
      return;
    }

    // Play once, gently, the first time the example scrolls into view.
    if (!reduceMotion && "IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); if (idx === 0) play(); }
      }, { threshold: 0.45 });
      io.observe(root);
    }
  }

  /* ---------------- results: chart + table (Table 1 of the paper) ---------------- */
  const GROUPS = [
    ["Reference", [
      { m: "Full history", s: "none", loop: 29.0, success: 31.7, steps: 12.23, tokens: 24.3, role: "ref" }]],
    ["Training-free context methods", [
      { m: "Compressed baseline", s: "none", loop: 57.3, success: 25.1, steps: 15.00, tokens: 23.9, role: "base" },
      { m: "Retrieval memory", s: "none", loop: 42.7, success: 27.7, steps: 13.34, tokens: 26.1 },
      { m: "ACON compressor", s: "none", loop: 46.3, success: 29.3, steps: 14.84, tokens: 20.5 },
      { m: "LLMLingua-2 compressor", s: "none", loop: 46.7, success: 23.7, steps: 14.48, tokens: 26.8 },
      { m: "History truncation", s: "none", loop: 65.3, success: 18.0, steps: 16.05, tokens: 34.8 }]],
    ["Training-free inference-time controls", [
      { m: "Exact duplicate blocker", s: "none", loop: 46.7, success: 25.3, steps: 14.71, tokens: 24.9 },
      { m: "Reflexion on stuck", s: "none", loop: 55.3, success: 24.3, steps: 14.62, tokens: 24.1 }]],
    ["Trained with labels", [
      { m: "Outcome DPO", s: "outcome-ranked pairs (task success)", loop: 34.7, success: 25.7, steps: 10.99, tokens: 15.9 },
      { m: "SFT on solved traces", s: "solved trajectories (task success)", loop: 42.7, success: 21.3, steps: 10.61, tokens: 25.2 },
      { m: "Gold-label DPO", s: "looping pairs from outcomes (task success)", loop: 22.3, success: 25.7, steps: 8.10, tokens: 11.3 },
      { m: "Gold-action GRPO", s: "gold-action match reward (gold action)", loop: 52.7, success: 25.0, steps: 14.23, tokens: 21.0 }]],
    ["Trained without labels", [
      { m: "Distillation SFT", s: "full-history traces (none)", loop: 43.7, success: 26.3, steps: 11.52, tokens: 26.6 }]],
    ["Ours", [
      { m: "DeLoop", s: "self-mined pairs (none)", loop: 6.1, success: 25.9, steps: 4.67, tokens: 12.7, role: "ours" },
      { m: "DeLoop-Mix", s: "+ cross-domain pairs (none)", loop: 10.1, success: 30.3, steps: 5.94, tokens: 9.6, role: "ours" }]]
  ];
  const METRICS = {
    loop: { label: "Loop rate (%)", dec: 1, max: 70, ticks: [0, 20, 40, 60], better: "lower" },
    success: { label: "Task success (%)", dec: 1, max: 40, ticks: [0, 10, 20, 30, 40], better: "higher" },
    steps: { label: "Steps per task", dec: 2, max: 18, ticks: [0, 5, 10, 15], better: "lower" },
    tokens: { label: "Tokens per task (k)", dec: 1, max: 36, ticks: [0, 10, 20, 30], better: "lower" }
  };
  const COLOR = { ours: "var(--accent)", base: "var(--warn)", ref: "var(--ref)", other: "var(--other)" };
  const BASE_ROW = GROUPS[1][1][0];
  const fmt = (v, d) => v.toFixed(d);

  function buildTable() {
    const tb = document.querySelector("#main-table tbody");
    if (!tb) return;
    let html = "";
    GROUPS.forEach(([g, rows]) => {
      html += `<tr class="group"><td colspan="6">${g}</td></tr>`;
      rows.forEach((r) => {
        const cls = r.role === "ours" ? "row-ours" : r.role === "base" ? "row-base" : "";
        const cell = (k, d) => {
          let t = fmt(r[k], d);
          if (r.role === "ours") {
            const dv = r[k] - BASE_ROW[k];
            t += `<span class="delta">(${dv > 0 ? "+" : "−"}${fmt(Math.abs(dv), d)})</span>`;
          }
          return `<td>${t}</td>`;
        };
        html += `<tr class="${cls}"><td>${r.role === "ours" ? r.m + " (ours)" : r.m}</td><td>${r.s}</td>${cell("loop", 1)}${cell("success", 1)}${cell("steps", 2)}${cell("tokens", 1)}</tr>`;
      });
    });
    tb.innerHTML = html;
  }

  function buildChart() {
    const host = document.querySelector("#main-chart .chart-body");
    const tip = document.querySelector("#main-chart .tooltip");
    if (!host) return;
    const rows = [];
    GROUPS.forEach(([g, rs], gi) => rs.forEach((r, i) => rows.push(Object.assign({ gi, first: i === 0, group: g }, r))));
    const W = 760, LW = 196, RW = 56, TOP = 22, ROW = 25, GAP = 9, BAR = 15;
    let y = TOP;
    rows.forEach((r) => { if (r.first && r.gi > 0) y += GAP; r.y = y; y += ROW; });
    const H = y + 6;
    const plotW = W - LW - RW;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("aria-hidden", "true");
    const gGrid = document.createElementNS(NS, "g");
    const gRows = document.createElementNS(NS, "g");
    svg.append(gGrid, gRows);
    const el = (name, attrs, parent) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); (parent || svg).appendChild(e); return e; };

    const items = rows.map((r) => {
      const g = el("g", { class: "row", tabindex: "0" }, gRows);
      const role = r.role || "other";
      el("text", { x: LW - 10, y: r.y + BAR / 2 + 4.5, "text-anchor": "end", class: "lbl" + (role !== "other" ? " strong" : "") }, g).textContent = r.role === "ours" ? r.m + " (ours)" : r.m;
      const bar = el("rect", { x: LW, y: r.y, height: BAR, width: 0, rx: 3, class: "bar", fill: COLOR[role] }, g);
      const val = el("text", { x: LW, y: r.y + BAR / 2 + 4.3, class: "val" }, g);
      el("rect", { x: 0, y: r.y - (ROW - BAR) / 2, width: W, height: ROW, class: "hit" }, g);
      return { r, g, bar, val, role };
    });

    function draw(metric) {
      const M = METRICS[metric];
      gGrid.innerHTML = "";
      M.ticks.forEach((t) => {
        const x = LW + (t / M.max) * plotW;
        el("line", { x1: x, x2: x, y1: TOP - 6, y2: H - 4, class: t === 0 ? "axis" : "grid" }, gGrid);
        el("text", { x, y: TOP - 10, "text-anchor": "middle", class: "tick" }, gGrid).textContent = t;
      });
      items.forEach(({ r, bar, val, role }) => {
        const w = Math.max(2, (r[metric] / M.max) * plotW);
        bar.setAttribute("width", w);
        val.setAttribute("x", LW + w + 6);
        val.textContent = role !== "other" ? fmt(r[metric], M.dec) : "";
      });
      host.setAttribute("aria-label",
        `${M.label} for every method in the main CodeGym comparison (${M.better} is better). Full values are in the table below.`);
      current = metric;
    }
    let current = "loop";
    host.appendChild(svg);
    draw("loop");

    function showTip(item, evt) {
      const M = METRICS[current], r = item.r;
      const dv = r[current] - BASE_ROW[current];
      const delta = r.role === "base" ? "" : `<br><span class="muted">vs compressed baseline: ${dv > 0 ? "+" : "−"}${fmt(Math.abs(dv), M.dec)}</span>`;
      tip.innerHTML = `<b>${r.m}</b><br>${M.label}: <b>${fmt(r[current], M.dec)}</b>${delta}<br><span class="muted">${r.group} · supervision: ${r.s}</span>`;
      tip.hidden = false;
      const chartBox = host.parentElement.getBoundingClientRect();
      let x, y;
      if (evt && evt.clientX) { x = evt.clientX - chartBox.left + 14; y = evt.clientY - chartBox.top + 12; }
      else { const b = item.bar.getBoundingClientRect(); x = b.right - chartBox.left + 10; y = b.top - chartBox.top; }
      x = Math.min(x, chartBox.width - tip.offsetWidth - 4);
      tip.style.left = Math.max(0, x) + "px"; tip.style.top = y + "px";
    }
    items.forEach((it) => {
      it.g.addEventListener("mousemove", (e) => showTip(it, e));
      it.g.addEventListener("mouseleave", () => { tip.hidden = true; });
      it.g.addEventListener("focus", () => showTip(it));
      it.g.addEventListener("blur", () => { tip.hidden = true; });
    });
    document.querySelectorAll("#main-chart [data-metric]").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("#main-chart [data-metric]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      tip.hidden = true; draw(b.dataset.metric);
    }));
  }

  /* ---------------- BibTeX copy ---------------- */
  function setupCopy() {
    const btn = document.querySelector(".bibtex .copy");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      const text = document.querySelector(".bibtex code").innerText;
      try { await navigator.clipboard.writeText(text); btn.textContent = "Copied"; }
      catch (e) {
        const r = document.createRange(); r.selectNodeContents(document.querySelector(".bibtex code"));
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = "Press ⌘/Ctrl+C";
      }
      setTimeout(() => { btn.textContent = "Copy"; }, 1800);
    });
  }

  /* ---------------- figure viewer ---------------- */
  function setupLightbox() {
    const lb = document.querySelector(".lightbox");
    if (!lb) return;
    const img = lb.querySelector("img");
    let last = null;
    const close = () => { lb.hidden = true; img.removeAttribute("src"); if (last) last.focus(); };
    document.querySelectorAll("a[data-lightbox]").forEach((a) => a.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault(); last = a;
      const inner = a.querySelector("img");
      img.src = a.getAttribute("href"); img.alt = inner ? inner.alt : "";
      lb.hidden = false; lb.querySelector(".lb-close").focus();
    }));
    lb.addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !lb.hidden) close(); });
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderMath(); setupDemo(); buildTable(); buildChart(); setupCopy(); setupLightbox();
  });
})();
