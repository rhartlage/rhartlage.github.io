# Monte Carlo Studio 1.0.1

The workbook one-trial model intentionally uses fixed uniforms, so its seed and trial inputs are disabled. An explicit **Use random seed & trial count** action now explains the distinction and switches to seeded simulation with 1,000 initial trials. All assumptions, custom uniforms and comparison snapshots remain intact. Users can change the trial count and seed, save/reopen the model, or return to the fixed teaching calculation.

No engine, schema, RNG, worker, class JSON, other tool, credential or hosting configuration changes. All five class files remain byte-identical. A Windows-only URL-to-file-path issue in the inverse-transform browser test was corrected.

## Release verification

- Baseline source: `4db5f5a42d9b2b0fc9e9ce9879f413431d74da14`.
- Prior production Worker: `cce18d8f-6c4b-401a-8049-399475c9f6ee` (100%). Only one `benhartlage-public-tools` Worker exists in the account.
- Baseline manifest SHA-256: `807baff11c52201355e2184ec3beabb601d44d202374aa965bcb85ae9c486f01`.
- New manifest SHA-256: `3f6c23c15020e1019f8c515b27734933c19d52a1b7661c4589cc67ad71428684`.
- Passed: build; 26-page site validation; secret scan; diff check; Wrangler dry run; 13 Monte Carlo numerical tests; 10 Monte Carlo browser tests; 28 VSM numerical tests; 15 VSM browser tests; 12 inverse-transform numerical tests; 8 inverse-transform browser tests.
- New browser coverage imports each of the five actual class files, changes seeds 42/43, verifies 998 and 37 trial CSV lengths and shared prefixes, repeats exact seeded output, reloads and imports exported JSON in a fresh session, retains comparisons, returns to the workbook trace, rejects invalid counts/seeds and completes 100,000 trials.
- Prepublication comparison of all 104 served artifacts differs only at `monte-carlo/app.js`, `monte-carlo/index.html`, and `deployment-manifest.json`.

## Byte preservation

Windows checkout conversion initially changed hashes. Source was read as exact Git blob bytes before building. Nine unchanged deployed assets use CRLF while Git stores LF: `404.html`, `bus-2150/index.html`, `hub-return.css`, `lean-courses.css`, `mgmt-4570/app-shell.css`, `robots.txt`, `styles.css`, `theme.css`, and `tool-theme.css`. Each was fetched from production, verified equal to the reviewed source after CRLF normalization, and its exact production bytes retained in the deployment artifact. Rebuilding on another platform requires preserving these line endings to reproduce the full deployment byte-for-byte. The native-tool manifest, examples and all runtime hashes are deterministic from the Git bytes.

Publish through the existing Worker only, with `wrangler deploy --keep-vars`. Verify every hosted artifact and rerun the Monte Carlo browser tests against the production URL after deployment.
