# Statistics Tutor release receipt — prepared, not deployed

This change adds `/statistics-tutor/`, the eighth BUS-2150 card on the public home page, a BUS-2150 suite link, and a sitemap entry. It does not change existing apps, their source pins, shared styles, Workers configuration, access policies, or private dashboards.

## Exact source and target

- Canonical source: `rhartlage/stats-tools`, branch `codex/socratic-statistics-tutor`.
- Pinned source commit: `e2b7dbf09969dc77a09703740b5a304e4e421b0b`.
- Source draft PR: https://github.com/rhartlage/stats-tools/pull/5
- Public shell: `rhartlage/rhartlage.github.io`, branch `codex/statistics-tutor-public`.
- Shell base: `31ac6ac06c97c74131ebfee5cc0e8a1dfb317bd0` (`agent/power-explorer-20261017`). Default `main` is older than the existing public releases. The separate pending value-stream simulation branch is not included.
- Worker: **`benhartlage-public-tools`**; config: **`wrangler.jsonc`**.
- Existing custom domain: **`tools.benhartlage.com`**.
- Intended app URL: **https://tools.benhartlage.com/statistics-tutor/**.
- Existing documented command: **`npx wrangler deploy --keep-vars`**.

Use the exact final shell commit reported with this receipt, not a stale checkout or default branch. No `.github` workflow exists in this shell lineage and GitHub returned no workflow runs for the base release commit. No GitHub-managed Cloudflare release path was verified. Legacy GitHub Pages is a separate compatibility surface; do not publish there as a substitute.

## Verification completed

- Eight statistical/engine tests: five independently supplied t intervals including df=1; invalid inputs; numeric rounding; 1,000 coherent randomized problems; independent field grading; 10,000 normal-population samples; 10,000 cases calculated from the displayed t critical value.
- Independent statistical/code review: reset capture, live hint announcements, chart alignment and propagated display-rounding tolerance rechecked; no outstanding findings.
- Full Chromium lesson paths at 1440×1000 and 390×844: all answers, misconceptions, progressively stronger hints, explanations, invalid/blank inputs, repeated checks, previous/next, fresh/reset, topic control, typed-answer retention across views, both labs, keyboard answers, reload behavior and absence of external requests/storage/cookies.
- Public-shell build, route/assets/canonical/catalog validator, and secret scan passed. Wrangler 4.154.0 dry run passed for the final 110-file distribution using an empty temporary CLI configuration directory; this did not authenticate or publish.
- Shared-shell desktop/mobile screenshots reviewed. Additional 320px layout and WCAG 2 A/AA + 2.1 AA automated checks cover guided, numeric error, width, and expanded sample-table states. The table's horizontal scroll region was made keyboard-focusable after the check identified it. Recheck: zero violations across all 12 viewport/state combinations. Public-directory navigation and native browser back/forward passed locally.
- No lint or typecheck command exists in either project; ES modules pass `node --check`. Buildless static source has no framework compilation.

The release-preservation guard passes against the recorded base catalog and rejects a deliberately changed existing pin; a fresh live-manifest check remains pending. The browser screenshots/JSON and distribution hash receipt are retained with the local release packet. Tests of the composed shell do not prove public deployment.

## Publishing blocker and safe continuation

Wrangler 4.154.0 `whoami` reports **“You are not authenticated.”** No login, credential creation, permissions change, temporary account, or deployment was attempted. The cloud execution proxy also rejects direct public-host access (HTTP 403 / Chromium tunnel failure), although the parent's independent unauthenticated inventory verified the existing public tools. The current production manifest and active Worker version therefore still need a fresh read from the authorized release environment.

1. In the already authorized environment, check `npx wrangler whoami`; use the existing account and permissions only.
2. Fetch the exact shell branch and commit into an isolated checkout/worktree. Verify `git rev-parse HEAD` against the final release receipt. Build sources are pinned and fetched read-only.
3. Record `npx wrangler deployments list --config wrangler.jsonc` and the active `benhartlage-public-tools` version for rollback.
4. Read https://tools.benhartlage.com/deployment-manifest.json anonymously into a temporary JSON file. Run `npm run build`, then `node scripts/check-tutor-release.mjs <that-file>`. This guard stops if any existing app/pin/portable asset differs. Resolve any newer production changes without reverting or publishing unrelated app work.
5. Run `npm run validate`, `npm run validate:secrets`, and `npx wrangler deploy --dry-run --config wrangler.jsonc`.
6. Only after those checks, run `npx wrangler deploy --keep-vars --config wrangler.jsonc` for the existing public Worker. Preserve all hostnames/settings outside this config.
7. From a fresh unauthenticated browser, verify the home and `/bus-2150/` tutor links, `/statistics-tutor/`, all six tutor assets, the four companion links, a full question path and both labs. Confirm `/deployment-manifest.json` contains the exact pinned tutor source commit. Record Worker deployment/version IDs and app URL. A build or dry run alone is not completion.

Rollback: use the recorded previous version of **only** `benhartlage-public-tools` if the new release regresses. No private Worker, Access configuration, apex domain, or other service belongs in this release.

## Curriculum and existing tools

The source README documents extension contracts, the future-topic backlog, and the complementary-app comparison. All four companions were independently smoke-tested publicly on October 28, 2026; links open separate tabs without passing student answers. No existing app is retired or modified. The tutor is optional practice, with no scores sent or persisted. Progress lives only on the current page and clears on reload/close.
