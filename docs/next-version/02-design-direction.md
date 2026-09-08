# SILA — Design Direction: the Broadcast Room

> Status: direction, pre-build. Supersedes nothing yet; extends `@sila/brand-genome` rather than replacing it.
> Companion artifact: `docs/next-version/prototype/index.html` (open directly in a browser).
> Scope: the visual and sensory direction for the "proper game show" version of a SILA room.

---

## 0. The tension, resolved (read this or nothing)

The manifesto's load-bearing sentence is: *"the future of social software is not more screen — it is the screen conspiring to get you off it, into a room, and then vanishing."* Pillar 1 measures success in **the minutes you don't spend inside the app**. The founder wants broadcast spectacle. On the face of it these cancel.

They don't, and the reason is precise: **the manifesto's enemy is not screens. It is private screens.**

A phone is a solitary window. Six phones at one table is six people in six separate rooms who happen to share a wifi network. A screen in the middle of the room is the opposite kind of object — it is furniture. A scoreboard in a bar, a TV during a match, a campfire. Everybody looks at the same thing at the same instant, and then — this is the whole mechanism — **they look at each other to check the reaction.** Shared attention is not stolen attention. Shared attention is what a room *is*.

So the split is adopted, and the success metric is restated:

> **Old:** minutes not spent looking at a screen.
> **New:** minutes not spent looking at *your own* screen.

Under that metric a stage screen is not a compromise with the manifesto — it is the most efficient known instrument for producing the manifesto's outcome. The spectacle is not the goal. The spectacle is a device for manufacturing the moment right after it.

### The three laws this creates

**Law 1 — The stage never holds attention longer than it takes to hand it to a person.**
Every stage state must terminate by pointing at a human being at the table. The question resolves into a name. The name resolves into a face. The scoreboard resolves into an empty ring and a silence. If a stage state can be watched passively for ten seconds, it is broken.

**Law 2 — The phone's default state is off.**
The phone renders only what is *private* (`your_cue`, your role, your secret word) or *actionable* (the buzzer, tap choices). It never renders the prompt during a buzz round, never renders the scoreboard, never renders Rawi's caption. If a player's phone has two things on it at once, we made a mistake. During `INTERSTITIAL` the phone goes literally black.

**Law 3 — The show is the setup; the interstitial is the punchline.**
`INTERSTITIAL` is not dead air to be filled. It is the state the entire machine is trying to reach — the seconds where six people who just watched the same thing turn to each other and talk about it. We build spectacle in order to buy silence. It gets designed with the same care as the reveal, and it is the only state where the stage is allowed to be nearly empty.

### What this costs, stated honestly

- It adds a required physical device per room (laptop, TV, or a tablet propped up). That is a real operations cost and a real failure mode. Mitigation: the stage is a URL, degrades to any 13"+ screen, and the room is playable without it at reduced spectacle — the phones keep their current fallback rendering.
- It concentrates audio on one device. This is actually a *win*: it deletes the `SPEAKER` device-election problem in Module 3 (battery/connection/device-class resource tagging) because the stage is always the speaker. One voice, from one place, like a venue. Rawi stops being a chorus of six tinny phones and becomes a room.
- The genuine risk is that the stage becomes **television** — something the table watches instead of something the table plays with. The guardrails against that are hard limits, not taste: nothing on the stage ever scrolls; no stage view is a list; the prompt has a word budget; the standings appear at most three times in ninety minutes and never longer than eight seconds.

### Rejected alternatives

| Option | Why not |
|---|---|
| Keep everything on phones, add broadcast styling to the PWA | Directly increases heads-down time. It is the manifesto violation the founder is worried about, and it makes the buzzer harder to hit because the screen is now busy. |
| Stage screen only, no phones | Kills the buzzer's determinism (`t_adj = t_recv - rtt/2` needs per-device input), kills `your_cue` privacy, kills the earned-reveal mechanic. Non-starter. |
| Project onto the table / ceiling | Lovely, unshippable in a rented café room in 2026. Revisit at venue scale. |
| Stage as a second "ops" view the operator drives | Confuses two audiences. Ops is dense and legible at 1am for one person; the stage is sparse and legible at 3 metres for six. Keep `/ops` exactly as it is. |

---

## 1. The one memorable element: **the Ring**

Everything else in this direction is disciplined and quiet. The entire boldness budget is spent here.

The stage screen has **no scoreboard, no leaderboard, no player grid, no lower-third name bars, no card deck.** It has one object: a circle of light that is a **plan view of the actual table**, drawn in the actual seating order of the actual room.

The Ring is one object doing four jobs at once:

1. **It is the seating chart.** Each player owns an arc, positioned where they are physically sitting relative to the screen. The person to your left is the arc to your left. When their arc lights up, your head turns left — at a person, not at a name. This is Law 1 made geometric.
2. **It is the scoreboard.** Score is arc **thickness**, not a number in a list. You can feel who is ahead in peripheral vision without anyone ever being publicly, numerically last.
3. **It is the clock.** A hairline outer track sweeps the round timer around the same circle.
4. **It is the buzzer indicator.** A buzz ignites one arc. A photo finish ignites two and draws a chord between them.

And it accumulates. Every earned reveal (`s.reveal_grant`) cuts a permanent **notch** into that player's arc. By minute ninety the Ring is scarred all the way round — a physical record of everything this table learned about each other tonight. That is the Joyful Scar from Module 7, rendered as geometry, and it is the send-off image at `CLOSED`.

**Why this is not generic broadcast styling.** The default AI-slop game-show look is: a deep-blue vignette, a neon leaderboard, chunky bevelled cards, laser sweeps, purple→cyan gradient wash, confetti. All of it is centred on the *screen* as the event. The Ring is centred on the *table* as the event — it is a diagram of the room the players are sitting in, and its only ornament is the damage it accumulates from play. No other product can copy it without also having six people in a physical circle. It is native to the ground, the same way the content is.

**The accessory removed before shipping:** the per-player flying emoji particle on the phone (`.flying-emoji` in `play.css`). Reaction taps still fire — they feed the `BIG_LAUGH` proxy — but the *rendering* moves to the stage as one shared bloom of the whole Ring. A laugh that six people see once, together, beats six private emoji that six people see separately. Also killed: the full-screen per-phase chroma wash (`#bg` radial pools) on the stage surface. On a 55" panel in a dim room that is exactly the decorative gradient wash we forbid. Phase colour survives, carried by the Ring and one small lozenge.

---

## 2. Token plan

Extends `@sila/brand-genome`. Existing phone tokens are unchanged; the stage adds a `--stg-*` namespace because a screen viewed at 3 metres in a dim room is a different optical problem from a screen held at 40 cm.

**Rule for every build downstream: nothing below `:root` may contain a literal hex, a literal px spacing value, or a literal font stack. A hard-coded value is a defect, not a style choice.**

### Colour — all ratios computed against `--stg-ink`, method in §7

```
/* ground */
--stg-ink        #08070B   /* deeper than phone ink #0C0B10: panel blacks read as blacks at distance */
--stg-bone       #F6F2EA   17.99:1  body + display text
--stg-dim        #A8A39B    8.01:1  secondary text — this is the lowest value allowed to carry words
--stg-faint      #6E6A73    3.80:1  hairlines and inactive tracks ONLY, never text (fails 1.4.3)

/* phase chroma — stage-grade, lifted from the phone genome for distance */
--stg-amber      #E8A94E    9.77:1  LOBBY, A_BASELINE, signature
--stg-teal       #3FD2C7   10.76:1  B_REACTION
--stg-violet     #A594F9    7.85:1  C_DISCOVERY
--stg-coral      #FF9179    9.16:1  D_IMPROV
--stg-gold       #F5C65A   12.54:1  E_LOOP, CLOSED

/* ring state — differentiation is thickness + chroma + plate, never colour alone */
--stg-rest       #8B8792    5.72:1  an arc at rest. Passes 1.4.11 (3:1) so a dimmed player is never invisible.
--stg-live       var(--stg-phase)   an armed / ignited arc
--stg-notch      #F6F2EA            a healed reveal scar

/* verdict — dignity > drama */
--stg-yes        #7FC98C   10.17:1
--stg-no         #A8A39B    8.01:1  a wrong answer is GREY, not red. See §4, CELEBRATE.
```

Two colour rules that are non-negotiable in this room:

- **No stage state exceeds 60% white coverage of the panel.** A full-white celebration flash on a 55" screen in a dim café blows out every face at the table and physically hurts. Celebration is chroma on black, always.
- **Chroma is never used as text on chroma.** `--stg-bone` on `--stg-amber` is 1.84:1. Amber is a *light* colour, not an ink. If a chroma field ever needs text on it, the text is `--stg-ink` (9.77:1 on amber).

### Type

Families are unchanged from the existing product — **Fraunces** (display) and **Instrument Sans** (UI). They are already a deliberate, non-default pair, and keeping them is what makes the stage recognisably the same brand as the phone.

Stage type is sized in `vh`, never `px`, because the stage runs on an unknown panel at an unknown distance. The scale is resolution-independent and the copy is written to fit the scale, not the reverse.

```
--stg-t-plate    9.0vh   Fraunces 600   the winner's name. ONE line, one word. The hero size.
--stg-t-prompt   5.4vh   Fraunces 400   the prompt body. Wraps to at most 3 lines. Never 4.
--stg-t-name     3.6vh   Instrument 600 seat names around the Ring
--stg-t-caption  3.2vh   Fraunces 400   Rawi's lower third
--stg-t-num      2.8vh   Instrument 600 scores, deltas, tabular-nums
--stg-t-label    1.9vh   Instrument 500 act name, clock. FLOOR — nothing on the stage is smaller.
```

Copy constraints that make this scale work:
- Prompt body: **≤ 14 words**, set across a band **wider than the Ring** (`--stg-plate-w`, ~92vh on a 16:9 panel) so the measure stays near 40 characters and the text crosses the circle like a title card over a dial. The existing packs already comply (`"The wooden boat that still crosses Dubai Creek for a single dirham. Buzz its name."` = 14). If a prompt does not fit in three lines at `--stg-t-prompt`, the prompt is wrong; we do not shrink the type.
- Sentence case throughout. No ALL-CAPS shouting, no decorative eyebrows, no `A · B · C` meta strings. Act labels use the human names already in `play.js` — "Act II · Buzzers", not `B_REACTION`.
- Written for a table of 200 nationalities: short sentences, common verbs, no idiom the prompt itself isn't about.

### Space and geometry

```
--stg-ring-r     34vmin   ring radius
--stg-arc-min    1.6vmin  arc thickness at zero points
--stg-arc-max    5.2vmin  arc thickness at the session's leading score
--stg-gap-deg    6        fixed angular gap between arcs, at ANY player count
--stg-plate-w    92vh     the prompt band's measure; wider than the Ring on purpose
--stg-s1 .5vh  --stg-s2 1vh  --stg-s3 2vh  --stg-s4 4vh  --stg-s5 8vh
```

### Motion — spectacle by cuts, not by bounce

Module 1 mandates "no bounce, no overshoot, no flashing, 60fps quiet luxury." A game show does not actually get its drama from easing curves — it gets it from **hard cuts, lighting changes, and holds.** A vision mixer has no ease function. This is how both constraints are satisfied at once.

```
--stg-cut     0ms      state changes on the stage are CUTS
--stg-snap    120ms    an arc igniting
--stg-beat    400ms    a score growing, a card sliding
--stg-hold    1200ms   the silence before a verdict — the most valuable interval we own
--stg-fade    2000ms   phase chroma crossfade
--stg-ease    cubic-bezier(0.2, 0, 0, 1)   fast out, long settle. No overshoot, ever.
```

Exactly one looping animation exists on the stage: the Ring's idle breath, ±0.6% scale over 8s, matching the phone's existing `breathe` keyframe so the two surfaces share a pulse. Everything else is triggered and finite.

Consequence worth stating: **under `prefers-reduced-motion` this design loses almost nothing**, because its drama was cuts and holds rather than movement. See §6.

### Sound

The stage is the only speaker in the room. Six cues, all short, all with a visual twin (§6).

```
bed.prompt    low pulse at round tempo, under the prompt. CUTS TO SILENCE at BUZZ_LOCK.
sting.lock    150ms  one struck metal transient, no tail. Fires on the lock, not on the press.
sting.photo   two transients separated by the ACTUAL measured delta, ×10 for audibility.
              A 12ms photo finish sounds different from a 29ms one. The data is the sound design.
sting.yes     rising perfect fifth, 300ms
sting.no      one flat low note, 200ms. Never a comedic descending "wah-wah" — that is
              mockery of a person at the table and it violates safety > dignity > inclusion.
sting.laugh   nothing. See below.
```

Two deliberate silences:

- **The reveal has no sound.** When a fact about a real person appears on the stage, the soundtrack is the table's own reaction. Scoring it would be scoring a human moment.
- **`BUZZ_LOCK` kills the bed instantly.** The absence is the sting. Silence is the loudest thing available in a loud room.

---

## 3. Layout: stage and phone

### Stage — 16:9 landscape, never scrolls, never has two things on it

```
┌────────────────────────────────────────────────────────────┐
│  Act II · Buzzers                    room_a1b2c3    41:12  │  ← 8vh  strip
├────────────────────────────────────────────────────────────┤
│                                                            │
│                    ╭───── PRIYA ─────╮                     │
│              ╱                             ╲               │  ← 72vh THE RING
│           │       The wooden boat that       │             │     plate lives
│           │    still crosses Dubai Creek     │             │     inside it
│           │      for a single dirham.        │             │
│              ╲                             ╱               │
│                    ╰──── OMAR ────╯                        │
│                                                            │
├────────────────────────────────────────────────────────────┤
│  "Buzz it — first name takes the ten."          RAWI       │  ← 20vh lower third
└────────────────────────────────────────────────────────────┘
```

**The lower third is Rawi's, permanently.** Rawi is an invisible host with a nameplate and no face — which is a better piece of theatre than a face would be, and it is the accessibility floor for a loud room where the voice may simply not arrive. The band is always reserved; caption changes never move the Ring.

Fed by `s.host_say`. In a room this loud, captions are not an option someone enables. They are the design.

### Phone — portrait, one-handed, near-blank

```
PROMPT_OPEN            BUZZ_LOCK (you lost)    INTERSTITIAL
┌──────────┐           ┌──────────┐            ┌──────────┐
│          │           │          │            │          │
│   ◜◝ 30  │  ← your   │          │            │          │
│          │    arc,   │  Omar    │            │          │
│  ╭────╮  │    your   │  has it  │            │          │
│  │BUZZ│  │    score  │          │            │          │
│  ╰────╯  │           │          │            │          │
│          │           │          │            │          │
└──────────┘           └──────────┘            └──────────┘
```

The phone shows **your arc** — the same arc that is on the Ring, in your seat position, at your thickness. The stage is the whole Ring; your phone is your piece of it. That relationship is the entire visual identity of the split, and it costs one SVG path.

Inverse luminance is a hard rule: **as the stage gets brighter, the phone gets darker.** At `BUZZ_LOCK` and `CELEBRATE` the phone drops to near-black with one word on it. At `INTERSTITIAL` the phone is black. The device in your hand actively refuses to be interesting at exactly the moments the room is worth looking at.

The phone keeps: the buzzer (unchanged, `<50ms` debounce, haptic on press, `#buzzer` sizing already correct), tap choices, `your_cue` for D_IMPROV secret words, the ⋯ sheet with `Step away quietly` and `I need this to stop`. It loses: the prompt text during buzz rounds, the score pills, the caption, the member grid, the flying emoji.

---

## 4. How each phase reads

Phases: `A_BASELINE → B_REACTION → C_DISCOVERY → D_IMPROV → E_LOOP`, each carrying its own chroma at `--stg-fade` (2s) — slow enough that the room feels the act change before it notices it. Round cycle inside every phase:

### `PROMPT_OPEN`
Ring breathing at rest. Every arc at `--stg-rest`, thickness = current score. Prompt in the plate at `--stg-t-plate`, one line, inside the circle. Hairline outer track sweeps the timer (45s default for `OPEN_BUZZ`, 20s for a blitz). `bed.prompt` pulsing underneath.
Phone: black except a live buzzer. **The prompt is not on the phone.** To read the question you must lift your head — which is the entire product.

### `BUZZ_LOCK`
Everything **cuts** on the same frame. The 150ms server-side lock window means we have permission to be brutal here: no fade, no transition, one frame.
- Bed → silence. `sting.lock` fires.
- Timer track → stops mid-sweep and stays frozen. The frozen arc is the visible fact of "the clock stopped when you hit it."
- Winner's arc → `--stg-live`, full chroma, `--stg-snap`.
- Every other arc → holds at `--stg-rest` (not dimmed to nothing — 1.4.11 and dignity both).
- The prompt shrinks to `--stg-t-label` at the top of the ring; **the winner's name takes the plate at full display size.**

That last move is the thesis in one cut: *the centre of the room goes from a question to a person.* Six pairs of eyes leave the screen and land on Priya.

### `BUZZ_LOCK` — photo finish (`delta ≤ 30ms`)
The best moment the engine gives us for free, and the current UI spends it on a toast (`"📸 Photo finish — milliseconds in it"`). Promote it to a full stage event:

1. **Both** arcs ignite. Neither wins yet.
2. A hairline chord is drawn **across the circle between the two seats** — a literal line between two people who are actually sitting there, looking at each other.
3. The delta prints at the chord's midpoint in `--stg-t-num`, tabular: `11 ms`.
4. `sting.photo` — two taps, spaced at the real delta ×10.
5. **Hold. 1200ms of absolutely nothing.**
6. Then the losing arc drops to `--stg-rest` and the winner's name cuts into the plate.

The hold is the product. Do not compress it, do not fill it with motion. It is the only moment in ninety minutes where the room is guaranteed to be silent and looking at two specific human faces.

### `ADJUDICATE`
Name holds in the plate. One line under it at `--stg-t-caption`: `Say it out loud.` Ring frozen, timer frozen, no motion anywhere on the panel. This is the second designed hold. The operator's `✓ Correct (+10)` / `✗ Wrong` in `/ops` ends it.

### `CELEBRATE`
- **Correct:** the winner's arc **grows** by the score delta over `--stg-beat`, and a `+10` numeral rises out of the arc and dissolves. Chroma pulse on the Ring, once. No confetti, no white flash, no full-screen takeover. The score being a physical property of their arc means the celebration and the scoreboard update are the same event — there is nothing else to show.
- **Wrong:** the arc returns to `--stg-rest` and the Ring simply re-opens; the timer resumes from where it froze. Colour is `--stg-no` (grey), not red. There is no shame animation, no buzzer-of-shame, no sad trombone. The person who got it wrong is sitting three feet away from everyone who saw it, and `safety > dignity > inclusion` is a hardcoded lattice, not a preference.

### `INTERSTITIAL`
The plate empties. The Ring stays, breathing, at its lowest luminance of the whole cycle. Rawi's lower third carries the bridge line. Phones are black.

Designed as the reward, not the gap. Two rules: the stage must be at its *dimmest* here so nothing competes with the table; and it must be *long enough to be uncomfortable for the machine and comfortable for the humans.* The Pacer's `min` budget for `INTERSTITIAL` should be treated as a floor to protect, not a delay to optimise away.

### `BIG_LAUGH` (≥3 reactions in 3s)
Fires across any state. A second concentric ring blooms outward from the Ring and dissolves over `--stg-beat`, and the Ring's chroma warms toward `--stg-amber` for `--stg-hold`. One bloom per event, wordless, minimum 900ms enforced gap between blooms (queue, not a strobe — see §6).

No emoji, no counter, no "🔥 3". The table already knows it laughed. The stage is only confirming that the room heard it.

### `s.reveal_grant` — the Reveal
1. The owner's arc **splits open** at their seat.
2. A card slides out **from their seat position** toward the centre and stops: the earned fact at `--stg-t-caption`, their name at `--stg-t-name`.
3. Silence. No sting.
4. The card retracts into the arc, and the arc closes over it leaving a permanent `--stg-notch` notch.

Because the card emerges *from* a seat, every head at the table travels from the card back to a specific person. Reveals accumulate as notches for the rest of the night, and at `CLOSED` the Ring — scarred all the way round, one mark per thing this table earned about each other — is the send-off image.

### Standings — deliberately rationed
The Ring is the continuous scoreboard, so there is no scoreboard screen. At act breaks only, the Ring **stands up**: arcs unroll into horizontal bars in seat order, hold, and roll back. This is the single orchestrated motion moment in the whole design.

**Constraint: shown at most three times in ninety minutes, never longer than eight seconds.** A permanent leaderboard manufactures one winner and five losers for the entire evening. Ambient thickness lets you feel the shape of the game without ever publishing a last place.

---

## 5. The Ring at 2, 4 and 6 players

`actor.ts:230` hardcodes 6, but the geometry must not care. Arcs always fill the circle; the gap stays fixed at `--stg-gap-deg` (6°) regardless of count, so each size develops its own character instead of looking like a 6-player ring with holes in it.

| | Arc sweep | Character | What changes |
|---|---|---|---|
| **2** | 174° each | **A duel.** Two enormous facing arcs, top and bottom. | Photo-finish chord becomes the vertical diameter — maximum drama. No "the field" to hide in. Interstitials run longer: two people need more room to talk than six. Standings never shown — with two players, ambient thickness *is* the standings and a ranked list is just "you are losing." |
| **4** | 84° each | **A table.** Four balanced quadrants. | The default reading. Everything behaves as specified. |
| **6** | 54° each | **A wheel.** Six arcs, clearly a circle of people. | Names may need the short form (first name only, already what we collect — `"First name is perfect"`). Chord for photo finishes may cross other arcs; it draws *over* them at full opacity so it is never ambiguous who the two are. |

Rules that hold at every count:
- Names stay **horizontal**, positioned radially outside their arc. Text is never rotated to follow the curve — it destroys legibility at distance and it is a cliché.
- Seat order maps to the physical room, established once in the lobby. The stage sits at one end of the table; seat 1 is the near-left position and the order runs clockwise. If the stage is moved, the operator re-seats in `/ops`; this must be a two-click operation.
- **Lobby is the same Ring, incomplete.** Empty seats are `--stg-faint` dashed arcs. Each arrival solidifies one arc and fires `LOBBY.SEAT_FILLED` in the lower third — `"{name} is in. The table grows stronger."` The first thing the room ever sees is a picture of itself filling up, which is a better opening than a logo.

---

## 6. Accessibility — WCAG 2.2 AA, and the room it actually runs in

The compliance bar and the environmental bar point the same direction here, which is lucky: a loud, dim room viewed from across a table is a harder constraint than the standard, so meeting the room usually means clearing the standard.

### Contrast (1.4.3, 1.4.11)
Every value in §2 carries its computed ratio. Text minimum in this design is `--stg-dim` at 8.01:1 — well past the 4.5:1 requirement, chosen for distance rather than for compliance. `--stg-faint` (3.80:1) is restricted to hairlines and inactive tracks and may never carry a word. Arcs are UI components under 1.4.11, so a *dimmed* arc still sits at 5.72:1 — a player who is losing never disappears from the picture.

**Never colour alone (1.4.1).** Arc state is carried by three redundant channels: chroma, thickness, and the plate text. Score is carried by thickness *and* a numeral. Correct/wrong is carried by grey-vs-green *and* by the arc's growth *and* by Rawi's caption.

### Motion (2.3.1, 2.2.2, and `prefers-reduced-motion`)
- **Flashing:** nothing on the stage flashes more than three times in any one second (WCAG 2.3.1 general flash threshold — verify against the W3C text at build). The "ignite" is one 120ms transition, not a strobe. `BIG_LAUGH` blooms are queued with a 900ms minimum gap, so a table that reacts six times in two seconds gets two calm blooms rather than a seizure risk.
- **Reduced motion:** the Ring's breath stops, the timer sweep becomes a stepped per-second tick, the standings unroll becomes a cut, the laugh bloom becomes one opacity step, the reveal card cuts in instead of sliding. **Nothing dramatic is lost, because the drama was cuts and holds.** The stage also accepts `?motion=reduced` so a venue can force it without touching OS settings — the operator will not be reading system preferences at 9pm.
- **2.2.2:** the only auto-updating things are the round timer and Rawi's caption, both game state rather than decoration. `/ops` already owns HOLD and PAUSE, which stop both.

### The loud room
Every audio cue has a visual twin, and no cue is the sole carrier of any information. `sting.lock` twins the arc ignition. `sting.photo` twins the chord and the printed delta. Rawi's speech twins the lower third, always on, never optional. A room where the audio fails completely is still fully playable — that is the test.

### The dim room
The 60% white-coverage cap exists so faces at the table stay visible; a bright screen in a dark room turns everyone around it into silhouettes, which is the exact opposite of the product. The stage's overall luminance also *falls* through the round cycle and hits its floor at `INTERSTITIAL`, which is a lighting design as much as an accessibility one: the room literally gets dimmer when it is time to talk to each other.

### The distance
`--stg-t-label` at 1.9vh is a hard floor — nothing on the stage is smaller. Names at 3.6vh, prompt at 9vh. This is geometric, not empirical: it needs a measurement pass in the real venue at the real screen size before build. Logged in §8 as an open question, not asserted.

### The phone (unchanged obligations)
Targets ≥24px (2.5.8) — the buzzer at `min(58vw, 218px)` already clears it by an order of magnitude. Visible focus (2.4.11). No dragging-only interaction (2.5.7). The safety control keeps its consistent position in the ⋯ sheet (3.2.6) and stays reachable in every phase including `INTERSTITIAL` when the phone is otherwise black — *the black phone still responds to a tap on the ⋯ corner.* Non-negotiable.

### Screen readers
The stage is a shared display, not an assistive surface — a player who uses a screen reader gets the full game state on their **phone**, in text, including the prompt (Law 2 is suspended for that player). This is the one exception to the phone's blankness, and it is set from the join screen, not detected.

---

## 7. Evidence and method

| Claim | Basis | Status |
|---|---|---|
| All contrast ratios in §2 | WCAG 2.x relative-luminance formula, computed in-repo against `--stg-ink`; reproducible | verified, arithmetic |
| WCAG 2.2 AA criteria referenced (1.4.1, 1.4.3, 1.4.11, 2.2.2, 2.3.1, 2.4.11, 2.5.7, 2.5.8, 3.2.6) | W3C Recommendation | **re-check numbering against the W3C text at build. Not cited from memory as settled.** |
| 150ms lock window, 30ms photo-finish threshold, 10/5 scoring, `BIG_LAUGH` ≥3 in 3s, `t_adj = t_recv - rtt/2` | supplied engine recon | given |
| Phase names, message names, `actor.ts:230` player count | supplied engine recon | given |
| Existing tokens, fonts, `breathe` keyframe, phase labels, prompt copy | `public/play/play.css`, `public/play/play.js`, `content/packs.json`, `content/lines.json` | verified, in repo |
| Type sizes legible at 3m on a 32–55" panel | **geometric proposal, unmeasured** | **unverified — see §8** |
| "Shared attention beats private attention" | argued from the manifesto's own premises; no external study cited | reasoning, not research |

No external benchmark, study, or statistic is cited anywhere in this document. Where a number appears it is either computed here, supplied by the recon, read from the repo, or explicitly flagged unverified.

---

## 8. Open questions — proceeding on the recommended default

1. **Stage device.** (a) Venue-supplied TV via HDMI, (b) SILA-supplied 15" laptop lid-open at the head of the table, (c) an 11" tablet on a stand. → **Default: (b).** It is the only one we control end to end, and it is the size the prototype is tuned for. Revisit at venue scale.
2. **Does the phone go fully black at `INTERSTITIAL`, or keep a dim heartbeat?** (a) fully black, (b) one dim dot proving the connection is alive, (c) keep the arc. → **Default: (b).** Fully black reads as "the app crashed" and someone will start tapping. One dot is honest and stays uninteresting.
3. **Type-size floor at real viewing distance.** Must be measured, not designed. → **Default: build to §2, then run one seating test in the actual room with the actual panel and adjust `--stg-t-*` as a single scalar.** This is the highest-risk unverified item in the document.
4. **Seat-order capture.** (a) operator drags six names in `/ops`, (b) each player taps their position on a ring diagram when they join, (c) skip it and use join order. → **Default: (b).** It is fifteen seconds, it is the first thing a player does, and it makes the Ring truthful — which every other decision here depends on.
5. **Should the stage render at 2 players at all,** or does a duel work better with phones only? → **Default: render it.** The 2-player duel geometry is the most dramatic version of the Ring, and 2-player rooms are the ones most at risk of dying quietly.

---

## 9. What ships next

`docs/next-version/prototype/index.html` — one static file, no build, no dependencies, matching the repo's vanilla idiom. Demonstrates: lobby filling at 2 / 4 / 6, `PROMPT_OPEN` with a real prompt from `content/packs.json`, `BUZZ_LOCK`, a photo finish with the chord and the hold, `CELEBRATE`, standings, `BIG_LAUGH`, a reveal, and the companion phone showing the inverse-luminance rule. Mock data inline; nothing wired to the server.

It is proof of direction. Read it as a look, not as a product.
