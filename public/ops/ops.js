/* SILA Operator Console — the human is the Pacer, the CTA, and the ICA tonight.
   Receives OpsView pushes over /ws/ops/:id?key=…; every button is one ops.* command. */

(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const MASTER = ["LOBBY", "A_BASELINE", "B_REACTION", "C_DISCOVERY", "D_IMPROV", "E_LOOP", "CLOSED"];
  const MICRO = ["IDLE", "ROUND_INTRO", "PROMPT_OPEN", "BUZZ_LOCK", "ADJUDICATE", "CELEBRATE", "INTERSTITIAL"];
  const PHASE_SHORT = { LOBBY: "Lobby", A_BASELINE: "A", B_REACTION: "B", C_DISCOVERY: "C", D_IMPROV: "D", E_LOOP: "E", CLOSED: "✕" };

  const S = {
    key: localStorage.getItem("sila.opskey") || "",
    roomId: null, ws: null, view: null,
    packs: [], lines: [],
    usedPrompts: new Set(),
    lastEventSeq: 0,
  };

  // =============================================== landing
  $("key-input").value = S.key;
  $("key-input").addEventListener("input", () => { S.key = $("key-input").value.trim(); localStorage.setItem("sila.opskey", S.key); });

  async function listRooms() {
    const res = await fetch("/api/rooms");
    const rooms = await res.json();
    const box = $("room-list");
    box.innerHTML = rooms.length ? "" : '<p class="dim">No rooms yet — create one.</p>';
    for (const r of rooms) {
      const row = document.createElement("div");
      row.className = "room-row";
      row.innerHTML = `<span class="mono">${r.room_id}</span><span class="meta">${r.master_state} · ${r.seated}/6 seated</span>`;
      row.onclick = () => openConsole(r.room_id);
      box.appendChild(row);
    }
  }
  $("refresh-rooms").onclick = listRooms;
  $("create-room").onclick = async () => {
    $("landing-err").textContent = "";
    const res = await fetch("/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ops_key: S.key }) });
    const data = await res.json();
    if (!res.ok) { $("landing-err").textContent = data.error === "bad_ops_key" ? "Bad ops key (it's printed when the server boots)." : "Failed."; return; }
    openConsole(data.room_id);
  };
  listRooms();

  // =============================================== console boot
  async function openConsole(roomId) {
    if (!S.key) { $("landing-err").textContent = "Enter the ops key first."; return; }
    S.roomId = roomId;
    $("landing").hidden = true;
    $("console").hidden = false;
    $("room-id").textContent = roomId + "  ·  players join at /play with this code";
    const [packs, lines] = await Promise.all([
      fetch("/api/content/packs").then((r) => r.json()),
      fetch("/api/content/lines").then((r) => r.json()),
    ]);
    S.packs = packs; S.lines = lines;
    buildLineSelect();
    connect();
    setInterval(pollEvents, 4000);
  }

  function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/ops/${encodeURIComponent(S.roomId)}?key=${encodeURIComponent(S.key)}`);
    S.ws = ws;
    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === "ops.view") { S.view = msg.view; render(); }
      if (msg.type === "ops.error") toast("ops error: " + msg.code);
    };
    ws.onclose = () => setTimeout(connect, 1500);
  }
  const send = (msg) => { if (S.ws?.readyState === 1) S.ws.send(JSON.stringify(msg)); };

  // =============================================== render (view push → whole board)
  function render() {
    const v = S.view; if (!v) return;
    const st = v.state;
    document.body.classList.toggle("hold-active", !!st.flags.safety_hold);

    // clocks
    $("t-elapsed").textContent = fmt(st.clock.t_elapsed_s);
    $("t-hardstop").textContent = st.clock.t_start ? `hard stop −${fmt(Math.max(0, st.clock.session_hard_stop_s - st.clock.t_elapsed_s))}` : "not started";
    $("phase-lbl").textContent = PHASE_SHORT[st.master_state] ?? st.master_state;
    const b = st.clock.phase_budget_s;
    $("phase-elapsed").textContent = `${fmt(st.clock.phase_elapsed_s)} / ${b.target ? fmt(b.target) : "—"}`;
    if (b.max > 0) {
      $("budget-min").style.left = `${(b.min / b.max) * 100}%`;
      $("budget-target").style.left = `${(b.target / b.max) * 100}%`;
      const pct = Math.min(100, (st.clock.phase_elapsed_s / b.max) * 100);
      $("budget-fill").style.width = pct + "%";
      $("budget-fill").classList.toggle("over", st.clock.phase_elapsed_s > b.target);
    } else { $("budget-fill").style.width = "0"; }

    // phase gates
    const gates = $("phase-gates");
    gates.innerHTML = "";
    const curIdx = MASTER.indexOf(st.master_state);
    MASTER.forEach((m, i) => {
      const g = document.createElement(i === curIdx + 1 ? "button" : "span");
      g.className = "gate " + (i < curIdx ? "done" : i === curIdx ? "now" : i === curIdx + 1 ? "next" : "");
      g.textContent = PHASE_SHORT[m];
      g.title = m;
      if (i === curIdx + 1) g.onclick = () => send({ type: "ops.state_transition", to: m, force: $("force-chk")?.checked ?? false });
      gates.appendChild(g);
    });
    if (curIdx < MASTER.length - 1) {
      const f = document.createElement("label");
      f.className = "forcechk";
      f.innerHTML = `<input type="checkbox" id="force-chk" ${$("force-chk")?.checked ? "checked" : ""}/> force`;
      gates.appendChild(f);
    }

    // flags
    $("hold-btn").classList.toggle("on", st.flags.safety_hold);
    $("pause-btn").classList.toggle("on", st.flags.paused);

    // beat rail
    const rail = $("beat-rail");
    if (!rail.childElementCount) MICRO.forEach((m) => { const d = document.createElement("div"); d.className = "beat"; d.textContent = m.replace("_", " "); d.dataset.m = m; rail.appendChild(d); });
    for (const d of rail.children) d.classList.toggle("on", d.dataset.m === st.micro_state);

    renderDeck(st);
    renderRound(v, st);
    renderRoster(v, st);
    renderMoments(st);
    renderWarnings(v);
    renderLoop(st);
    $("dir-active").textContent = st.active_directive
      ? `active: ${st.active_directive.intervention} → ${nameOf(st.active_directive.target_uid) ?? "room"} · ${st.active_directive.note} (expires in ${st.active_directive.expires_after_events} rounds)`
      : "none active — consumed at the next round open";
  }

  // ---------------- deck
  function renderDeck(st) {
    const sel = $("pack-select");
    const phase = (st.master_state.match(/^([ABCDE])_/) || [])[1] || null;
    const filter = $("phase-filter").checked && phase;
    const packs = S.packs.filter((p) => !filter || p.phase === phase);
    const sig = packs.map((p) => p.pack_id).join(",");
    if (sel.dataset.sig !== sig) {
      const prevVal = sel.value;
      sel.innerHTML = packs.map((p) => `<option value="${p.pack_id}">${esc(p.title)} · ${p.mechanic}</option>`).join("");
      sel.dataset.sig = sig;
      if ([...sel.options].some((o) => o.value === prevVal)) sel.value = prevVal;
      sel.onchange = () => renderPromptList();
      renderPromptList();
    }
  }
  $("phase-filter").addEventListener("change", () => { $("pack-select").dataset.sig = ""; render(); });

  function renderPromptList() {
    const pack = S.packs.find((p) => p.pack_id === $("pack-select").value);
    const box = $("prompt-list");
    box.innerHTML = "";
    if (!pack) return;
    for (const pr of pack.prompts) {
      const row = document.createElement("div");
      row.className = "prompt-row" + (S.usedPrompts.has(pr.prompt_id) ? " used" : "");
      row.innerHTML = `<span class="p-title">${esc(pr.body.title)}</span><span class="p-text">${esc(pr.body.text)}</span>`;
      const btn = document.createElement("button");
      btn.textContent = "Open";
      btn.onclick = () => { S.usedPrompts.add(pr.prompt_id); send({ type: "ops.round_open", pack_id: pack.pack_id, prompt_id: pr.prompt_id }); };
      row.appendChild(btn);
      box.appendChild(row);
    }
  }

  // ---------------- round state (adjudicate / submissions)
  function renderRound(v, st) {
    const r = st.active_round;
    const inAdj = st.micro_state === "ADJUDICATE" || st.micro_state === "BUZZ_LOCK";
    $("adjudicate-box").hidden = !r || !inAdj;
    if (r && inAdj) {
      const wsel = $("winner-select");
      const opts = st.participants.filter((p) => p.conn !== "LEFT")
        .map((p) => `<option value="${p.uid}" ${r.winner_uid === p.uid ? "selected" : ""}>${esc(p.display)}${r.winner_uid === p.uid ? " (buzzed first)" : ""}</option>`)
        .join("");
      const sig = opts + (r.winner_uid ?? "");
      if (wsel.dataset.sig !== sig) { wsel.innerHTML = opts; wsel.dataset.sig = sig; }
    }
    const subs = v.submissions_pending;
    $("submissions-box").hidden = !subs;
    if (subs) {
      $("sub-count").textContent = `(${subs.length})`;
      $("sub-list").innerHTML = subs
        .map((s) => `<li>${$("attr-toggle").checked ? `<span class="who">${esc(s.display)}</span>` : ""}${esc(s.value)}</li>`)
        .join("");
    }
    $("lock-now").disabled = !r || st.micro_state !== "PROMPT_OPEN";
    $("scrap-btn").disabled = !r;
  }
  $("attr-toggle").addEventListener("change", () => render());
  $("lock-now").onclick = () => send({ type: "ops.round_lock_now" });
  $("scrap-btn").onclick = () => send({ type: "ops.round_scrap", reason: "operator scrap" });
  $("adj-correct").onclick = () => send({ type: "ops.adjudicate", correct: true, winner_uid: $("winner-select").value || null });
  $("adj-wrong").onclick = () => send({ type: "ops.adjudicate", correct: false, winner_uid: $("winner-select").value || null });

  // ---------------- roster + telemetry + vault reveal grants
  function renderRoster(v, st) {
    const box = $("roster");
    box.innerHTML = "";
    for (const p of st.participants) {
      const row = document.createElement("div");
      row.className = "p-row";
      const tele = p.live;
      const vault = (v.vault && v.vault[p.uid]) || {};
      const vaultBtns = Object.entries(vault).map(([field, value]) => {
        const granted = p.reveals_unlocked.includes(field);
        return `<button data-uid="${p.uid}" data-field="${esc(field)}" data-value="${esc(value)}" class="${granted ? "granted" : ""}" title="${esc(value)}">✦ ${esc(field.replace(/_/g, " "))}</button>`;
      }).join("");
      row.innerHTML = `
        <span class="nm"><span class="conn ${p.conn}"></span>${esc(p.display)}${p.device_role === "SPEAKER" ? " 🔊" : ""}</span>
        <span></span><span class="score">${p.score}</span>
        <span class="tele">share ${pct(tele.participation_share)} · init ${pct(tele.initiative)} · win ${pct(tele.success_rate)} · buzz ${tele.median_buzz_ms ?? "—"}ms · rtt ${p.rtt_ms ? Math.round(p.rtt_ms) : "—"}ms</span>
        ${vaultBtns ? `<span class="vaultline">${vaultBtns}</span>` : ""}`;
      box.appendChild(row);
    }
    box.querySelectorAll(".vaultline button").forEach((b) => {
      b.onclick = () => send({ type: "ops.reveal_grant", about_uid: b.dataset.uid, field: b.dataset.field, value: b.dataset.value });
    });
    const m = st.room_metrics;
    $("room-metrics").innerHTML = `<span>gini ${m.gini_participation}</span><span>energy ${m.energy}</span><span>silence ${Math.round(m.silence_run_ms / 1000)}s</span><span>laughs(5m) ${m.laughter_events_5m}</span><span>last engage ${m.prompt_engagement_last ?? "—"}</span>`;

    // keep directive target select in sync
    const dsel = $("dir-target");
    const opts = '<option value="">room-wide</option>' + st.participants.filter((p) => p.conn !== "LEFT").map((p) => `<option value="${p.uid}">${esc(p.display)}</option>`).join("");
    if (dsel.dataset.sig !== opts) { const prev = dsel.value; dsel.innerHTML = opts; dsel.dataset.sig = opts; dsel.value = prev; }
  }

  // ---------------- Rawi line deck
  function buildLineSelect() {
    $("line-select").innerHTML = S.lines.map((l) => `<option value="${l.key}">${l.key}</option>`).join("");
    $("line-select").onchange = buildSlotInputs;
    buildSlotInputs();
  }
  function currentLine() { return S.lines.find((l) => l.key === $("line-select").value); }
  function slotNames(line) {
    const set = new Set();
    for (const v of line.variants) for (const m of v.matchAll(/\{(\w+)\}/g)) set.add(m[1]);
    return [...set];
  }
  function buildSlotInputs() {
    const line = currentLine(); if (!line) return;
    const box = $("slot-inputs");
    box.innerHTML = "";
    for (const s of slotNames(line)) {
      const row = document.createElement("div");
      row.className = "slot-row";
      row.innerHTML = `<span class="slot-name">{${s}}</span><input data-slot="${s}" /><span class="quick"></span>`;
      const quick = row.querySelector(".quick");
      const names = (S.view?.state.participants ?? []).filter((p) => p.conn !== "LEFT").map((p) => p.display);
      for (const n of names.slice(0, 6)) {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = n;
        b.onclick = () => { row.querySelector("input").value = n; preview(); };
        quick.appendChild(b);
      }
      row.querySelector("input").addEventListener("input", preview);
      box.appendChild(row);
    }
    preview();
  }
  function slotValues() {
    const out = {};
    $("slot-inputs").querySelectorAll("input[data-slot]").forEach((i) => { if (i.value.trim()) out[i.dataset.slot] = i.value.trim(); });
    return out;
  }
  function preview() {
    const line = currentLine(); if (!line) return;
    const slots = slotValues();
    const text = line.variants[0].replace(/\{(\w+)\}/g, (_, k) => slots[k] ?? `{${k}}`);
    const ready = !/\{\w+\}/.test(text);
    const p = $("line-preview");
    p.textContent = text + (line.variants.length > 1 ? `   (+${line.variants.length - 1} variants, auto-rotated)` : "");
    p.classList.toggle("ready", ready);
  }
  $("fire-line").onclick = () => send({ type: "ops.host_say", line_key: $("line-select").value, slots: slotValues() });
  $("fire-custom").onclick = () => {
    const t = $("custom-line").value.trim();
    if (!t) return;
    send({ type: "ops.host_say", text: t });
    $("custom-line").value = "";
  };

  // ---------------- moments
  function renderMoments(st) {
    const box = $("moments-list");
    box.innerHTML = "";
    for (const m of [...st.moments].reverse().slice(0, 12)) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="kind">${m.kind}</span><span class="hint-text">${esc(m.phrase_hint)}</span>`;
      const cb = document.createElement("button");
      cb.textContent = "↩ callback";
      cb.onclick = () => send({ type: "ops.host_say", line_key: "CALLBACK", slots: { phrase: m.phrase_hint } });
      li.appendChild(cb);
      box.appendChild(li);
    }
  }
  $("moment-tag").onclick = () => {
    const hint = $("moment-hint").value.trim();
    if (!hint) return;
    send({ type: "ops.moment_tag", kind: "OPERATOR_TAGGED", tag: hint.toLowerCase().replace(/\W+/g, "_").slice(0, 32), phrase_hint: hint, participants: [] });
    $("moment-hint").value = "";
  };

  // ---------------- directives
  $("dir-set").onclick = () => send({ type: "ops.directive_set", intervention: $("dir-kind").value, target_uid: $("dir-target").value || null, note: $("dir-note").value.trim() || $("dir-kind").value });
  $("dir-clear").onclick = () => send({ type: "ops.directive_clear" });

  // ---------------- warnings + log
  function renderWarnings(v) {
    $("warnings").innerHTML = [...v.warnings].reverse()
      .map((w) => `<li class="${/HOLD|HARD STOP|DROPPED|budget reached/i.test(w) ? "hot" : ""}">${esc(w)}</li>`).join("");
  }
  async function pollEvents() {
    if (!S.roomId) return;
    try {
      const evts = await fetch(`/api/rooms/${S.roomId}/events?key=${encodeURIComponent(S.key)}&n=40`).then((r) => r.json());
      if (!Array.isArray(evts)) return;
      $("event-log").innerHTML = [...evts].reverse()
        .map((e) => `<li><span class="seq">${e.seq}</span><span class="etype">${esc(e.type)}</span><span>${esc(shortPayload(e))}</span></li>`).join("");
    } catch { /* server away; ws reconnect covers it */ }
  }
  function shortPayload(e) {
    const p = e.payload || {};
    const bits = [];
    for (const k of ["uid", "winner_uid", "from", "to", "conn", "severity", "name", "prompt_id", "on"]) if (p[k] !== undefined && p[k] !== null) bits.push(`${k}=${p[k]}`);
    return bits.join(" ").slice(0, 90);
  }

  // ---------------- flags + loop tools
  $("hold-btn").onclick = () => send({ type: "ops.hold", on: !S.view?.state.flags.safety_hold, reason: "operator" });
  $("pause-btn").onclick = () => send({ type: "ops.pause", on: !S.view?.state.flags.paused, reason: "venue" });

  function renderLoop(st) {
    const csel = $("christen-select");
    const sugg = Object.entries(st.cohort_seed.name_suggestions || {});
    const opts = '<option value="">— name suggestions —</option>' + sugg.map(([uid, n]) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
    if (csel.dataset.sig !== opts) { csel.innerHTML = opts; csel.dataset.sig = opts; }
    csel.onchange = () => { if (csel.value) $("christen-input").value = csel.value; };
  }
  $("poll-open").onclick = () => {
    const slots = [$("slot-1").value, $("slot-2").value, $("slot-3").value].map((s) => s.trim()).filter(Boolean);
    send({ type: "ops.poll_open", slots });
  };
  $("poll-close").onclick = () => send({ type: "ops.poll_close" });
  $("christen-btn").onclick = () => {
    const name = $("christen-input").value.trim();
    if (name) send({ type: "ops.christen", name });
  };
  $("cancel-btn").onclick = () => { if (confirm("Cancel graceful? (LOBBY-only — players get the concierge apology beat)")) send({ type: "ops.cancel_graceful", reason: "under 4 present" }); };
  $("close-btn").onclick = () => { if (confirm("Close the room and write the outcome?")) send({ type: "ops.close_room" }); };
  $("outcome-btn").onclick = async () => {
    const data = await fetch(`/api/rooms/${S.roomId}/summary?key=${encodeURIComponent(S.key)}`).then((r) => r.json());
    $("outcome-json").textContent = JSON.stringify({ outcome: data.outcome, objectives: data.state?.objectives }, null, 2);
    $("outcome-modal").hidden = false;
  };
  $("outcome-close").onclick = () => { $("outcome-modal").hidden = true; };

  // ---------------- utils
  function fmt(s) { s = Math.max(0, Math.floor(s)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
  const pct = (x) => `${Math.round((x ?? 0) * 100)}%`;
  function esc(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }
  function nameOf(uid) { return S.view?.state.participants.find((p) => p.uid === uid)?.display ?? null; }
  let toastEl = null;
  function toast(t) { toastEl?.remove(); toastEl = document.createElement("div"); toastEl.className = "toast"; toastEl.textContent = t; document.body.appendChild(toastEl); setTimeout(() => toastEl?.remove(), 2500); }
})();
