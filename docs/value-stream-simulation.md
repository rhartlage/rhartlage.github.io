# Value Stream Studio simulation

Version 1.2.0 adds an optional **Simulation mode** switch controlled by students. New maps start with it off. Enabling it exposes settings, queue/status badges, Run/Pause, Step to next event, Reset, an event log, and results. Turning it off pauses and hides the experiment, retaining its transient state until the map changes or the page reloads.

Version 1.2.1 adds up to eight customer symbols above each process, directly from that station's current waiting count, with `+N more` for overflow. A separate row shows the item in service, excluded from the waiting count. Symbols represent counts, not customer identities or FIFO positions. Numerical count/status text and an accessible description remain available. The model, engine, saved-map format, distributions, and seeds are unchanged.

Version 1.3.0 adds the seven whole-system queue measures, an expanded **Queue measures** report, M/M/c steady-state benchmarks, and 1–64 homogeneous parallel servers per process sharing one FIFO line. **Arrivals & service** exposes the existing five distributions, their duration parameters, and per-process parallel capacity. A two-server process is one process block, not two sequential blocks or two queues. Fit-to-view now includes the live badges; process duplication copies capacity as well as service distribution.

## Classroom workflow

Version 1.3.1 adds **Normal (positive times)** to interarrival and per-server service distributions. Both parameters start blank and must be entered explicitly. Existing distributions, seeds, safety limits and saved-map versions are unchanged.

1. Build one directed material path through every Process block. Storage, source/customer, and transport symbols can lie along the path. Information links do not carry simulated items.
2. Enable Simulation mode and open Arrivals & service. Choose the time unit, run duration, seed, and interarrival-time distribution. Choose each process's per-server service-time distribution, parameters, and parallel-server capacity. Exponential inputs are mean durations, not rates.
3. Step through events or run the map. Process names in the results panel and the process inspector open that process's settings. Playback speed changes presentation speed, not simulated time.
4. Compare queue sizes, utilization, throughput, WIP, and mean time in system. Reset with the same seed repeats the experiment. Use a different seed to explore run-to-run variability.
5. Save map downloads both current/future maps and their independent simulation settings. Older v1/v2 map files still open, with simulation off when settings are absent. Reloading starts a fresh run; event history/results are not persisted.

## Distributions and defaults

| Distribution | Parameters |
|---|---|
| Fixed | Positive duration |
| Exponential | Positive mean interval/duration (not a rate) |
| Uniform | Positive minimum and strictly larger maximum |
| Triangular | Positive minimum, most likely between bounds, strictly larger maximum |
| Lognormal | Positive mean of the actual duration and nonnegative standard deviation |
| Normal (positive times) | Positive underlying Normal mean and nonnegative underlying standard deviation; both required |

Durations are all in the selected seconds, minutes, or hours. Changing units converts entered durations and the run duration. Initial process settings use a recognized positive map cycle time converted to that unit, otherwise Fixed 5. Map entry initially uses Exponential mean 5, horizon 480 minutes, seed `1`. These are editable illustrative defaults, not inferred demand. After settings are saved, later cycle-time annotations do not overwrite simulation settings.

### Positive Normal durations

The stored shape is `{ "type": "normal", "mean": 2, "sd": 0.5 }` in `settings.simulation.arrival` or `settings.simulation.processes[processId]`. Values use the selected time unit. The numbers in this example are illustrative, not a sourced textbook specification. Both mean and SD convert when units change. Validation retains the existing bounds: mean from 1e-9 through 1e9; SD from zero through 1e9; finite numbers only. SD zero is a constant time.

For SD > 0, seeded Box–Muller draws sample the underlying Normal distribution. Zero and negative durations are rejected and redrawn; they are never clipped to a small positive duration or reflected. This implements the conditional distribution X given X > 0. A positive underlying mean keeps acceptance above one half. A defensive 1,024-attempt bound raises an explicit error instead of looping indefinitely; the existing engine numerical checks still apply. Existing random streams and algorithms are untouched for other distributions.

Truncation increases the population mean and reduces its SD relative to the entered underlying Normal parameters. With r = mean/SD, the resulting positive-time mean is mean + SD·φ(r)/Φ(r). The report uses this mean (CDF approximation with absolute error below 7.5e-8) and its reciprocal for the input arrival rate; it explains the distinction from the underlying parameters and finite-run observed averages. For example, underlying mean 2 and SD 2 yield a positive-time mean about 2.5752, not 2. M/M/c theory remains unavailable for Normal arrivals or service. See [Burkardt, The Truncated Normal Distribution, sections 3.6–3.7](https://people.sc.fsu.edu/~jburkardt/presentations/truncated_normal.pdf) for conditional moments.

Murphy’s supplied rates imply 2.5 minutes per arrival and 2 minutes per service before any truncation adjustment. The supplied example does not specify a service SD or arrival distribution. A demonstration must label any chosen SD and arrival distribution as assumptions. For instance, Normal service mean 2 with illustrative SD 0.5 has negligible truncation (positive-time mean about 2.000067 minutes), but is not an exact reconstruction of the missing textbook inputs. The third comparison scenario can use exponential interarrivals with mean 2.5 and this explicitly illustrative Normal service; the first two scenarios retain fixed service.

## Model and metric semantics

- One unbounded FIFO queue per Process block, feeding 1–64 homogeneous parallel servers (default 1). The next waiting item goes to the next available server. When several servers are already free, the lowest server index is used; simultaneous completion events retain their deterministic event-sequence order. Every item visits all processes in material-path order. Routing is based on attached Material, Push, and FIFO links, not spatial position or loose arrow symbols.
- Start empty at time zero. The first arrival occurs after the first sampled interarrival interval. Completions precede external arrivals at an equal timestamp; sequence order resolves remaining ties deterministically.
- Transfers are immediate. Nonprocess symbols on the material path add no service or waiting time. Map annotations for inventory quantity, delay, batches, changeovers, operators, uptime, schedules, and kanban are not simulation inputs. No breakdowns, batching, resource sharing, warm-up removal, or automatic replications.
- Splits, merges, loops, disconnected processes/material components, duplicate links, and unsupported material endpoints block the run with an explanation. No processes are silently omitted and no routing probabilities are guessed.
- Stop at the horizon, including events at exactly that time; unfinished items remain in WIP. Completed counts and mean time in system count only items that exited. Mean process wait counts service starts, excluding items still waiting. This can understate delays in an overloaded finite run; inspect WIP and queue lengths too.
- Capacity utilization divides busy-server time by (capacity × elapsed time). Mean queue length and WIP use time integrals divided by elapsed time, including the final interval up to the horizon. Throughput is exits divided by elapsed time. New queue measures display a dash when their denominator has no observations; legacy zero-time averageWip/utilization/throughput fields remain zero for compatibility.
- A safety bound of 100,000 events or 25,000 arrivals stops the run with a partial-results message. The event log retains its last 120 entries. Numerically unrepresentable sampled times stop with an explicit partial-results message rather than corrupting results.
- Independent pseudorandom streams are derived from the seed for entry arrivals and each process/server. Server 1 retains the original process-ID stream exactly; additional server indices get independent derived streams. The one-server event history and numerical results match 1.2.1 exactly. Changing another station's distribution does not consume a station's stream. Resets are deterministic; one finite run is not a long-run estimate.

Relevant map/setting edits and switching current/future state pause and reset a run. Moving or resizing shapes, panning, zooming, and toggling simulation off/on preserve the run. Settings participate in undo/redo and portable file validation. Duplicating a process also copies its simulation distribution.

## Seven measures and denominators

| Measure | Simulated quantity | Denominator |
|---|---|---|
| P0 | Time with no customers anywhere in the map | Elapsed time |
| Lq | Area under the sum of all waiting queues | Elapsed time |
| L | Area under total population, waiting plus service | Elapsed time |
| Wq | Accumulated queue wait across the route for customers who exited | Completed customers |
| W | Arrival-to-exit time for the same completed cohort | Completed customers |
| Pw | External arrivals requiring positive delay at the entry process | All external arrivals, including unfinished customers |
| Pn | Time with exactly the selected n customers in the whole map | Elapsed time |

The selectable integer n is bounded to 0–25,000, defaults to 3, and can change without resetting the run. Pn describes population present at a point in time, not Poisson arrivals in a fixed interval. Occupancy accounting stores only observed population bins and enumerates them only on explicit `engine.occupancy()` requests, keeping ordinary playback bounded. Instantaneous event ties add no time mass.

The report shows arrived, completed, unfinished/censored, and delayed-arrival counts. Runs start empty and retain all observed time; there is no warm-up deletion. Wq/W exclude unfinished customers, so finite-horizon congestion can bias these means downward. Station cards preserve `averageWait` for the service-start cohort and label its denominator. Station arrival-delay probability uses that station's arrivals. A downstream transfer at the exact time a server finishes has zero delay if that completion can immediately accommodate it; merely encountering a not-yet-processed same-time completion does not count as waiting.

## M/M/c benchmark

Theory is displayed separately from simulation only for one connected process with exponential interarrival times, exponential homogeneous service times, independent streams, an infinite buffer, and λ < cμ. Here λ is 1 / mean interarrival duration; μ is 1 / mean service duration **per server**; c is capacity; a = λ/μ; ρ = λ/(cμ). Other distributions and multi-process maps continue to simulate but have no M/M/c benchmark. At λ ≥ cμ the report explicitly says no stable equilibrium; it never returns zero or negative equilibrium means.

Erlang C uses P0 = [sum(k=0..c−1, a^k/k!) + a^c/(c!(1−ρ))]⁻¹ and Pw = P0 a^c/[c!(1−ρ)]. Then Lq = Pw ρ/(1−ρ), L = Lq+a, Wq=Lq/λ, W=Wq+1/μ. For n<c, Pn=P0 a^n/n!; otherwise Pn=P0 a^c/c! ρ^(n−c). Computation uses logarithmic weights and log-sum normalization instead of large factorials. For c=1 these reduce to P0=1−ρ, Pw=ρ, Lq=ρ²/(1−ρ), and Pn=(1−ρ)ρ^n. Pw is not the fraction of time the queue is nonempty; capacity utilization is not the probability any server is busy.

Burger Dome with 45 arrivals/hour and 60 services/hour per server has mean interarrival 4/3 minutes and mean service 1 minute. For c=1: P0=.25, Lq=2.25, L=3, Wq=3 minutes, W=4 minutes, Pw=.75. For c=2: P0=5/11, Lq=27/220, L=48/55, Wq=9/55 minutes, W=64/55 minutes, Pw=9/44, ρ=.375. At n=3, Pn≈.0479403. A finite run need not satisfy Little's Law using completed-only means exactly; population remaining at the observation boundary explains the difference.

## Portable capacity settings and classroom file

The existing map versions remain unchanged. `settings.simulation.processes[id]` remains the per-server duration distribution. Optional `settings.simulation.servers[id]` is an integer from 1–64 (missing values default to 1). Optional `settings.simulation.occupancyN` defaults to 3. Settings normalization, save/open, current/future state copies, undo/redo, and process duplication preserve these values. Capacity changes reset the experiment; n changes do not.

`mgmt-4570/examples/OPS-11-Burger-Dome-Two-Servers.vsm.json` is a native model with one process `server`, capacity 2, exponential means 4/3 and 1 minute, 480-minute horizon, and seed `OPS-11-Burger-Dome-MM2`. The model notes explicitly identify the rates as inherited from the earlier single-server example because the two-server figure provides structure but no numerical rates. The course page links to the download. Existing single-server files need no changes.

## Engineering and validation

The pure browser/Node engine is `simulation.js`; `simulation-ui.js` owns the transient experiment and uses the mapper's existing editing, history, dialog, and persistence hooks. No services, dependencies, credentials, or network calls were added. `simulation.css` scopes the added UI. The original archive hash remains provenance only; current runtime hashes in `static-tools.json` are authoritative for composition.

Run `npm run test:simulation`, `npm run build`, `npm run validate`, and `npm run validate:secrets`. The engine checks include a hand-calculated tandem queue, boundary/tie behavior, item conservation, empirical distribution moments, reproducibility, old-map defaults, and malformed-graph rejection. Browser acceptance additionally checks switching, configuration validation, step/run/pause/reset, map edits, state switching, save/reload/import, and responsive layout.

If sibling source checkouts have stale Git pointers, set `PUBLIC_TOOL_REPOS_DIR` to the absolute `.tool-cache` directory in this repository for the build. This uses the repository's existing public clone fallback and keeps all source commit pins unchanged.

Queue display acceptance: after building, run `npm run test:queue-ui` with Playwright and its Chromium installed. An isolated installation can be selected with `VSM_PLAYWRIGHT_MODULE` (module file URL) and `PLAYWRIGHT_BROWSERS_PATH`. Tests launch a fresh headless browser profile. They cover 0/1/8/9/24,999 waiting counts, service separately, real event transitions, controls, state switching, map import, a tandem queue, and the seeded classroom M/M/1 model at desktop and 390-pixel width. Set `VSM_TEST_URL` to the public app URL to repeat against the deployed bytes; optional `VSM_SCREENSHOT_DIR` saves visual evidence.

Release base: `f440469c6479f44b3aafc460fc1e19b1b43d88a0` on `agent/value-stream-simulation-20260929` (draft PR #10), verified against all 82 live assets on 2026-11-02 before editing. The prior Worker version is `961c99ef-6502-42e6-81b4-c923f5675d13`. Deploy through the existing public-hosting workflow; only the two simulation display assets and generated manifest should differ. All other runtime assets and source pins must match the baseline. Roll back to the recorded Worker version if acceptance fails.

The 1.3.0 release instead builds directly on `cada7857b251b795bfd968e3e1c93cefd9e1bc4b`; all 82 assets were reconciled exactly with live Worker `0cef5817-b2a4-41ae-9fa1-8b1b53227f3a` before changes. That version is the rollback target for this release. Runtime changes are restricted to the mapper app's fit/duplicate integration, simulation engine, simulation UI/CSS, runtime pins, and the classroom model/course download link. Other hosted apps and source pins stay unchanged. Numerical acceptance includes exact one/two-server fixtures, the legacy event-stream hash, completed-cohort censoring, event ties, occupancy mass, benchmark gating, all distributions, unit consistency, reproducibility, and repeated stable long-run convergence checks.

The isolated 1.3.1 Normal release builds on deployed source `7d5edabb6e32e6da9d0e1671ed799de8289f4daa`, preserving both course listings. Rollback target: Worker `a60f57ab-e4ed-479c-a1ce-5763a54b0d5e`. It changes only simulation.js, simulation-ui.js, simulation.css and generated release metadata on the hosted site. The separately prepared 10,000-event/s and longer-run changes are excluded. Acceptance adds Normal support/moments/truncation, deterministic unit scaling, parameter extremes, portable persistence, blank required inputs, controls, and narrow-screen settings checks.
