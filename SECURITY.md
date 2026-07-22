# Security policy

## Supported versions

Until the project reaches 1.0, only the latest released minor version receives security fixes.

## Reporting a vulnerability

Use GitHub's **Security** tab and select **Report a vulnerability** to create a private security advisory for `luucabg/terseforge`. Do not include secrets, exploit details, or sensitive repository output in a public issue.

Include:

- affected version and operating system;
- minimal reproduction;
- impact and trust boundary;
- whether raw artifacts, paths, subprocess execution, or configuration validation are involved;
- a suggested remediation if available.

Maintainers should acknowledge a report within seven days. Timelines for a fix and disclosure depend on severity and reproducibility.

## Security boundaries

TerseForge executes commands explicitly supplied by the user or configured repository. Installing or running a repository's quality gates grants those commands the same local permissions as the invoking user. Review untrusted configuration before running `check`.

TerseForge does not promise to redact secrets from command output. It avoids recording arguments, keeps state local, and requests restrictive artifact permissions, but users must treat `.terseforge/` as sensitive.
