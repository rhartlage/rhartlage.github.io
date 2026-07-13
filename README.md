# Stats & Operations Analysis public hub

This repository owns the public landing page and deterministic deployment shell for Dr. Ben Hartlage's interactive teaching tools.

Primary site:

- `https://tools.benhartlage.com/`
- `https://tools.benhartlage.com/tools/` (directory alias)

The previous `https://rhartlage.github.io/` site remains a compatibility surface until Ben accepts the replacement and separately retires GitHub Pages publication.

## Deterministic composition

`tool-sources.json` pins every hosted tool to an exact public source repository commit. `npm run build` copies only the allowlisted static files from those commits into `dist/`; it does not copy unrelated repository files, local state, credentials, or provider configuration.

```powershell
npm run build
npm run validate
npm run preview
```

See `docs/public-hosting.md` for deployment, provenance, rollback, and GitHub Pages transition details.

## Boundaries

- This is a public, static educational site.
- No secrets, analytics identifiers, private tools, provider calls, or protected application routes belong here.
- Existing QBO compatibility pages are not part of the `tools.benhartlage.com` deployment bundle.
