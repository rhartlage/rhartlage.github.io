# Public Stats & Operations Analysis hosting

## Architecture

`rhartlage/rhartlage.github.io` is the public deployment-shell owner for `benhartlage.com`. The site is a Cloudflare Workers static-assets deployment named `benhartlage-public-tools` with one custom domain: `benhartlage.com`.

The four teaching tools remain canonical in their public source repositories. `tool-sources.json` pins an exact commit and allowlisted file set for each tool. `scripts/compose-tools.mjs` reads those committed files with `git show`, then builds a disposable `dist/` bundle. This keeps hosted output reproducible without maintaining independent application forks.

The bundle intentionally excludes:

- repository history and non-runtime docs;
- QBO/provider compatibility routes in this repository;
- local state and cache files;
- credentials, analytics identifiers, and provider configuration;
- protected/private tools.

## Public URL contract

- `https://benhartlage.com/`
- `https://benhartlage.com/tools/`
- `https://benhartlage.com/tools/linear-programming/`
- `https://benhartlage.com/tools/normal-area/`
- `https://benhartlage.com/tools/linear-regression/`
- `https://benhartlage.com/tools/sampling-distribution/`

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

This deployment creates or updates only `benhartlage-public-tools`. It must not modify protected subdomains, Cloudflare Access, private Workers, D1/R2/KV, or secrets.

## Compatibility and retirement

The existing `rhartlage.github.io` hub and per-repository GitHub Pages sites remain available during Ben's acceptance window. Canonical metadata and in-tool return links point at the new `benhartlage.com` routes. GitHub Pages retirement is a separate post-acceptance action; source repositories and history remain preserved.

## Rollback

1. Record the active Worker version before each deployment.
2. Roll back `benhartlage-public-tools` to the prior Worker version with Wrangler if a hosted regression appears.
3. If the custom domain itself must be removed, restore the pre-migration apex posture: no apex Worker custom domain or DNS target.
4. Legacy GitHub Pages URLs remain the temporary functional fallback until Ben approves their retirement.
