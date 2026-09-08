# M0 — Three Instrumented Rooms

**Why this document exists.** A review of defensibility (2026-09-08) found no
durable moat in the product as positioned. Verification via UAE Pass — the
manifesto's "Trust, Silent" pillar — is an integration a competitor buys in
weeks, not an exclusive; Timeleft already runs Dubai rooms without it. Localised
content is a head start, not a moat.

The one candidate that *is* defensible is the thing nobody else in this category
does: **measuring what actually happens at the table, round by round.** Competitors
seat people and leave. If room composition and host intervention can be mapped to
measured outcomes, that compounds, and it cannot be copied by anyone who has not
run the same rooms.

That moat is earned by running rooms, not by building a website. This is the plan
for the three rooms `M0_EXIT.md` already requires.

## What changed to make the rooms worth instrumenting

Before 2026-09-08, `withdrawal_risk` and `dominance_index` were declared in
`server/contracts.ts` and initialised to `0` in `server/actor.ts` — and never
computed. The v3.2 master spec's entire intervention loop (§7) branches on those
two values, so it was reading permanent zeros. The two behaviours that most define
"an invisible host who notices you" were the two the engine could not see.

Both are now computed in `server/features.ts`, with EWMA smoothing (α = 0.3) per
Module 4, and covered by 13 assertions in `scripts/sim.ts` (Part C).

| Signal | Status before | Status now |
|---|---|---|
| `participation_share` | computed | unchanged |
| `median_buzz_ms` | computed | unchanged |
| `gini_participation` | computed | unchanged |
| laugh proxy (`BIG_LAUGH`) | computed | unchanged |
| `silence_baseline` | declared, never set | **computed** — median gap between a player's own interactions |
| `dominance_index` | declared, always 0 | **computed** — `0.7·shareTerm + 0.3·initiative`, EWMA |
| `withdrawal_risk` | declared, always 0 | **computed** — `0.6·silenceTerm + 0.4·shareTerm`, against individual baseline |

The formulas are ours; the spec fixed the thresholds (`DI > 0.65` gated on
`gini > 0.30`; `withdrawal_risk > 0.60`) but not the maths. The reasoning for each
is documented inline at the definition site. **Treat the thresholds as unvalidated
until the three rooms tune them** — that is precisely what the corpus is for.

## What each room must capture

Beyond the existing `outcome.json` gates in `M0_EXIT.md`:

1. **The full JSONL event log**, retained per room. This is the corpus. Without it
   the room was entertainment, not evidence.
2. **Operator directive log with timestamps** — every intervention the human made,
   and at what point. This is the supervision signal for M3 ICA: the human is
   currently labelling the training data by hand, whether or not anyone calls it that.
3. **Operator's own read, recorded within 10 minutes of close**: who dominated, who
   drifted, and when. Captured *before* looking at the numbers.
4. **Per-player exit signal** — the existing highlight and next-time poll.

## The falsification test

The moat thesis is that these signals predict something a human could not read as
well or as early. It fails if any of the following holds after three rooms:

- **Operator agreement is trivial.** If the operator's blind read (item 3) matches
  `dominance_index` and `withdrawal_risk` at every point where they crossed
  threshold, the metrics are telling us what any attentive host already knows. They
  would still be needed to *scale* Rawi past human attention — but they are not a moat.
- **The signals fire late.** If a threshold crossing consistently lags the operator's
  own noticing, the intervention ladder cannot act in time and the thresholds are wrong.
- **Thresholds do not transfer.** If the DI and withdrawal cut-offs that fit room 1
  have to be re-tuned for rooms 2 and 3, six-player chemistry may be too
  idiosyncratic to model from this volume of data, and the corpus needs to be far
  larger before it is worth anything.

Any of those is a real answer and should be published internally as such.

## Known gaps, deliberately not fixed here

- **`stability_score` is not computed.** Module 4 is contracted to emit it to
  Module 5 every 5 s (the `> 0.8` gate that authorises chaos injection). Nothing
  emits it today. Next piece of Module 4, after the thresholds are tuned.
- **A never-active player scores 0.4 on `withdrawal_risk`** — below threshold.
  Module 4 catches them with its separate `seconds_since_last_interaction > 240`
  clause, but that needs `Participant.last_interaction_ts` seeded at seat time.
  Small fix; do it before room 1, because a player who never engages at all is
  exactly the failure the room exists to prevent.
- **No stage-screen channel.** Deferred with the website work.

## What this does not decide

Whether SILA's business is D2C rooms or corporate B2B2E relocation contracts. The
business research (`docs/next-version/03-business-and-gtm.md`, on branch
`research/next-version-20260908`) recommends corporate on unit economics that go
negative at the high end of the D2C cost range. Three rooms produce evidence for
either. Run them first.
