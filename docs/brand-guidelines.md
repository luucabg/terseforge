# TerseForge brand guidelines

> Version 1.0 · 2026-07-23

These guidelines keep the project recognizable without turning technical documentation into marketing copy.

## Core identity

| Element | Definition |
| --- | --- |
| Name | TerseForge |
| Tagline | **Big code. Small chatter.** |
| Category | Local context and tool-output optimization for AI coding agents. |
| Primary audience | Developers who use coding agents on real repositories and want lower context waste without weaker verification. |
| Promise | Reduce avoidable context and visible noise while keeping diagnostics, raw output, and quality gates intact. |
| Differentiator | Local, reversible optimization backed by explicit measurements and compatibility limits. |

## Message hierarchy

1. **Primary:** reduce context and tool-output noise without lowering the code-quality bar.
2. **Trust:** full output remains locally recoverable and required quality gates fail closed.
3. **Proof:** component results are reproducible and never presented as end-to-end token savings.
4. **Privacy:** no server, model call, code upload, or remote telemetry.
5. **Compatibility:** describe the mechanism that exists; never imply transparent integration from an instruction file alone.

## Voice

TerseForge sounds like an experienced engineer: concise, calm, exact, and willing to state limitations.

| Be | Do not be |
| --- | --- |
| Direct | Abrupt or grammatically broken |
| Evidence-first | Hype-driven |
| Technically specific | Dense with unexplained jargon |
| Conservative about claims | Vague or absolute |
| Brief after the answer is clear | Brief at the expense of safety |

Prefer verbs such as **measure**, **preserve**, **recover**, **verify**, and **compare**. Avoid unsupported phrases such as **revolutionary**, **zero-cost**, **universal integration**, **guaranteed savings**, or **no quality loss**.

## Visual system

| Color | Hex | Role |
| --- | --- | --- |
| Graphite | `#0B0E11` | Primary dark background and technical depth. |
| Forge orange | `#E86A17` | Main accent, energy, active signal. |
| Ember | `#F59E0B` | Secondary highlights and cautions. |
| Steel | `#A7B0BA` | Lines, secondary copy, and structural detail. |
| Off-white | `#F8FAFC` | High-contrast text on dark surfaces. |
| Signal blue | `#2563EB` | Links and informational states. |

Use orange sparingly. Most surfaces should remain neutral so diagnostics and proof carry more weight than decoration.

Use the host platform's system sans-serif for prose and its monospace stack for commands, identifiers, paths, and measurements. Do not introduce a webfont solely for branding.

## Imagery

- Use precise, engineered forms rather than fantasy forge imagery.
- Show transformation from broad noise to narrow signal when illustrating the product.
- Prefer graphite, steel, and restrained ember-orange light.
- Keep hero artwork text-free so titles remain accessible and translatable.
- Avoid robots, humanoid assistants, glowing brains, stock screenshots, mascots, and explosive fire effects.
- Preserve the hero's 2:1 aspect ratio. The canonical repository asset is `assets/brand/terseforge-hero.jpg` at 1280×640.

## Claim rules

- Say **visible-byte reduction** for the included component benchmark, not **token savings**.
- State the fixture and the benchmark scope beside every percentage.
- Use **native-limited**, **instructions-only**, and **experimental** exactly as defined in the compatibility documentation.
- Say **designed to preserve code quality** rather than promising that quality can never regress.
- Never call an integration native merely because an agent reads a static instruction file.

## Asset handling

Keep public brand assets under `assets/brand/` with stable, descriptive names. Optimize raster assets before committing, retain useful alternative text where they are embedded, and avoid including generated text inside images.
