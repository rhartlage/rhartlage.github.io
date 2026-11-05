# Inverse Transform Lab

Public URL: https://tools.benhartlage.com/inverse-transform/

The first-party static app is maintained in `inverse-transform/`. The composition script copies the runtime files, JSON guide/schema, and classroom examples from an explicit allowlist and records their SHA-256 hashes under `nativeTools` in the public deployment manifest. Both Statistics and Operations cards on the main directory link to this shared route.

Five selectable models: Exponential, Normal, Poisson, Uniform, Binomial. A manual U is a preview; random draws alone enter the empirical histogram. Trace and Next step expose the probability-to-CDF-to-outcome sequence. Random draws, batches, and pausable auto drawing use open-interval uniform values. Parameters reset sample history. No storage, external scripts, credentials, or network calls are used by the app.

## Numerical contract

- For 0 < u < 1, the discrete inverse chooses the smallest k for which F(k) ≥ u. The assignment interval is F(k−1) < u ≤ F(k); CDF steps are right-continuous. Vertical dashed guides indicate jumps, not intermediate CDF values.
- Manual endpoints use support limits, including infinities; they never enter the sample. The zero-mean Poisson and Binomial p=0/1 cases are point masses.
- Normal tails use regularized incomplete gamma series / continued fraction, with quantile bisection against the smaller tail probability. No finite clipping at the plot boundary.
- Poisson λ is bounded to [0,100]. Forward PMF recurrence starts at exp(−λ), with cutoff ceil(λ + 20√λ + 100), normalization, compensated prefix accumulation, and reverse upper-tail sums. The omitted probability is below double precision at this cutoff. Binomial uses recurrence outward from its mode.
- Histograms are normalized by total sample count and bin width, with out-of-window counts reported. Discrete relative frequencies count occurrences of each outcome. Sample SD uses n−1.

References: [NIST Exponential](https://itl.nist.gov/div898/handbook/eda/section3/eda3667.htm), [NIST Poisson](https://itl.nist.gov/div898/handbook/eda/section3/eda366j.htm), [CDF and quantile functions](https://www.randomservices.org/random/dist/CDF.html).

## Checks

`npm run test:inverse` checks independent SciPy fixtures, Normal tails, discrete jump boundaries, degenerate distributions, endpoints, validation, moments, and histogram normalization. `npm run test:inverse-ui` uses an isolated Playwright browser against the built bundle, or `INVERSE_TEST_URL` for hosted acceptance. Set `INVERSE_PLAYWRIGHT_MODULE` to an installed Playwright module if it is outside this repository. No personal browser profile is used.

Run the existing build, site validation, secret scan, and deployment dry run before publishing. Verify all unrelated deployed assets against the recorded pre-release hashes; preserve Value Stream Studio 1.3.1 and its source pins. The bounded classroom ranges and finite floating-point precision are intentional; this is not a general-purpose numerical library.

## Distribution JSON (1.1)

Open JSON validates a local UTF-8 file before changing any model or sample state.
Export JSON saves the current model, labels, and preview U. The public
`inverse-transform/json-guide.html` and `distribution.schema.json` document the
version-1 contract; examples are available from the lab and copied/hashes recorded
by the native-tool build allowlist. All six new runtime/document/example files
must accompany the four original runtime files.

The three Sanotronics examples are independent single-input demonstrations:
`examples/sanotronics-labor.json` (.9109 → 47 USD/device),
`examples/sanotronics-parts.json` (.4576 → 89.152 USD/device), and
`examples/sanotronics-demand.json` (.6026 → 16170.372046465955 devices).
The Normal model accepts mean ±1e9 and SD [1e-6, 1e9], so class-scale demand
is represented directly; samples remain continuous and unbounded.

Imported `discrete` tables intentionally use **[lower, upper)**, selecting the
first outcome with cumulative probability strictly greater than U. U=0 is valid,
U=1 is rejected. Poisson/Binomial retain the original generalized inverse and
endpoint contract above. The UI and guide explain this boundary distinction.
Sorted actual support drives PMF bars, CDF steps, and inverse tracing, including
negative, fractional, zero-mass, and widely spaced outcomes. No plotting loop
runs over the numeric span of imported support.

Validation enforces 256 KiB, 1–1,000 rows, finite values within ±1e12, unique
values, nonnegative probabilities, total within 1e-9 of 1, valid parameters,
version 1, and recognized fields. Decimal weights are accumulated with BigInt
before conversion to floating point, avoiding the `.1 + .2` boundary artifact.
Accepted totals are normalized; positive weights with unrepresentable intervals
are rejected. Imported labels use textContent, never HTML or executable code.

`npm run test:inverse` now includes JSON validation, exact classroom boundaries,
worked results, support behavior, normalization, export/reimport, and stratified
sampling. UI checks cover import/cancel/reimport, atomic failure, injection,
all three worked traces, wide support, downloads, and 1440/768/390/320px widths.
Set `INVERSE_CHROMIUM_EXECUTABLE` when using a system Chromium binary.
