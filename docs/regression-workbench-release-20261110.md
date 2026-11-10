# Regression workbench release candidate

Base shell: `6c182ed8d199311ab76458253684f910b1b28198` (the deployed compact, deduplicated tools directory).

Regression source: `rhartlage/linear-regression-studio` at `7665bec9f137c48b968f6bbc86155455e549e77b`.

Runtime files: index.html, regression-math.js, workbench-data.js, workbench.js, workbench.css. The source repository owns the app, tests, numerical fixtures, and method documentation.

## Scope

Local numeric CSV/paste; simple and multiple regression; normal-probability and residual plots; manual forward/backward selection with recalculated coefficient t-tests and ANOVA; squares and two-/three-way interactions with hierarchy; model history/undo; conditional predictions and a sensitivity tornado. The original line playground remains. Inference uses fitted OLS, not a dragged or external comparison line.

No accounts, persistence, analytics, external fonts, data upload, new dependencies, or permission changes. Categorical encoding is outside this release. Selection is explicitly exploratory; the tornado is conditional sensitivity, not statistical significance.

## Verification completed

- 90 source numerical/data tests, including independent NumPy LAPACK SVD and SciPy fixtures.
- 11 browser workflows on the standalone source and the composed shell, covering desktop/mobile, keyboard navigation, hierarchy, refitting, undo, imports, invalid/singular data, numeric-range limits, predictions, and the old playground.
- Independent review and dense-grid verification of quadratic/three-way tornado extrema.
- Build, 28-page/site asset validation, secret scan, and all 6 tools-directory browser tests.
- Preflight verifies every unrelated hosted asset is preserved. Expected publication changes: the five regression runtime files and deployment-manifest.json only.

## Release sequence

1. Verify the source and shell branches are pushed and contain the reviewed commits.
2. Build the shell, then run `node --use-system-ca scripts/preflight-regression-release.mjs` on Windows (or the equivalent trusted CA setup). Do not disable TLS verification. The check stops if live provenance or any unrelated substantive asset changed.
3. Run site validation and secret scan. The narrowly scoped LF rules for Monte Carlo and inverse-transform examples make fresh Windows checkouts reproduce existing runtime bytes. The preflight preserves any remaining harmless line-ending differences in generated output and verifies native provenance before preserving it.
4. Publish only through the existing authorized public-tools deployment. No new account, access, security change, or paid service is required. Do not run another build after preflight without repeating it.
5. Verify every hosted artifact against this final build with scripts/verify-hosted-release.mjs, and rerun the regression and directory browser suites against the hosted site.

This document records candidate checks, not evidence that publication has occurred.
