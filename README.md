# pkg-field-gauge

[![npm version](https://img.shields.io/npm/v/pkg-field-gauge.svg)](https://www.npmjs.com/package/pkg-field-gauge) [![CI](https://github.com/MrLouisWright/pkg-field-gauge/actions/workflows/ci.yml/badge.svg)](https://github.com/MrLouisWright/pkg-field-gauge/actions/workflows/ci.yml) [![Node](https://img.shields.io/node/v/pkg-field-gauge.svg)](https://nodejs.org) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Validate package.json before you publish: exports/main/types consistency, files, repository, keywords and sideEffects.

A package can pass its tests and still ship broken. The `types` condition sits after `import`, so TypeScript never sees it. `require` points at an ESM file. `main` and `exports["."]` load different files. The `.d.ts` isn't covered by `files`. `sideEffects: false` lets bundlers drop your CSS. The `repository` doesn't match the git remote, so provenance publishing fails. `pkg-field-gauge` resolves every entry point on disk and checks each field the way Node, TypeScript, bundlers and npm read it. Every finding has a line number and a **concrete fix**.

CLI, library and GitHub Action. Node.js 18+, **zero runtime dependencies**. By Louis Wright.

## Features

- **Entry points:** `main` (resolved like Node: `+.js`, `/index.js`), `module`, `browser`, `types`/`typings`, every `bin` (plus a `#!` shebang check) and every `exports` target, including subpath patterns (`./utils/*`), conditions and fallback arrays.
- **`exports` rules:** targets must start with `./` and stay inside the package; subpaths and conditions can't be mixed; `types` must come first and `default` last; `require` must not point at ESM and `import` must not point at CommonJS (checked against the extension and `"type"`); a `types` condition must point at a `.d.ts`; `main`/`types` must be reachable through `exports["."]`; `./package.json` should be exported.
- **`files`:** every entry point must be published (npm always includes `package.json`, README, LICENSE, `main` and `bin`), and entries that match nothing are reported.
- **Metadata:** npm name rules, SemVer version, field types, `type` value, description, keywords, SPDX license, repository format and agreement with `git remote origin`, `engines.node`, homepage/bugs, deprecated fields (`preferGlobal`, `typings`, `licenses`…), `sideEffects` validity and the CSS trap. `--require` adds your own required fields.
- **Output:** text, JSON, SARIF 2.1.0 and Markdown, with `package.json` line numbers; `--fail-on`; exit codes 0/1/2; allowlist entries with expiry dates.

## Rules

| Rule | Default severity | What it catches |
|---|---|---|
| `invalid-name` | critical | name is missing or not a valid npm package name |
| `invalid-version` | high | version is missing or not valid SemVer |
| `entry-missing` | high | main/module/types/bin/browser points at a file that does not exist |
| `exports-target-missing` | high | An exports target does not exist |
| `exports-invalid` | high | exports is malformed (relative ./ targets, subpaths vs conditions) |
| `not-in-files` | high | An entry point is not included by "files", so it will not be published |
| `format-mismatch` | medium | require/import target has the wrong module format for its extension and "type" |
| `exports-condition-order` | medium | "types" must be the first condition and "default" the last |
| `types-not-exported` | medium | types exist but exports["."] has no "types" condition |
| `main-not-exported` | medium | main is not reachable through exports["."] |
| `bin-no-shebang` | medium | bin file has no #! shebang |
| `side-effects-invalid` | medium | sideEffects is not a boolean or array of globs, or would drop CSS |
| `repository-missing` | medium | No repository field |
| `license-missing` | medium | No license field |
| `field-type` | medium | Field has the wrong type |
| `repository-mismatch` | low | repository does not match the git remote or is malformed |
| `files-entry-unmatched` | low | A "files" entry matches nothing |
| `keywords-missing` | low | No keywords (hurts npm search) |
| `description-missing` | low | No description |
| `license-invalid` | low | license is not a valid SPDX expression |
| `deprecated-field` | low | Deprecated or non-standard field |
| `required-field` | low | A field required by your config is missing |
| `package-json-not-exported` | info | exports hides ./package.json from tools |
| `engines-missing` | info | No engines.node |
| `homepage-missing` | info | No homepage or bugs URL |
| `allowlist-expired` | medium | Allowlist entry has expired |
| `allowlist-unused` | info | Allowlist entry matched nothing |

## Install and run

```bash
npx pkg-field-gauge                         # check ./package.json (run after your build)
npx pkg-field-gauge packages/core --fail-on medium
npx pkg-field-gauge --require funding,engines.node
```

Add it to `prepublishOnly` so a broken manifest can never be published:

```json
{ "scripts": { "prepublishOnly": "npm run build && pkg-field-gauge --fail-on medium" } }
```

### Sample output

```text
pkg-field-gauge — Broken_Pkg@1.0
ESM package; exports, 1 bin(s), files: 2 entries

CRITICAL package.json:2 name "Broken_Pkg" contains uppercase letters [invalid-name]
         ↳ fix: Use a lowercase, URL-safe name (optionally @scope/name).
HIGH     package.json:14 types target "lib/index.d.ts" is not included by "files", so it will be missing from the published package [not-in-files]
         ↳ fix: Add "lib" to "files".
MEDIUM   package.json:7 exports["."]: "types" is condition #3; TypeScript only sees it when it comes first [exports-condition-order]
         ↳ fix: Move "types" to the top of the object.
MEDIUM   package.json:7 exports["."].require → "./lib/index.js" is ESM ("type": "module") [format-mismatch]
         ↳ fix: Point "require" at a .cjs build (or drop the condition if you only ship ESM).
```

## Options

```text
pkg-field-gauge 1.0.0 — validate package.json fields before you publish

Usage: pkg-field-gauge [dir] [options]

Fields
      --require <fields>    Extra required fields (comma-separated, dotted paths ok: engines.node,funding)

Common
  -c, --config <file>     JSON config (default: .pkg-field-gauge.json or "pkgFieldGauge" in package.json)
  -f, --format <fmt>      text (default) | json | sarif | markdown
      --json <file>       Also write a JSON report
      --sarif <file>      Also write SARIF 2.1.0
      --markdown <file>   Also write Markdown (e.g. for a job summary)
      --fail-on <sev>     critical | high | medium | low | info | none (default: high)
      --list-rules        Print rules and default severities
      --no-fixes          Hide fix suggestions in text output
      --no-color          Disable colours
  -v, --version / -h, --help

Exit codes: 0 = passed, 1 = findings at or above --fail-on, 2 = usage, config or read error.
```

## Configuration and allowlist

Options can live in `.pkg-field-gauge.json` (or a `"pkgFieldGauge"` key in `package.json`, or `--config <file>`):

```json
{
  "failOn": "medium",
  "severity": { "package-json-not-exported": "low" },
  "allowlist": [
    { "rule": "keywords-missing", "subject": "exports:./legacy", "reason": "Kept for v1 consumers until 2027", "expires": "2027-03-31" }
  ],
  "require": ["description", "keywords", "license", "repository", "engines"]
}
```

- **`severity`** changes a rule's severity, or turns it `"off"`.
- **`allowlist`** entries suppress matching findings. Each needs a `reason` and matches on any combination of `rule`, `file`, `subject` (globs with `*`) and `match` (a substring of the message). Add `expires` (`YYYY-MM-DD`) so the exception is time-boxed: once it lapses the finding comes back along with an `allowlist-expired` finding (medium). Entries that no longer match anything are reported as `allowlist-unused` (info).

## Output and exit codes

- `--format text` (default), `json`, `sarif` (SARIF 2.1.0 for GitHub code scanning) or `markdown` (for job summaries and PR comments). `--json`, `--sarif` and `--markdown` write extra report files in the same run.
- `--fail-on <severity>` sets the threshold (`critical`, `high`, `medium`, `low`, `info`, `none`; default `high`).
- Exit codes: **0** passed, **1** findings at or above `--fail-on`, **2** usage, config or read error.

## GitHub Action

```yaml
permissions:
  contents: read
  security-events: write   # only needed for the SARIF upload
jobs:
  pkg-field-gauge:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with: { persist-credentials: false }
      - uses: MrLouisWright/pkg-field-gauge@v1
        with:
          fail-on: high
          sarif: pkg-field-gauge.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: pkg-field-gauge.sarif }
```

| Input | Description | Default |
|---|---|---|
| `path` | Project directory | `.` |
| `fail-on` | Failure threshold | `high` |
| `config` | Config file path | |
| `sarif` / `json` | Write SARIF / JSON report to this path | |
| `job-summary` | Add the Markdown report to the job summary | `true` |
| `args` | Extra CLI arguments | |

The action runs the bundled CLI with Node 20; it has no dependencies to install. Pin it to a commit SHA if your policy requires it.

Run it after your build step so the files under `exports` exist.

## Library

```js
import { check, validName, validLicense } from 'pkg-field-gauge';
const report = check('.');
validName('My-Package'); // ['contains uppercase letters']
validLicense('(MIT OR Apache-2.0)'); // true
```

Types are included.

## Requirements

Node.js 18 or newer. Zero runtime dependencies.

## Support

If this project is useful to you, you can support its development with a donation: [Buy me a coffee](https://donate.stripe.com/aFa00lek3cvX4Ds2Fk9EI0b). It helps keep these tools maintained, documented and free for everyone.

## Licence

MIT © Louis Wright ([Louis Wright](https://github.com/MrLouisWright))
