# Interactive course tools public hub

This repository owns the public landing page and deterministic deployment shell for Dr. Ben Hartlage's interactive teaching tools.

Primary site:

- `https://tools.benhartlage.com/`
- `https://tools.benhartlage.com/tools/` (directory alias)

The previous `https://rhartlage.github.io/` site remains a compatibility surface until Ben accepts the replacement and separately retires GitHub Pages publication.

## Deterministic composition

`tool-sources.json` pins eleven teaching-tool suites to exact public source repository commits. `npm run build` copies only the allowlisted static files from those commits into `dist/`; it does not copy unrelated repository files, local state, credentials, or provider configuration.

The MGMT-4570 Lean Operations Management course includes Value Stream Studio 1.2.0, derived from the supplied portable release with an optional student-controlled discrete-event simulation. `static-tools.json` preserves the original archive provenance and separately pins all eight current runtime files by SHA-256. Maps and simulation settings autosave in the user's browser and can be saved as a portable file; the app does not upload maps. See [simulation behavior and validation](docs/value-stream-simulation.md).

```powershell
npm run build
npm run validate
npm run test:simulation
npm run preview
```

See `docs/public-hosting.md` for deployment, provenance, rollback, and GitHub Pages transition details.

## Boundaries

- This is a public, static educational site.
- No secrets, analytics identifiers, private tools, provider calls, or protected application routes belong here.
- Existing QBO compatibility pages are not part of the `tools.benhartlage.com` deployment bundle.
