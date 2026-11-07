# Measurement Reliability Mini-Lab 1.0.0

Public route: `/mgmt-4570/measurement-reliability/`.

## Teaching use

A 15-minute MGMT-4570 Measure-phase activity before collecting project data or interpreting process variation. Two operators each measure the same five items three times. Students inspect repeated readings, reveal accepted reference values, diagnose bias versus repeatability versus systematic operator disagreement, and try calibration, a shared method, and a fixture. Four cases isolate or combine the problems. Data and observations can support later mean/standard-deviation and measurement-interpretation lessons.

The before/after repair comparison preserves the items and underlying random draws. The plots keep a shared, fixed scale across all eight repair combinations. New sample creates a fresh set of random draws; reset returns to seed 4570 and clears repairs/reference reveal. Student work is transient tab state, with a browser-local comparison CSV download. There is no storage, account, upload, or network request beyond same-origin static assets.

## Method

Reading = reference + common bias + operator offset + independent normal error. Operator offsets are minus/plus half the systematic B-minus-A gap. The mean observed bias uses all 30 reference differences. Pooled repeatability is the square root of within-cell residual sum of squares divided by 20 degrees of freedom. The mean of five paired B-minus-A item mean differences is an operator-disagreement indicator, not a reproducibility standard deviation or a formal variance component.

The lab intentionally does not produce ANOVA, percent GRR, capability, acceptance thresholds, or causal proof. It explains sampling uncertainty, cancellation of opposing biases, real reference uncertainty, and the need to independently validate repairs. It does not model operator-by-item interaction, multiple instruments, resolution or drift.

## Runtime allowlist

- `mgmt-4570/measurement-reliability/index.html`
- `mgmt-4570/measurement-reliability/styles.css`
- `mgmt-4570/measurement-reliability/engine.js`
- `mgmt-4570/measurement-reliability/app.js`

Shared dependency: `/theme.css`. All simulations run locally in the browser. The CSV includes both stages, case, seed, selected repairs and readings; references are omitted while hidden.

## Checks

`node --test scripts/test-measurement-math.mjs`

`node --test scripts/test-measurement-ui.mjs`

UI tests use Playwright, with optional `MEASUREMENT_PLAYWRIGHT_MODULE`, `MEASUREMENT_CHROMIUM_PATH`, `MEASUREMENT_TEST_URL`, `MEASUREMENT_TEST_DIST=1`, and `MEASUREMENT_SCREENSHOT_DIR`. Default UI source is this checkout, not a possibly stale `dist/` build. Numerical checks use exact synthetic fixtures, pooled variance weighting, zero-noise cases, repair invariants, edge seeds, malformed input and CSV reference visibility. UI checks cover all cases and repair combinations, staged reveal, reset, new sample, repeated clicks, reload, CSV, keyboard operation, names and chart/table alternatives, external requests, and 320–1440 px layouts.
