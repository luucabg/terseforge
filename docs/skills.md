# Agent Skill setup

TerseForge includes an Agent Skill that turns a plain request into a safe, repeatable project setup.

```text
Activate TerseForge in this project.
```

The agent still uses the local TerseForge CLI. No remote service is involved, and the quality checks remain in place.

## Install once

Run the command that matches your coding agent:

```bash
terseforge skill install --agent codex
terseforge skill install --agent claude
terseforge skill install --agent gemini
```

The default `user` scope makes the skill available across repositories. Add `--scope project` when you want it available only in the current repository.

| Agent | User scope | Project scope | Refresh behavior |
| --- | --- | --- | --- |
| Codex | `$CODEX_HOME/skills/terseforge` or `~/.codex/skills/terseforge` | `.agents/skills/terseforge` | Start a new session if the skill is not listed yet. |
| Claude Code | `~/.claude/skills/terseforge` | `.claude/skills/terseforge` | Project changes are detected automatically. Start a new session for a new user skill if needed. |
| Gemini CLI | `~/.gemini/skills/terseforge` | `.gemini/skills/terseforge` | Run `/skills reload` if the skill is not listed yet. |

See the official [Claude Code skills guide](https://code.claude.com/docs/en/slash-commands) and [Gemini CLI Agent Skills guide](https://geminicli.com/docs/cli/using-agent-skills/) for their discovery rules.

## What activation does

When the agent discovers the skill, it follows this sequence:

1. Check that the local `terseforge` command is available.
2. Keep the existing `terseforge.config.json`, or create one with `safe` if none exists.
3. Change to `safe`, `lean`, or `ultra` only when you ask for that preset.
4. Install a project-scoped copy so future sessions can find the skill.
5. Run `terseforge doctor` and report the result.

The skill never uses `init --force` just to change a preset. It does not overwrite a foreign skill or install remote software without permission.

## Prompts you can use

```text
Activate TerseForge in this project.
Use TerseForge lean in this project.
Switch TerseForge to safe.
Is TerseForge active here?
```

You do not need to copy these phrases exactly. The skill can match equivalent requests in other languages. Codex also supports an explicit `$terseforge` invocation, while Claude Code exposes `/terseforge`. Gemini CLI activates the skill from a matching request after discovery.

## Check or update the installation

```bash
terseforge skill status --agent codex
terseforge skill status --scope project
terseforge skill install --agent codex --force
```

Installation is idempotent. `--force` updates only a skill whose frontmatter already identifies it as TerseForge. The installer preserves unknown files and partially occupied destinations.

## Stop or remove it

To stop using TerseForge for the current task, stop invoking its commands. Persistent removal is manual by design. Inspect the exact user or project path first, then remove only the TerseForge skill directory and configuration you intend to delete.

The presets change context selection, log display, and visible communication. They do not shorten generated code or lower the expected reasoning quality. Required quality gates still block completion when verification fails.
