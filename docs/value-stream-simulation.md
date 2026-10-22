# Value Stream Studio simulation

Version 1.2.0 adds an optional **Simulation mode** switch controlled by students. New maps start with it off. Enabling it exposes settings, queue/status badges, Run/Pause, Step to next event, Reset, an event log, and results. Turning it off pauses and hides the experiment, retaining its transient state until the map changes or the page reloads.

## Classroom workflow

1. Build one directed material path through every Process block. Storage, source/customer, and transport symbols can lie along the path. Information links do not carry simulated items.
2. Enable Simulation mode and open Settings. Choose the time unit, run duration, seed, and distribution for time between arrivals. Choose each process's processing-time distribution and parameters.
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

Durations are all in the selected seconds, minutes, or hours. Changing units converts entered durations and the run duration. Initial process settings use a recognized positive map cycle time converted to that unit, otherwise Fixed 5. Map entry initially uses Exponential mean 5, horizon 480 minutes, seed `1`. These are editable illustrative defaults, not inferred demand. After settings are saved, later cycle-time annotations do not overwrite simulation settings.

## Model and metric semantics

- One station and one unbounded FIFO queue per Process block; every item visits all processes in material-path order. Routing is based on attached Material, Push, and FIFO links, not spatial position or loose arrow symbols.
- Start empty at time zero. The first arrival occurs after the first sampled interarrival interval. Completions precede external arrivals at an equal timestamp; sequence order resolves remaining ties deterministically.
- Transfers are immediate. Nonprocess symbols on the material path add no service or waiting time. Map annotations for inventory quantity, delay, batches, changeovers, operators, uptime, schedules, and kanban are not simulation inputs. No breakdowns, batching, resource sharing, warm-up removal, or automatic replications.
- Splits, merges, loops, disconnected processes/material components, duplicate links, and unsupported material endpoints block the run with an explanation. No processes are silently omitted and no routing probabilities are guessed.
- Stop at the horizon, including events at exactly that time; unfinished items remain in WIP. Completed counts and mean time in system count only items that exited. Mean process wait counts service starts, excluding items still waiting. This can understate delays in an overloaded finite run; inspect WIP and queue lengths too.
- Utilization, mean queue length, and mean WIP use time integrals divided by elapsed time, including the final interval up to the horizon. Throughput is exits divided by elapsed time, expressed per selected time unit. Zero elapsed time displays zero rates; means without eligible observations display a dash.
- A safety bound of 100,000 events or 25,000 arrivals stops the run with a partial-results message. The event log retains its last 120 entries. Numerically unrepresentable sampled times stop with an explicit partial-results message rather than corrupting results.
- Independent pseudorandom streams are derived from the seed for entry arrivals and each process ID. Changing another station's distribution does not consume a station's stream. Resets are deterministic; one finite run is not a long-run estimate.

Relevant map/setting edits and switching current/future state pause and reset a run. Moving or resizing shapes, panning, zooming, and toggling simulation off/on preserve the run. Settings participate in undo/redo and portable file validation. Duplicating a process also copies its simulation distribution.

## Engineering and validation

The pure browser/Node engine is `simulation.js`; `simulation-ui.js` owns the transient experiment and uses the mapper's existing editing, history, dialog, and persistence hooks. No services, dependencies, credentials, or network calls were added. `simulation.css` scopes the added UI. The original archive hash remains provenance only; current runtime hashes in `static-tools.json` are authoritative for composition.

Run `npm run test:simulation`, `npm run build`, `npm run validate`, and `npm run validate:secrets`. The engine checks include a hand-calculated tandem queue, boundary/tie behavior, item conservation, empirical distribution moments, reproducibility, old-map defaults, and malformed-graph rejection. Browser acceptance additionally checks switching, configuration validation, step/run/pause/reset, map edits, state switching, save/reload/import, and responsive layout.

If sibling source checkouts have stale Git pointers, set `PUBLIC_TOOL_REPOS_DIR` to the absolute `.tool-cache` directory in this repository for the build. This uses the repository's existing public clone fallback and keeps all source commit pins unchanged.
