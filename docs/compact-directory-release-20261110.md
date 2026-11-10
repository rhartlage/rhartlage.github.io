# Compact, filterable tools directory

Based on the production-matching release `78d3cb5` on `agent/vsm-textbook-20261109`, not the older `main` branch. The previous release was verified against all 113 hosted artifacts before changes.

## Scope
- One alphabetically ordered card per tool: 21 unique direct app links.
- Compact 128px cards with the tool name, launch arrow, and course tags. Extra descriptions and intermediate suite cards are removed from the home page.
- An accessible course dropdown replaces course navigation cards and repeated per-course sections.
- All 23 previous course-link occurrences are preserved as course associations. Inverse Transform is Statistics/Operations; Value Stream Studio is Operations/Lean. Monte Carlo also receives its existing Statistics association from native release metadata.
- Filters show 12 BUS-2150, 9 BUS-3150, and 3 MGMT-4570 tools. All courses shows 21 unique tools.
- Filter choice is encoded in the URL, works with Back/Forward and app navigation, and supports the previous course hash bookmarks. Without JavaScript, all direct links remain available.
- The existing suite URLs remain available for compatibility. Tool applications, source pins, release manifest, security headers, domains, Access, storage, and credentials remain unchanged.

## Checks
- Build, site validation (28 HTML files, 13 pinned suites), secret scan, and JavaScript syntax checks pass.
- Six browser tests pass: unique routes/tags and alias; card dimensions and overflow at 1440/1000/900/768/600/390/320px; exact filters and cross-listings; all 21 apps open directly; keyboard and repeated Back/Forward/reload; old bookmarks/unknown filters/no-JavaScript fallback.
- Desktop and mobile screenshots were visually inspected.
- Wrangler dry-run passes.

## Release procedure
Run `npm run build`, `npm run preflight:directory`, `npm run validate`, `npm run validate:secrets`, `npm run test:directory-ui`, and Wrangler dry-run before deployment. The browser test supports DIRECTORY_PLAYWRIGHT_MODULE and DIRECTORY_CHROMIUM_PATH when using an existing Playwright/Chromium installation.

`preflight:directory` compares the complete build against the current public release. It rejects any changed app or provenance record and allows only index.html, tools/index.html, styles.css, and directory.js. Equivalent existing line endings are preserved byte-for-byte from production, following the prior release's approach. Do not rebuild between preflight and deployment.

Record the current Worker version, publish only `benhartlage-public-tools` with the existing custom domain and `--keep-vars`, then run `npm run verify:hosted` and browser tests with DIRECTORY_TEST_URL=https://tools.benhartlage.com. Roll back only this Worker if verification fails.
