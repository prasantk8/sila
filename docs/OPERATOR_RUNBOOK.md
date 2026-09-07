# SILA M0 — Operator Runbook

You are Rawi tonight. The room never sees you. Your job is warmth, pace, and dignity — the engine handles fairness and safety. Keep the console on a laptop; keep the venue staff on speed-dial.

## Before the room (T−15)
1. Start the server on the venue laptop. Note the **ops key** printed at boot.
2. Open `/ops`, paste the key, click **+ New room**. Note the `room_id`.
3. Get the join link to the table: `http://<laptop-ip>:8080/play?room=<room_id>` (QR it if you can).
4. Watch the roster fill. Each player's card shows their consented vault facts — your C-phase ammo.

## The five acts
Advance with the phase-gate chips (top strip). The engine **blocks** an early advance unless you tick **force**; it **warns** you (Advisories panel) when a phase hits its budget max. Trust the warnings — they are the M1 Pacer, run by hand.

### LOBBY → A_BASELINE
- Need **≥4** present. If 4+ are in, the gate opens cleanly. If not by start+10, use **Cancel graceful** — players get the concierge apology (line `LOBBY.CANCELLED`) + priority rebooking. This must feel like *the product taking responsibility*, never like being stood up.
- Fire `LOBBY.WELCOME`, then `A.HOST_WELCOME`.

### A_BASELINE — the handshake (6–10 min)
- Open an `ALL_SUBMIT` from `pk_a_handshake_01` ("one word for your week"). Everyone types; nobody's name shows. You read them back through `A.SUBMIT_READBACK` (the `{phrase}` slot).
- This silently captures each player's participation baseline. Drop a couple of `pk_a_warmup_tap` ALL_TAPs to warm thumbs.

### B_REACTION — buzzers (15–25 min)
- This is the engine's showcase. Open `OPEN_BUZZ` prompts from `pk_b_food_uae_01` / `pk_b_city_uae_01`. Buzz winner appears in the **Adjudicate** box.
- Food/city prompts have accept-lists → **auto-scored**. For open ones, listen to the answer and hit **✓ Correct (+10)** or **✗ Wrong**.
- On a **photo finish** the console toasts you — milk it with `B_REACTION.ROUND_RESULT.photo_finish` (`{winner}`/`{loser}` slots).
- Slip in `pk_b_blitz_01` binary taps to reset energy.

### C_DISCOVERY — the reveal, earned (20–35 min)
- Open `WHOSE_IS_THIS` from `pk_c_whose_01`. Read one vault fact aloud via `C.FACT_READ` (`{fact}` slot). Players buzz to guess whose it is.
- When guessed, click the **✦ fact button** on the owner's roster card → that fires `reveal_grant`; their member card *fills in* on every phone. Celebrate with `C.REVEAL_CELEBRATE`.
- **Coverage rule:** make sure every player's card gains at least one fact this phase. The roster telemetry shows who's still blank.

### D_IMPROV — laughter catalyst (15–22 min)
- `PITCH_OFF` / `STORY_CHAIN` / `SOUND_ONLY`. Each player's phone shows only *their* cue. You MC out loud; the table performs. Award +10 to a winner or just scrap-and-move — points matter less than the laugh.
- Tag every big laugh in the **Moments** panel — that's your callback ammunition and the recap material.

### E_LOOP — turn a night into a habit (8–12 min)
1. Recap: fire `E.RECAP_INTRO` (top moment) then `E.RECAP_PERSON` once per player — the roster guarantees you can name a contribution for everyone.
2. **Christen:** open the `pk_e_christen_01` ALL_SUBMIT; suggestions populate the christen dropdown; pick one, click **Christen**.
3. **One-tap poll:** fill three slots, **Open poll**, let them tap, **Close poll**. This is the single highest-leverage retention action — do it *in the room, while warm*.
4. Christen + closed poll auto-emit the cohort loop artifact and every phone shows the send-off. Fire `E.SEND_OFF`.
5. **Close room** → writes `outcome.json`. Review via **Outcome**.

## Failure playbooks
- **Someone drops:** engine covers seat context. Fire `COVER_DISCONNECT` **once** by name, then never mention it. They rejoin seamlessly (state resyncs; "Rawi is catching his breath" shows briefly).
- **Stalemate / silence:** Advisories will suggest a **CALLBACK** (fire the moment's line) or a **BINARY_BLITZ** (drop an ALL_TAP). Sacred rule: a laugh's afterglow silence is *left alone* — don't fill it.
- **Dominant player:** set a directive **ENGINEERED_WIN** or **PAIR_SHIELD** targeting a quieter player; the next round you open gets targeted. Never call anyone out — interventions surface as game rules, never as observations about a person.
- **Flopped prompt:** engine warns `flopped`. Fire `RESCUE_BEAT`, **Scrap round**, draw from a different sub-pack.
- **Safety signal (HIGH):** the room freezes itself, the reporter sees a private reassurance card, and you get a hold. **Do not speak** except `SAFETY.RESUME`. Handle the human situation with venue staff *first*; only release the hold when the room is genuinely ready.
- **Food arrives / fire alarm:** **Pause** (clock stops, scores safe), fire `PAUSE.ON`; **Pause** again to resume with `PAUSE.RESUME`.

## The two rules that override everything
1. **Safety > dignity > inclusion > pacing > fun > score-drama.** When they conflict, that order decides.
2. **Interventions are game rules, never comments about a person.** The room should never feel managed.
