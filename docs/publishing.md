# Publishing

TerseForge is published as the public, unscoped npm package [`terseforge`](https://www.npmjs.com/package/terseforge).

## Trust configuration

The npm package must use GitHub Actions as its trusted publisher:

- Organization or user: `luucabg`
- Repository: `terseforge`
- Workflow filename: `publish.yml`
- Environment: none
- Allowed action: `npm publish`

The workflow requests GitHub OIDC permission and does not use an npm token. npm automatically attaches provenance when the public package is published from the public repository through this trusted publisher.

## Release procedure

1. Update `package.json`, `package-lock.json`, the CLI version, README badges, `llms.txt`, and `CHANGELOG.md`.
2. Run `npm run check` and `npm pack --dry-run --json`.
3. Merge the release pull request only after the Windows, macOS, and Linux matrix passes.
4. Create and push the matching annotated tag, such as `v0.1.2`.
5. Create the GitHub release from that tag.
6. Dispatch the `Publish npm package` workflow with the exact tag.
7. Verify the registry metadata and execute the CLI through `npx terseforge@<version> --version`.

The workflow checks out the requested tag and refuses to publish when the tag does not exactly match the package version. npm versions are immutable, so never retry an ambiguous publish until `npm view terseforge version` confirms whether it succeeded.

## Bootstrap publication

`v0.1.1` was published interactively to create the package and reserve the unscoped name. Subsequent releases use trusted publishing so maintainers do not need long-lived registry credentials in GitHub.

## Security rules

- Never commit `.npmrc`, access tokens, OTPs, recovery codes, or authentication URLs.
- Never place an npm automation token in GitHub secrets.
- Never publish from a dirty working tree or an unreviewed branch.
- Keep package 2FA enabled even when trusted publishing is configured.
- Verify the public tarball contents before every release.
