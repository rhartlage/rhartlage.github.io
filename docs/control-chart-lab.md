# Control Chart Lab 1.0.0

Public destination: https://tools.benhartlage.com/mgmt-4570/control-charts/ under MGMT-4570.

Scope: a guided adjunct to the existing x-bar/R and p chart lessons, not additional syllabus coverage. Synthetic supplied datasets, 20 reference subgroups and 10 monitoring subgroups. Custom numeric data support 3–200 subgroups, fixed n=2–10 for x-bar/R and variable inspected counts for p. New data plus the explicit Apply action establishes a new reference; scenario controls never refit it.

The x-bar/R engine uses A2, D3 and D4 constants; the p engine pools baseline counts and computes each subgroup's binomial normal-approximation limits, clipped to [0,1]. Beyond-limit decisions use full precision with a 1e-12 scaled tolerance. An optional eight-point one-side rule applies to x-bar/p only, resets at the phase boundary and breaks on the center line. R is inspected first. Baseline signals are retrospective warnings. Degenerate and sparse baselines are flagged.

Specifications apply to individual items and are deliberately not drawn on the subgroup-average chart. The lab reports observed conformance counts, not Cp/Cpk or capability. Practical assumptions, false alarms and reference links are visible in the app.

CSV exports full-precision data, phases, limits and flags. A visible spreadsheet bridge shows formulas; versioned JSON saves original data plus adjustments and restores on this device. No autosave, upload, account, analytics, external runtime dependency or server computation. Invalid data and malformed session files leave the existing model intact.

Checks: `npm run test:control-chart`, `npm run test:control-chart-ui`, aggregate build/validation/secret scan and hosted-byte verification. Browser tests use `CC_PLAYWRIGHT_MODULE`, optional `CC_CHROMIUM_PATH`, `CC_TEST_URL` for the actual hosted app and optional `CC_SCREENSHOT_DIR`. Default UI tests serve repository source. Automated accessibility checks are limited to semantic names, keyboard navigation, descriptive SVG/table alternatives and responsive overflow; they are not a full WCAG audit.

The public release combines this lab with Measurement Reliability Mini-Lab, preserving every previously hosted application. Record live release provenance in the coordinated release note.
