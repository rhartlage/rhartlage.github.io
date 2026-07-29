# Public Stats & Operations Analysis hosting

## Architecture

`rhartlage/rhartlage.github.io` is the public deployment-shell owner for `tools.benhartlage.com`. The site is a Cloudflare Workers static-assets deployment named `benhartlage-public-tools` with one custom domain: `tools.benhartlage.com`. The apex `benhartlage.com` is outside this deployment and must remain unchanged.

The ten teaching-tool suites remain canonical in their public source repositories. `tool-sources.json` pins an exact commit and allowlisted file set for each suite. `scripts/compose-tools.mjs` reads those committed files with `git show`, then builds a disposable `dist/` bundle. This keeps hosted output reproducible without maintaining independent application forks.

The bundle intentionally excludes:

- repository history and non-runtime docs;
- QBO/provider compatibility routes in this repository;
- local state and cache files;
- credentials, analytics identifiers, and provider configuration;
- protected/private tools.

## Public URL contract

- `https://tools.benhartlage.com/`
- `https://tools.benhartlage.com/bus-2150/`
- `https://tools.benhartlage.com/linear-programming/`
- `https://tools.benhartlage.com/study-design-bias/`
- `https://tools.benhartlage.com/normal-area/`
- `https://tools.benhartlage.com/sampling-distribution/`
- `https://tools.benhartlage.com/inference-decision/`
- `https://tools.benhartlage.com/comparing-groups/`
- `https://tools.benhartlage.com/comparing-groups/?lab=anova`
- `https://tools.benhartlage.com/linear-regression/`
- `https://tools.benhartlage.com/categorical-risk/`
- `https://tools.benhartlage.com/statistical-investigation/`
- `https://tools.benhartlage.com/bus-3150/`
- `https://tools.benhartlage.com/bus-3150/lp-formulation-sensitivity/`
- `https://tools.benhartlage.com/bus-3150/network-integer-decisions/`
- `https://tools.benhartlage.com/bus-3150/simulation-operating-risk/`
- `https://tools.benhartlage.com/bus-3150/forecast-to-decision/`
- `https://tools.benhartlage.com/tools/` is a compatibility directory alias for the hub.

The BUS-2150 tools use local static assets only: no accounts, analytics, external fonts, browser storage, or transmitted student data.
HTML responses include `Cache-Control: no-transform`, which prevents edge payload injection, including Cloudflare's automatic Web Analytics beacon.

## Build and validation

```powershell
npm run build
npm run validate
npm run validate:secrets
npx wrangler deploy --dry-run
```

The build uses clean sibling clones under `C:\Users\rhart\GitHub` when available. If a source repo is absent, it creates a disposable public clone under `.tool-cache/`. It never checks out or edits a sibling source working tree.

## Deploy

After all source commits and the hub commit are pushed:

```powershell
$env:NODE_OPTIONS = '--use-system-ca'
npm run build
npx wrangler deploy --keep-vars
```

This deployment creates or updates only `benhartlage-public-tools` and its `tools.benhartlage.com` custom domain. It must not capture the apex, modify protected subdomains, Cloudflare Access, private Workers, D1/R2/KV, or secrets.

## Compatibility and retirement

The existing `rhartlage.github.io` hub and per-repository GitHub Pages sites remain available during Ben's acceptance window. Canonical metadata and in-tool return links point at the new `tools.benhartlage.com` routes. GitHub Pages retirement is a separate post-acceptance action; source repositories and history remain preserved.

## Rollback

1. Record the active Worker version before each deployment.
2. Roll back `benhartlage-public-tools` to the prior Worker version with Wrangler if a hosted regression appears.
3. If the custom domain itself must be removed, delete only the `tools.benhartlage.com` Worker custom domain/DNS target. The apex remains outside this deployment.
4. Legacy GitHub Pages URLs remain the temporary functional fallback until Ben approves their retirement.
