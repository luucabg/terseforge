# Contributing

Thank you for helping make coding-agent optimization measurable and safe.

## Development setup

```bash
git clone https://github.com/luucabg/terseforge.git
cd terseforge
npm ci
npm run check
```

Use Node 22 or 24. Keep the project serverless and local-only unless a future proposal explicitly changes that constraint.

## Change workflow

1. Open an issue for substantial behavior or public-interface changes.
2. Add a failing behavioral test first.
3. Implement the smallest change that passes it.
4. Preserve exact errors, warnings, paths, commands, and raw recoverability.
5. Run `npm run check` after the final edit.
6. Update documentation and `CHANGELOG.md` for user-visible changes.

Coverage thresholds are 80% globally for statements, branches, functions, and lines. Tests currently include unit, integration, CLI end-to-end, Windows command-wrapper, timeout, path-validation, and benchmark recovery cases.

## Design constraints

- No remote telemetry.
- No mandatory server.
- No claims based only on visible output reduction.
- No integration labeled native unless the mechanism is documented precisely.
- No quality reduction in exchange for fewer tokens.
- Configuration changes must remain schema-versioned and migration-aware.
- Commands use executable/argument arrays, not concatenated shell text.

## Pull requests

Keep commits focused and explain why the change is needed. Include reproducible verification output. Avoid generated logs, `.terseforge/`, credentials, and benchmark run artifacts in commits.

## Maintainer releases

Public releases use the token-free GitHub trusted publisher in `.github/workflows/publish.yml`. Do not add an npm token to repository secrets. Follow [docs/publishing.md](docs/publishing.md) for versioning, tagging, verification, and workflow dispatch.
