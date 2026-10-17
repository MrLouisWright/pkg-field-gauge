# Changelog

## 1.1.0 (2026-10-17)

Re-release of the 1.0.1 changes below, which did not become available on npm. No code changes since 1.0.1.

## 1.0.1 (2026-10-15)

- **Types per module-resolution mode** (attw-style): for every export, checks which declaration TypeScript loads under `node10`, `node16-cjs`, `node16-esm` and `bundler`. New rules: `types-unresolved`, `types-false-esm` / `types-false-cjs` (types masquerading as the wrong module format), `types-node10-subpath`. `resolveTypes` / `resolveExports` exported; `--no-types` opts out.
- **Tarball mode** (`--pack`, `packedFiles`): lints the file list from `npm pack --dry-run` (publint-style), so `.npmignore`/`files` mistakes show up as `not-in-tarball`, with packed size in the summary.
- **HTML report** (`-f html`, `--html <file>`, `formatHtml`): a self-contained page for CI artifacts or GitHub Pages.
- **`checkPackage(dir, opts)` per-package API** returning raw findings (with `rules`/`skip` filters), used by monorepo-gauge for each workspace.
- **Removed engines checks** (`engines-missing`, `engines` type check): engines belong to engines-gauge.
- Dual ESM + CJS build, generated `.d.ts`, require/import CI checks.


- Fix: `repository-mismatch` no longer compares a package against the git remote of an enclosing repository unless `repository.directory` places it there (fixtures and nested packages were flagged in CI).

## 1.0.0 (2026-10-14)

First release, by Louis Wright.

- Entry points: `main`, `module`, `browser`, `types`/`typings`, `bin` (with shebang check) and every `exports` target are resolved on disk, including subpath patterns.
- `exports` structure: `./`-relative targets, no mixing of subpaths and conditions, `types` first and `default` last, `require`/`import` targets vs `type` and file extensions, `main`/`types` reachable through `exports["."]`, `./package.json` export.
- `files`: every entry point must be published; entries that match nothing.
- Metadata: name (npm naming rules), SemVer version, description, keywords, license (SPDX), repository (format, shorthand, matching git remote), homepage/bugs, engines, deprecated fields, `sideEffects` validity and CSS tree-shaking trap.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
