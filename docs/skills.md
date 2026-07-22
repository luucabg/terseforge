# Natural-language activation

TerseForge includes a portable Agent Skill so a developer can activate it with a sentence instead of remembering every setup command.

```text
Activa TerseForge en este proyecto.
```

The phrase does not invoke a remote service or weaken the quality bar. It asks the coding agent to configure and use the local TerseForge CLI.

## One-time installation

Run one command for each coding agent you use:

```bash
terseforge skill install --agent codex
terseforge skill install --agent claude
terseforge skill install --agent gemini
```

The default scope is `user`, which makes the skill discoverable across repositories. Use `--scope project` to install it only in the current repository.

| Agent | User scope | Project scope | Refresh behavior |
| --- | --- | --- | --- |
| Codex | `$CODEX_HOME/skills/terseforge` or `~/.codex/skills/terseforge` | `.agents/skills/terseforge` | Start a new session if it is not listed yet. |
| Claude Code | `~/.claude/skills/terseforge` | `.claude/skills/terseforge` | Project changes are detected automatically; start a new session for a newly installed user skill if needed. |
| Gemini CLI | `~/.gemini/skills/terseforge` | `.gemini/skills/terseforge` | Run `/skills reload` if it is not listed yet. |

Claude Code documents user and project skills in its [official skills guide](https://code.claude.com/docs/en/slash-commands). Gemini CLI documents its discovery directories and reload command in the [official Agent Skills guide](https://geminicli.com/docs/cli/using-agent-skills/).

## What the activation phrase does

When the skill is discovered, the agent follows a conservative, inspectable sequence:

1. Verify that the local `terseforge` command exists.
2. Keep an existing `terseforge.config.json`, or create one with `safe` by default.
3. Apply `safe`, `lean`, or `ultra` only when the user requests it explicitly.
4. Install the same skill at project scope so future sessions can discover it.
5. Run `terseforge doctor` and report the result.

It never uses `init --force` to change a mode, never overwrites a foreign skill, and never installs remote software silently.

## Useful phrases

```text
Activa TerseForge en este proyecto.
Usa TerseForge lean en este proyecto.
Cambia TerseForge a safe.
¿Está TerseForge activo aquí?
```

Codex can also invoke the installed skill explicitly with `$terseforge`. Claude Code exposes it as `/terseforge`. Gemini CLI can activate it from a matching request after skill discovery.

## Inspect and update

```bash
terseforge skill status --agent codex
terseforge skill status --scope project
terseforge skill install --agent codex --force
```

Installation is idempotent. `--force` updates only a skill whose frontmatter already identifies it as TerseForge. Unknown or partially occupied destinations are preserved.

## Stop or remove it

Stop invoking TerseForge commands to disable it for the current task. Persistent removal remains manual by design: inspect the exact user or project path first, then remove only the `terseforge` skill directory and project configuration you intend to delete.

The skill optimizes context, logs, and visible communication. It does not shorten generated code or reduce the model's reasoning quality. Required quality gates still block completion when verification fails.
