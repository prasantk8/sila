/* SILA player client — vanilla, no build step.
   Contract: SILA_Invisible_Host_Architecture_v1.md §2.3 (c.* / s.*).
   Time sync: 5-ping median at join, refreshed every 120 s (§ Module 3).
   Buzz: <50 ms debounce, immediate haptic, server adjudicates on t_recv − rtt/2. */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const els = {
    body: document.body, join: $("join"), room: $("room"),
    joinForm: $("join-form"), roomInput: $("room-input"), displayInput: $("display-input"),
    vault1: $("vault-1"), vault2: $("vault-2"), tagsInput: $("tags-input"),
    joinBtn: $("join-btn"), joinError: $("join-error"),
    phaseName: $("phase-name"), connDot: $("conn-dot"), scores: $("scores"), moreBtn: $("more-btn"),
    caption: $("caption"), captionText: $("caption-text"),
    promptCard: $("prompt-card"), promptTitle: $("prompt-title"), promptText: $("prompt-text"),
    cueBox: $("cue-box"), cueText: $("cue-text"),
    choices: $("choices"), submitForm: $("submit-form"), submitInput: $("submit-input"),
    answerForm: $("answer-form"), answerInput: $("answer-input"),
    tally: $("tally"), timerArc: $("timer-arc"), timerLabel: $("timer-label"), timerRing: $("timer-ring"),
    buzzerZone: $("buzzer-zone"), buzzer: $("buzzer"), buzzerLabel: $("buzzer-label"),
    members: $("members"), sendoff: $("sendoff"), soName: $("so-name"), soSlot: $("so-slot"), soMoments: $("so-moments"),
    overlay: $("overlay"), overlayIcon: $("overlay-icon"), overlayTitle: $("overlay-title"), overlayText: $("overlay-text"),
    sheet: $("sheet"), leaveBtn: $("leave-btn"), safetyBtn: $("safety-btn"), sheetClose: $("sheet-close"),
  };

  const PHASE_LABEL = {
    LOBBY: "Lobby", A_BASELINE: "Act I · Warm-up", B_REACTION: "Act II · Buzzers",
    C_DISCOVERY: "Act III · The Table", D_IMPROV: "Act IV · Improv", E_LOOP: "Act V · The Loop", CLOSED: "Curtain",
  };

  // ---------------------------------------------------------- session
  const S = {
    roomId: null, uid: null, ticket: null, display: null,
    ws: null, wsOpen: false, lastSeq: 0, backoff: 800,
    clockOffset: 0, // serverNow ≈ Date.now() + offset
    phase: "LOBBY", micro: "IDLE",
    prompt: null, myTapDone: false, mySubmitDone: false,
    participants: [], reveals: [],
    lastBuzzAt: 0, speakerUid: null, holdOn: false, pauseOn: false,
    leftQuietly: false,
  };

  const save = () => { try { localStorage.setItem("sila.session", JSON.stringify({ roomId: S.roomId, uid: S.uid, ticket: S.ticket, display: S.display, lastSeq: S.lastSeq })); } catch {} };
  const restore = () => { try { return JSON.parse(localStorage.getItem("sila.session") || "null"); } catch { return null; } };
  const clearSaved = () => { try { localStorage.removeItem("sila.session"); } catch {} };

  // ---------------------------------------------------------- boot
  const params = new URLSearchParams(location.search);
  if (params.get("room")) els.roomInput.value = params.get("room");
  const prev = restore();
  if (prev && prev.ticket && (!params.get("room") || params.get("room") === prev.roomId)) {
    // seamless rejoin — "Rawi is catching his breath" if it fails
    Object.assign(S, prev);
    enterRoom();
    connect();
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/play/sw.js").catch(() => {});

  // ---------------------------------------------------------- join
  els.joinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    els.joinError.textContent = "";
    els.joinBtn.disabled = true;
    const roomId = els.roomInput.value.trim();
    const display = els.displayInput.value.trim();
    const vault = {};
    if (els.vault1.value.trim()) vault.comfort_food = els.vault1.value.trim();
    if (els.vault2.value.trim()) vault.tiny_story = els.vault2.value.trim();
    const tags = els.tagsInput.value.split(",").map((t) => t.trim()).filter(Boolean);
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ display, affinity_tags: tags, vault }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === "room_full" ? "That table is full tonight." : data.error === "no_such_room" ? "No room with that code." : "Couldn't join — try again.");
      S.roomId = roomId; S.uid = data.uid; S.ticket = data.ticket; S.display = display; S.lastSeq = 0;
      save();
      enterRoom();
      connect();
    } catch (err) {
      els.joinError.textContent = err.message || "Couldn't join.";
    } finally {
      els.joinBtn.disabled = false;
    }
  });

  function enterRoom() {
    els.join.hidden = true;
    els.room.hidden = false;
  }

  // ---------------------------------------------------------- websocket
  function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/room/${encodeURIComponent(S.roomId)}`);
    S.ws = ws;
    ws.onopen = () => {
      S.wsOpen = true; S.backoff = 800;
      els.connDot.classList.remove("off");
      ws.send(JSON.stringify({
        type: "c.hello", uid: S.uid, room_ticket: S.ticket, display: S.display,
        last_seq: S.lastSeq, device_caps: deviceCaps(),
      }));
      timeSync(5);
    };
    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      handle(msg);
    };
    ws.onclose = () => {
      S.wsOpen = false;
      els.connDot.classList.add("off");
      if (S.leftQuietly || S.phase === "CLOSED") return;
      setCaption("Rawi is catching his breath…", false);
      setTimeout(connect, S.backoff);
      S.backoff = Math.min(S.backoff * 1.7, 8000);
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  const send = (msg) => { if (S.wsOpen) S.ws.send(JSON.stringify(msg)); };

  function deviceCaps() {
    const net = navigator.connection?.effectiveType;
    return {
      audio_out: "speechSynthesis" in window,
      battery: null,
      net: net === "4g" ? "good" : net ? "ok" : null,
    };
  }
  // battery is async; patch it in once known
  if (navigator.getBattery) navigator.getBattery().then((b) => { S.battery = b.level; }).catch(() => {});

  // ---------------------------------------------------------- time sync (5-ping median, refresh 120 s)
  let pongs = [];
  function timeSync(n) {
    pongs = [];
    for (let i = 0; i < n; i++) setTimeout(() => send({ type: "c.time_ping", t0_client: Date.now() }), i * 220);
  }
  setInterval(() => { if (S.wsOpen) timeSync(5); }, 120000);

  function onPong(t0, t1server) {
    const now = Date.now();
    const rtt = now - t0;
    pongs.push(t1server + rtt / 2 - now); // offset sample
    if (pongs.length >= 3) {
      const s = [...pongs].sort((a, b) => a - b);
      S.clockOffset = s[Math.floor(s.length / 2)];
    }
  }
  const serverNow = () => Date.now() + S.clockOffset;

  // ---------------------------------------------------------- inbound
  function handle(msg) {
    if (typeof msg.seq === "number" && msg.seq > 0) { S.lastSeq = Math.max(S.lastSeq, msg.seq); save(); }
    switch (msg.type) {
      case "s.hello_ack": break;
      case "s.time_pong": onPong(msg.t0, msg.t1_server); break;
      case "s.state_sync": applyState(msg.state); break;
      case "s.phase": setPhase(msg.master_state); closePrompt(); break;
      case "s.prompt": openPrompt(msg); break;
      case "s.buzz_lock": onBuzzLock(msg); break;
      case "s.buzz_result": onBuzzResult(msg); break;
      case "s.score": onScore(msg); break;
      case "s.host_say": onHostSay(msg); break;
      case "s.reveal_grant": onReveal(msg); break;
      case "s.role_assign": if (msg.uid === S.uid) toast(`You're the ${msg.role} this round`); break;
      case "s.tap_tally": onTally(msg); break;
      case "s.hold": onHold(msg.on); break;
      case "s.pause": onPause(msg.on); break;
      case "s.send_off": onSendOff(msg); break;
      case "s.error": onServerError(msg); break;
    }
  }

  function onServerError(msg) {
    if (msg.code === "bad_ticket" || msg.code === "unknown_uid" || msg.code === "no_such_room") {
      clearSaved();
      toast("Session expired — join again");
      setTimeout(() => location.replace("/play"), 1200);
    }
  }

  // ---------------------------------------------------------- state projection
  function applyState(st) {
    if (!st) return;
    S.participants = st.participants || [];
    S.reveals = st.reveal_grants || [];
    S.holdOn = !!st.flags?.safety_hold;
    S.pauseOn = !!st.flags?.paused;
    setPhase(st.master_state);
    renderScores();
    renderMembers();
    if (st.active_round && (st.micro_state === "PROMPT_OPEN" || st.micro_state === "BUZZ_LOCK" || st.micro_state === "ADJUDICATE")) {
      openPrompt({
        prompt_id: st.active_round.prompt_id, mechanic: st.active_round.mechanic,
        body: st.active_round.body, targeting: st.active_round.targeting,
        timer_s: st.active_round.timer_s, opened_at: st.active_round.opened_at,
      }, true);
      if (st.micro_state !== "PROMPT_OPEN") lockBuzzer(st.active_round.winner_uid === S.uid ? "you" : "other");
    } else {
      closePrompt();
    }
    onHold(S.holdOn, true);
    onPause(S.pauseOn, true);
    if (st.master_state === "CLOSED" && st.cohort?.name) {
      onSendOff({ cohort_name: st.cohort.name, winning_slot: st.cohort.winning_slot, top_moments: [] });
    }
  }

  function setPhase(phase) {
    if (!phase || phase === S.phase) { els.phaseName.textContent = PHASE_LABEL[S.phase] || S.phase; return; }
    S.phase = phase;
    els.body.dataset.phase = S.holdOn ? "SAFETY" : phase;
    els.phaseName.textContent = PHASE_LABEL[phase] || phase;
  }

  // ---------------------------------------------------------- scores + members
  function renderScores() {
    els.scores.innerHTML = "";
    for (const p of S.participants) {
      if (p.conn === "LEFT") continue;
      const pill = document.createElement("span");
      pill.className = "score-pill" + (p.uid === S.uid ? " me" : "");
      pill.dataset.uid = p.uid;
      pill.innerHTML = `${escapeHtml(firstName(p.display))} <b>${p.score}</b>`;
      els.scores.appendChild(pill);
    }
  }

  function renderMembers() {
    els.members.innerHTML = "";
    for (const p of S.participants) {
      const card = document.createElement("div");
      card.className = "member" + (p.uid === S.uid ? " me" : "") + (p.conn === "LEFT" ? " gone" : "");
      const facts = S.reveals.filter((r) => r.about_uid === p.uid);
      const factHtml = facts.map((f) => `<span class="fact"><b>${escapeHtml(pretty(f.field))}</b> — ${escapeHtml(f.value)}</span>`).join("");
      const slots = facts.length === 0 ? `<span class="fact-slot">card fills as the table earns it</span>` : "";
      card.innerHTML = `
        <div class="member-head">
          <span class="member-name">${escapeHtml(p.display)}${p.device_role === "SPEAKER" ? ' <span class="spk">🔊</span>' : ""}</span>
          <span class="member-score">${p.score}</span>
        </div>
        <div class="member-facts">${factHtml}${slots}</div>`;
      els.members.appendChild(card);
    }
  }

  function onScore(msg) {
    for (const t of msg.totals) {
      const p = S.participants.find((x) => x.uid === t.uid);
      if (p) p.score = t.score;
    }
    renderScores();
    renderMembers();
    for (const d of msg.deltas) {
      const pill = els.scores.querySelector(`[data-uid="${cssEscape(d.uid)}"]`);
      if (pill) { pill.classList.add("bump"); setTimeout(() => pill.classList.remove("bump"), 800); }
    }
  }

  function onReveal(msg) {
    S.reveals.push(msg);
    const p = S.participants.find((x) => x.uid === msg.about_uid);
    renderMembers();
    toast(`${p ? firstName(p.display) : "Someone"}'s card just grew ✦`);
  }

  // ---------------------------------------------------------- Rawi (captions + device TTS)
  let typeTimer = null;
  function setCaption(text, speaking) {
    els.caption.classList.toggle("speaking", !!speaking);
    if (typeTimer) clearInterval(typeTimer);
    if (!speaking) { els.captionText.textContent = text; return; }
    // gentle typewriter — paced roughly to speech
    els.captionText.textContent = "";
    let i = 0;
    typeTimer = setInterval(() => {
      i += 2;
      els.captionText.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(typeTimer);
    }, 28);
  }

  function onHostSay(msg) {
    setCaption(msg.text, true);
    if (msg.audio?.mode === "device_tts" && msg.speaker_device_uid === S.uid && "speechSynthesis" in window) {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(msg.text);
        u.rate = 1.02; u.pitch = 0.95;
        const voices = speechSynthesis.getVoices();
        const en = voices.find((v) => /en-(GB|IN|AU)/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang));
        if (en) u.voice = en;
        speechSynthesis.speak(u);
      } catch {}
    }
  }

  // ---------------------------------------------------------- prompt lifecycle
  const BUZZ_MECHS = ["OPEN_BUZZ", "WHOSE_IS_THIS", "GUESS_ORIGIN", "TWO_TRUTHS_TABLE"];
  const TAP_MECHS = ["ALL_TAP", "SPEED_SORT"];
  const STAGE_MECHS = ["STORY_CHAIN", "PITCH_OFF", "SOUND_ONLY"];
  let timerInt = null;

  function openPrompt(msg, silent) {
    S.prompt = msg;
    S.myTapDone = false;
    S.mySubmitDone = false;
    els.sendoff.hidden = true;
    els.promptCard.hidden = false;
    els.promptTitle.textContent = msg.body?.title || "";
    els.promptText.textContent = msg.body?.text || "";
    els.choices.hidden = true; els.choices.innerHTML = "";
    els.submitForm.hidden = true;
    els.answerForm.hidden = true;
    els.cueBox.hidden = true;
    els.tally.hidden = true; els.tally.innerHTML = "";
    els.buzzerZone.hidden = true;
    els.timerRing.style.display = "none";
    const note = els.promptCard.querySelector(".submitted-note");
    if (note) note.remove();

    const targetedAway = msg.targeting?.mode === "TARGETED" && msg.targeting.target_uid && msg.targeting.target_uid !== S.uid;

    if (BUZZ_MECHS.includes(msg.mechanic)) {
      els.buzzerZone.hidden = false;
      els.buzzer.disabled = !!targetedAway;
      els.buzzer.className = "";
      els.buzzerLabel.textContent = targetedAway ? "WATCH" : "BUZZ";
    } else if (TAP_MECHS.includes(msg.mechanic)) {
      els.choices.hidden = false;
      (msg.body?.choices || []).forEach((c, i) => {
        const b = document.createElement("button");
        b.className = "choice"; b.type = "button"; b.textContent = c;
        b.onclick = () => tap(i, b);
        els.choices.appendChild(b);
      });
      startTimer(msg);
    } else if (msg.mechanic === "ALL_SUBMIT") {
      els.submitForm.hidden = false;
      els.submitInput.value = "";
      startTimer(msg);
      if (!silent) setTimeout(() => els.submitInput.focus(), 350);
    } else if (STAGE_MECHS.includes(msg.mechanic)) {
      if (msg.body?.your_cue) {
        els.cueBox.hidden = false;
        els.cueText.textContent = msg.body.your_cue;
      }
    }
    if (!silent && navigator.vibrate) navigator.vibrate(6);
  }

  function closePrompt() {
    S.prompt = null;
    els.promptCard.hidden = true;
    els.buzzerZone.hidden = true;
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
  }

  function startTimer(msg) {
    if (!msg.timer_s) return;
    els.timerRing.style.display = "";
    const openedAt = msg.opened_at ? Date.parse(msg.opened_at) : serverNow();
    const C = 100.53;
    const tick = () => {
      const left = Math.max(0, msg.timer_s - (serverNow() - openedAt) / 1000);
      els.timerLabel.textContent = Math.ceil(left);
      els.timerArc.style.strokeDashoffset = String(C * (1 - left / msg.timer_s));
      if (left <= 0 && timerInt) { clearInterval(timerInt); timerInt = null; }
    };
    if (timerInt) clearInterval(timerInt);
    tick();
    timerInt = setInterval(tick, 500);
  }

  // ---------------------------------------------------------- buzzer (L0)
  els.buzzer.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const now = performance.now();
    if (now - S.lastBuzzAt < 50) return; // <50 ms debounce
    S.lastBuzzAt = now;
    if (!S.prompt || els.buzzer.disabled) return;
    els.buzzer.classList.add("pressed");
    if (navigator.vibrate) navigator.vibrate(8); // haptic before pixels (Module 3 HX)
    send({ type: "c.buzz", prompt_id: S.prompt.prompt_id, t_client: Date.now() });
  }, { passive: false });
  els.buzzer.addEventListener("pointerup", () => els.buzzer.classList.remove("pressed"));
  els.buzzer.addEventListener("pointercancel", () => els.buzzer.classList.remove("pressed"));

  function lockBuzzer(who) {
    els.buzzer.classList.remove("locked-you", "locked-other");
    els.buzzer.classList.add(who === "you" ? "locked-you" : "locked-other");
    els.buzzerLabel.textContent = who === "you" ? "YOURS" : "LOCKED";
  }

  function onBuzzLock(msg) {
    if (!S.prompt || msg.prompt_id !== S.prompt.prompt_id) return;
    lockBuzzer(msg.holder_uid === S.uid ? "you" : "other");
    if (msg.holder_uid === S.uid && navigator.vibrate) navigator.vibrate([8, 40, 12]);
  }

  function onBuzzResult(msg) {
    const mine = msg.winner_uid === S.uid;
    lockBuzzer(mine ? "you" : "other");
    if (mine) {
      // Wizard-of-Oz answer path: winner types what they said out loud
      els.answerForm.hidden = false;
      els.answerInput.value = "";
      setTimeout(() => els.answerInput.focus(), 250);
      if (navigator.vibrate) navigator.vibrate([10, 60, 18]);
    }
    if (msg.photo_finish) toast("📸 Photo finish — milliseconds in it");
  }

  els.answerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = els.answerInput.value.trim();
    if (!v || !S.prompt) return;
    send({ type: "c.answer", prompt_id: S.prompt.prompt_id, value: v });
    els.answerForm.hidden = true;
  });

  // ---------------------------------------------------------- taps + submits
  function tap(idx, btn) {
    if (S.myTapDone || !S.prompt) return;
    S.myTapDone = true;
    btn.classList.add("picked");
    for (const b of els.choices.children) b.disabled = true;
    if (navigator.vibrate) navigator.vibrate(8);
    send({ type: "c.answer", prompt_id: S.prompt.prompt_id, value: idx });
  }

  els.submitForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = els.submitInput.value.trim();
    if (!v || S.mySubmitDone || !S.prompt) return;
    S.mySubmitDone = true;
    send({ type: "c.answer", prompt_id: S.prompt.prompt_id, value: v });
    els.submitForm.hidden = true;
    const note = document.createElement("p");
    note.className = "submitted-note";
    note.textContent = "In. Only Rawi sees it.";
    els.promptCard.appendChild(note);
  });

  function onTally(msg) {
    els.tally.hidden = false;
    els.tally.innerHTML = "";
    const choices = S.prompt?.body?.choices || msg.tally.map((_, i) => `Option ${i + 1}`);
    const max = Math.max(1, ...msg.tally);
    msg.tally.forEach((n, i) => {
      const row = document.createElement("div");
      row.className = "tally-row";
      row.innerHTML = `<span>${escapeHtml(choices[i] ?? "—")}</span><span class="tally-n">${n}</span>
        <div class="tally-bar"><div class="tally-fill" style="width:0%"></div></div>`;
      els.tally.appendChild(row);
      requestAnimationFrame(() => { row.querySelector(".tally-fill").style.width = `${(n / max) * 100}%`; });
    });
    els.choices.hidden = true;
    els.buzzerZone.hidden = true;
    if (timerInt) { clearInterval(timerInt); timerInt = null; }
  }

  // ---------------------------------------------------------- reacts
  document.querySelectorAll(".react").forEach((b) => {
    b.addEventListener("click", () => {
      send({ type: "c.react", emoji_code: b.dataset.emoji });
      const fly = document.createElement("span");
      fly.className = "flying-emoji";
      fly.textContent = b.dataset.emoji;
      const r = b.getBoundingClientRect();
      fly.style.left = `${r.left + r.width / 2 - 13}px`;
      fly.style.top = `${r.top - 10}px`;
      document.body.appendChild(fly);
      setTimeout(() => fly.remove(), 1600);
      if (navigator.vibrate) navigator.vibrate(4);
    });
  });

  // ---------------------------------------------------------- hold / pause / send-off
  function onHold(on, silent) {
    S.holdOn = on;
    els.body.dataset.phase = on ? "SAFETY" : S.phase;
    if (on) {
      showOverlay("", "A quiet pause", "The game is on hold. A human is on it. Take your time — nothing continues until the room is ready.");
      closePrompt();
    } else if (!S.pauseOn) {
      hideOverlay();
      if (!silent) setCaption("We're back. Gently.", false);
    }
  }
  function onPause(on, silent) {
    S.pauseOn = on;
    if (on && !S.holdOn) showOverlay("⏸", "Intermission", "The clock is stopped. Scores are safe. Rawi waits.");
    else if (!on && !S.holdOn) hideOverlay();
  }
  function showOverlay(icon, title, text) {
    els.overlayIcon.textContent = icon;
    els.overlayTitle.textContent = title;
    els.overlayText.textContent = text;
    els.overlay.hidden = false;
  }
  function hideOverlay() { els.overlay.hidden = true; }

  function onSendOff(msg) {
    closePrompt();
    els.sendoff.hidden = false;
    els.soName.textContent = msg.cohort_name || "This table";
    els.soSlot.textContent = msg.winning_slot ? `Next time: ${msg.winning_slot}` : "";
    els.soMoments.innerHTML = (msg.top_moments || []).map((m) => `<li>${escapeHtml(m.phrase_hint)}</li>`).join("");
    els.body.dataset.phase = "E_LOOP";
    clearSaved(); // the night is over; the room won't be rejoined
  }

  // ---------------------------------------------------------- more sheet (leave / safety)
  els.moreBtn.addEventListener("click", () => { els.sheet.hidden = false; });
  els.sheetClose.addEventListener("click", () => { els.sheet.hidden = true; });
  els.sheet.addEventListener("click", (e) => { if (e.target === els.sheet) els.sheet.hidden = true; });

  els.leaveBtn.addEventListener("click", () => {
    if (!confirm("Step away quietly? Rawi covers for you once, then the game moves on without comment.")) return;
    S.leftQuietly = true;
    send({ type: "c.leave_discreet" });
    clearSaved();
    els.sheet.hidden = true;
    showOverlay("🌙", "Goodnight", "You slipped out gracefully. No announcement, no fuss. Thanks for playing.");
  });

  // press-and-hold safety (1.2 s) — dignified, no accidental fires
  let holdTimer = null;
  const holdbar = document.createElement("div");
  holdbar.className = "holdbar";
  els.safetyBtn.appendChild(holdbar);
  const startHold = (e) => {
    e.preventDefault();
    els.safetyBtn.classList.add("holding");
    holdTimer = setTimeout(() => {
      els.safetyBtn.classList.remove("holding");
      send({ type: "c.safety", severity: "HIGH" });
      els.sheet.hidden = true;
      // reporter-only reassurance (§3.8: protocol card shown to the reporter only)
      showOverlay("", "Heard.", "The room is paused and a human has your seat context. Nobody at the table knows this came from you. Venue staff are your fastest in-person help.");
    }, 1200);
  };
  const cancelHold = () => { els.safetyBtn.classList.remove("holding"); if (holdTimer) clearTimeout(holdTimer); };
  els.safetyBtn.addEventListener("pointerdown", startHold);
  els.safetyBtn.addEventListener("pointerup", cancelHold);
  els.safetyBtn.addEventListener("pointerleave", cancelHold);

  // ---------------------------------------------------------- utils
  let toastEl = null;
  function toast(text) {
    if (toastEl) toastEl.remove();
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    toastEl.textContent = text;
    document.body.appendChild(toastEl);
    setTimeout(() => { toastEl?.remove(); toastEl = null; }, 2600);
  }
  const firstName = (s) => String(s || "").split(" ")[0];
  const pretty = (s) => String(s || "").replace(/_/g, " ");
  function escapeHtml(s) { const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML; }
  const cssEscape = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&"));

  // voices load async on some platforms
  if ("speechSynthesis" in window) speechSynthesis.getVoices();
})();
