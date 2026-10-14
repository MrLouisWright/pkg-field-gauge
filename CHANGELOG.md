# Changelog

## 1.0.1 (2026-10-14)

- Fix: `repository-mismatch` no longer compares a package against the git remote of an enclosing repository unless `repository.directory` places it there (fixtures and nested packages were flagged in CI).

## 1.0.0 (2026-10-14)

First release, by Louis Wright.

- Entry points: `main`, `module`, `browser`, `types`/`typings`, `bin` (with shebang check) and every `exports` target are resolved on disk, including subpath patterns.
- `exports` structure: `./`-relative targets, no mixing of subpaths and conditions, `types` first and `default` last, `require`/`import` targets vs `type` and file extensions, `main`/`types` reachable through `exports["."]`, `./package.json` export.
- `files`: every entry point must be published; entries that match nothing.
- Metadata: name (npm naming rules), SemVer version, description, keywords, license (SPDX), repository (format, shorthand, matching git remote), homepage/bugs, engines, deprecated fields, `sideEffects` validity and CSS tree-shaking trap.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
