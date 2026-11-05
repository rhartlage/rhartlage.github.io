# Combined classroom simulation release — 2026-11-05

This release adds Monte Carlo Studio, local JSON model persistence and class demonstrations, integrates Value Stream Studio JSON export and 10,000 events/sec playback, and integrates Inverse Transform Lab JSON import/export and the Sanotronics distribution files.

## Baseline reconciliation

The authorized deployment executor read production Worker `e6fd7adc-e866-4108-bb1f-8bc5cd04368c` at 100%, deployed 2026-11-04 12:22:19 UTC. Its 7,724-byte deployment manifest SHA-256 is `bd996ac85e96d41d8bab7a8e22cabcfc2901b0164353bfc02e677378c6be67a0`. This exactly matches the manifest rebuilt from source `2e33314052474cb5a8074e7fa924ffe66da59985` on `agent/inverse-transform-20261104`.

- Every field of all 13 existing repository tool pins is unchanged.
- Value Stream Studio 1.3.1 → 1.3.2 integrates `0f94564377c9d03abec0c95eff4a4f483788b4fe`. Only app.js, index.html and simulation-ui.js runtime hashes change. simulation.js, simulation.css, styles.css, learning.js and symbols.js are byte-identical to production. Original archive provenance remains unchanged.
- Inverse Transform Lab 1.0.0 → 1.1.0 integrates `f4c016797551d75b827b11aa4d598a3cef08128d`; its ten runtime/example/schema/guide assets are preserved in full.
- Monte Carlo Studio 1.0.0 adds eleven runtime/example assets and an Operations directory card. The existing hub, source pins, CSS theme, security headers and hosting configuration remain in place. VSM navigation and saving guidance now use the visible Export JSON label.
- No RADAR, private-app, domain, access-policy or credential changes are included.

Final built deployment manifest SHA-256: `807baff11c52201355e2184ec3beabb601d44d202374aa965bcb85ae9c486f01`.

## Verification completed before source handoff

Build, site validation (26 HTML pages), secret scan, diff check and Wrangler dry run pass. Monte Carlo: 13 numerical/format tests and eight Chromium tests, including all five example imports, exact seeded CSV reproducibility, full model/comparison JSON roundtrip in a fresh session, browser restore, errors and cancellation, every supported distribution, and desktop/tablet/phone layouts. The tests also pass under Wrangler's local asset CSP. A completed 100,000-trial browser run was checked.

Independent Python inverse-normal verification checks all 3,000 profit rows: labor and parts are exact; maximum absolute profit error is $0.00191135 in baseline and lower-mean cases and $0.00095568 in the lower-SD case. Loss counts are exactly 81, 223 and 3. Fixed teaching-trace profit is $824,794.14.

VSM: 28 numerical tests and 15 Chromium checks pass, including full-project export/import and high-speed responsive playback. Inverse Transform: 12 numerical/parser checks and eight Chromium checks pass after integration.

## Publish and verify

Use a clean checkout of the exact combined release SHA in the already authorized Cloudflare environment. Build uses pinned source clones (or the existing `PUBLIC_TOOL_REPOS_DIR`) and never edits those repositories.

```sh
npm run build
npm run validate
npm run validate:secrets
npm run test:simulation
npm run test:inverse
npm run test:monte-carlo
npx wrangler deploy --dry-run
npx wrangler deploy --keep-vars
npm run verify:hosted
```

`wrangler.jsonc` targets only `benhartlage-public-tools` and `tools.benhartlage.com`. Record the current Worker version immediately before publication for rollback. Confirm the final manifest hash above and run hosted browser tests:

```sh
MC_TEST_URL=https://tools.benhartlage.com/monte-carlo/ npm run test:monte-carlo-ui
INVERSE_TEST_URL=https://tools.benhartlage.com/inverse-transform/ npm run test:inverse-ui
VSM_TEST_URL=https://tools.benhartlage.com/mgmt-4570/value-stream-mapping/ npm run test:queue-ui
```

The test module overrides are documented in the individual tools when Playwright is installed outside this checkout. Library saving is independent of hosting; all five Monte Carlo JSONs are directly downloadable from `/monte-carlo/examples/` and contain no stored trial results.
