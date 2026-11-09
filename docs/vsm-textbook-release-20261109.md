# Value Stream Studio 1.4.0: textbook-aligned waiting-line lesson

Based on release commit 9dbe5905f2347591bde4b8a961769d63598c16e1, preserving the latest inverse-transform, Monte Carlo, control-chart and measurement-reliability tools. Do not deploy historical main.

## Runtime changes
- Optional exact-arrival mode (1–25,000): stop arrivals, then drain every item.
- Warmup removes arrival IDs, not completion order. Completed-item cohort metrics show mean/max wait, positive-wait and strict-over-threshold counts/fractions, total service, final completion and explicit provisional status. Existing time-weighted metrics retain the whole-run time window.
- Fixed input replay, Normal-z replay and per-item seeded services support paired comparisons. Settings preserve replay through JSON, unit conversion and reload. Exact durations are locked until an explicit clear; z-based Normal mean/SD remain editable.
- Optional earliest-next-free server selection, ties by inspector number, matching the textbook spreadsheet. Old models keep first-free/server-stream behavior.
- Uniform permits zero lower bound. New `normalRaw` is an ordinary untruncated Normal and stops on invalid nonpositive duration; legacy positive Normal remains unchanged.
- Next completion plus event stepping; structured FIFO IDs, server clocks, paginated per-item/per-station trace, CSV.

## Verification
39 engine tests passed including all legacy tests, exact textbook traces, arrival-ID warmup with out-of-order completions, threshold roundoff, replay/JSON, mean changes, random-number pairing, invalid inputs and25,000-item draining.
18 browser acceptance tests passed:15 legacy and3 lesson cases (desktop/mobile, import/export, settings, replay protection, unit conversion, Normal-z mean changes, completion stepping, CSV and trace pagination).
Six instructor lesson JSON files were generated privately from the original workbook (SHA25630bd89e413f60fa297aae136d22c029ad1ae070f1512eb0c0382e4da414b772a). All4,020 scarf rows were checked against an independent Python recurrence, including inspector assignment, arrival, start, wait and finish. Original workbook was not modified or published.

## Release guard
Run build, validate, validate:secrets, engine/browser tests, then preflight-vsm-textbook-release.mjs. The preflight permits only VSM runtime and deployment manifest changes. It preserves exact live bytes for nine otherwise equivalent CRLF assets. All unrelated pinned/static/native tool records must remain identical. Publish only through the existing benhartlage-public-tools Worker with --keep-vars; capture the prior version and verify every hosted file after publication.

No security/credentials/Access policy or paid-service changes. No private workbook data is included in the hosted build.

Prior live Worker version verified before release: `05bc32ec-04ec-4b00-a920-01992ab544aa` (2026-11-07).
