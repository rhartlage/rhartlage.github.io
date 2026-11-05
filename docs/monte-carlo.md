# Monte Carlo Studio

Public route: `https://tools.benhartlage.com/monte-carlo/`.
Source: first-party static files under `monte-carlo/`, copied by explicit allowlist into the existing public tools deployment. The deployment manifest records the SHA-256 of each runtime and example file. No account, server-side computation, external dependency, telemetry or transmitted model data.

## Classroom walkthrough

1. For the screenshot demonstration, open `sanotronics-one-trial.json`. It restores fixed teaching uniforms and shows the complete trace immediately; **Run simulation** produces one fixed calculation with profit $824,794.14. This mode does not estimate risk. For the repeated simulation, open **Sanotronics example**, or import `sanotronics-baseline.json` with **Open JSON**.
2. Choose **Use listed U values** to reproduce the workbook teaching trace: labor 47, parts 89.152, demand approximately 16,170.372046, profit $824,794.14. The values 0.9109, 0.4576, 0.6026 appear in uncertain-input order.
3. Choose **First seeded trial**. This uses the first three xorshift32 uniforms from seed 20261106: 0.13007199938874692, 0.10972266679164022, 0.3920254047261551. Labor is 44, parts 82.1944533358328, demand approximately 13,766.802006, profit $690,639.65.
4. **Run simulation** with 1,000 trials. Inspect the histogram and risk metrics; expand the first 100 trials or export all 1,000 rows as CSV.
5. **Load class comparison set**, then run again. Baseline, lower demand mean and lower demand SD use identical underlying uniform draws. Active settings govern every comparison, even if a saved scenario had a different seed, count or threshold.
6. Change an assumption, model name, notes, formula, seed or target; **Save JSON** downloads all current configuration and saved comparison snapshots. Open that file in a later session to continue. Generated results are regenerated from the seed, not embedded in the model file.

For the practice screenshot, import `sanotronics-practice-comparison.json`. The baseline is active; Case A (lower mean) and Case B (lower SD) are already saved as comparisons. Notes prompt predictions before running. The JSON contains assumptions only, with no precomputed results or answer key.

## Exact class assumptions

Verified by the parent task from `BUS-3150_Lecture_33(1).xlsx`, Library ID `libfile_03098e5232a48191a543a440936adc8a`, SHA-256 `250fa3d4d8a7001141833f81f830447ff1f50fdee10c4bff733e726a44fc6756`. This executor received the extracted facts and independent row-by-row numerical verification; it did not independently materialize the workbook.

- Price: 249; fixed cost: 1,000,000.
- Labor values 43, 44, 45, 46, 47 with probabilities .1, .2, .4, .2, .1.
- Parts: uniform from 80 to 100.
- Demand: normal, baseline mean 15,000 and SD 4,500. Lower-mean case: mean 12,000, SD 4,500. Lower-SD case: mean 15,000, SD 2,250.
- Unit contribution = price − labor − parts; profit = contribution × demand − fixed cost.
- 1,000 trials, seed 20261106, independent inputs, exactly three uniforms per trial in labor/parts/demand order. Constants do not consume uniforms. Normal demand is continuous and unbounded; neither negatives nor fractions are removed.
- Source context: *An Introduction to Management Science*, 15e, §§12.1–12.2, Sanotronics equations 12.1–12.6 and Table 12.1. The adaptation uses the workbook's own sample, not the textbook illustrated run.

Independent workbook oracle (display rounded to cents):

| Scenario | Mean profit | Sample SD | Min | Max | Losses | Negative demand |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 726,567.30 | 522,784.47 | −1,098,542.32 | 2,288,271.51 | 81 | 1 |
| Lower mean | 384,206.83 | 520,220.96 | −1,424,251.86 | 1,930,565.59 | 223 | 5 |
| Lower SD | 719,184.83 | 271,821.32 | −234,997.32 | 1,538,400.57 | 3 | 0 |

Uniform generation is xorshift32 (`x ^= x << 13; x ^= x >>> 17; x ^= x << 5`) with midpoint conversion `((x >>> 0) + 0.5) / 4294967296`. The normal transform uses Acklam's inverse-CDF approximation; validation tolerance is one cent against the workbook for summary extrema, means, sample SDs and teaching traces. Observed errors on those fixtures are below $0.002. An independent Python NormalDist inverse-CDF oracle also checks all 3,000 profit rows across the three scenarios; every labor and parts draw matches exactly and every profit differs by less than one cent. Loss and negative-demand counts match exactly.

## Model format and boundaries

JSON root fields: `type: "monte-carlo-studio"`, `schemaVersion: 1`, `model`, `comparisons` (zero to four complete model snapshots). Each model contains:

- `name`, `description`.
- `inputs`: ordered objects with `id`, `label`, `type`; constant uses `value`; uniform uses `min,max`; normal uses `mean,sd`; triangular uses `min,mode,max`; discrete uses `values:[{value,probability}, ...]`.
- `outputs`: ordered objects with `id,label,formula`. Formulas can reference inputs and earlier outputs only.
- `settings`: `trials,seed,riskOutput,lossThreshold,target`, plus optional `samplingMode` (`seeded`, the default, or `fixed`). Fixed mode requires exactly one trial and uses `traceUniforms` directly. Loss means strictly less than the loss threshold; target means at least the target.
- `traceUniforms`: optional custom trace values represented as an array (empty allowed). Using the custom trace requires exactly one open-interval U per uncertain input.

Limits: 1–24 inputs, 1–12 outputs, 1–100,000 trials, seed 1–4,294,967,295, four comparison snapshots, JSON up to 1 MB. Probability sums must equal 1 within 1e-10; negative SD, non-finite values, unknown schema and invalid formulas are rejected. Import validates completely before replacing current work. The app prompts before replacing modified work. Browser autosave can be cleared or unavailable; local JSON is the portable backup.

Formulas are interpreted by a small arithmetic parser, never JavaScript eval. Operators + − * / ^, unary signs, parentheses, scientific notation; functions min/max/abs/sqrt/round/floor/ceil/exp/log/pow. Variables are case-sensitive; function and prototype-related names are reserved. Non-finite trial outcomes stop with the trial number and output name. No property access, assignment, arbitrary calls or network operations are supported.

Normal inputs remain unbounded and negative draws are reported. Percentiles use linear interpolation at (n−1)p; SD uses n−1 (unavailable for one trial). Monte Carlo estimates depend on trial count and seed. Outcome percentiles are not confidence intervals for a mean. Independence and a static trial model are explicit limitations; there is no time evolution or correlated sampling in v1.

Computation runs in a module Web Worker, with Cancel. Edits cancel the worker and invalidate results. CSV export uses the completed run's model and includes every input/output and trial number; JSON is the source of model metadata and repeatability.

## Checks

- `npm run test:monte-carlo`: workbook reference values and exact counts, RNG, all distributions, moment checks, formula safety/precedence, validation, comparisons, JSON roundtrip and CSV.
- `npm run test:monte-carlo-ui`: real Chromium flows, modified-model export/import in a fresh session, browser reload, exact CSV rerun, class imports, validation/error paths, worker cancellation, distributions, desktop/tablet/phone layouts and request checks.
- Set `MC_PLAYWRIGHT_MODULE` to an installed Playwright module when needed; optional `MC_CHROMIUM_PATH` selects an existing Chromium. `MC_TEST_URL` runs against a hosted URL. `MC_SCREENSHOT_DIR` saves internal QA images, not public assets.
- Build, site/secrets validation, existing VSM numerical and browser suites, and Inverse Transform regression suites must also pass before release.

After publishing the exact reviewed source, run `npm run verify:hosted` from its clean build. This compares SHA-256 for every served artifact, including the deployment manifest and all previous apps, and checks HTML cache policy. It accepts `PUBLIC_TOOLS_VERIFY_ORIGIN` only for local test or another explicit HTTPS target. This verification does not replace hosted browser interaction tests.

Publish only through the existing `benhartlage-public-tools` Worker and `tools.benhartlage.com` route. Use an existing authorized Cloudflare environment. Record the prior Worker version, deploy the exact reviewed source SHA, and verify the live files against its deployment manifest. Do not create credentials, temporary hosted sites or new access policies.
