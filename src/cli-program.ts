import { resolve } from "node:path";
import { Argument, Command, Option } from "commander";
import { runBenchmark } from "./benchmark.js";
import { loadConfig, PRESETS, setPreset, type Preset } from "./config.js";
import { buildRepositoryMap, formatRepositoryMap, selectContext } from "./context.js";
import { runQualityGates, type GateResult } from "./gates.js";
import { selectArtifactLines } from "./output.js";
import { diagnoseProject, initializeProject } from "./project.js";
import { runProcess } from "./runner.js";
import { installSkill, inspectSkill, SKILL_AGENTS, SKILL_SCOPES, type SkillAgent, type SkillScope } from "./skill.js";
import { readArtifact, readMetrics } from "./storage.js";
import { createHandoff, summarizeMetrics } from "./workflows.js";

interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const defaultIo: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text)
};

function line(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

export function createCli(io: CliIo = defaultIo): Command {
  const program = new Command();
  program
    .name("terseforge")
    .description("Big code. Small chatter. Local optimization for AI coding-agent workflows.")
    .version("0.1.0")
    .option("--cwd <path>", "repository root", process.cwd())
    .configureOutput({ writeOut: io.stdout, writeErr: io.stderr });
  program.enablePositionalOptions();

  const root = (): string => resolve(String(program.opts().cwd));

  program
    .command("init")
    .description("create conservative local configuration and optional agent instructions")
    .addOption(new Option("--preset <preset>", "initial preset").choices([...PRESETS]).default("safe"))
    .option("--install <agents...>", "install instruction files for codex, claude, gemini, cursor, windsurf, or cline", [])
    .option("--force", "replace only the generated configuration file", false)
    .action(async (options: { preset: "safe" | "lean" | "ultra"; install: string[]; force: boolean }) => {
      const result = await initializeProject(root(), options);
      io.stdout(line(`Created: ${result.created.join(", ") || "nothing"}`));
      if (result.skipped.length > 0) io.stdout(line(`Preserved existing: ${result.skipped.join(", ")}`));
    });

  program
    .command("mode")
    .description("change the project preset without resetting other configuration")
    .addArgument(new Argument("<preset>", "safe, lean, or ultra").choices([...PRESETS]))
    .action(async (preset: Preset) => {
      const config = await setPreset(root(), preset);
      io.stdout(line(`Preset: ${config.preset}`));
    });

  const skill = program.command("skill").description("install or inspect the natural-language Agent Skill");
  skill
    .command("install")
    .description("install the TerseForge skill for one agent")
    .addOption(new Option("--agent <agent>", "target agent").choices([...SKILL_AGENTS]).makeOptionMandatory())
    .addOption(new Option("--scope <scope>", "user or project installation").choices([...SKILL_SCOPES]).default("user"))
    .option("--force", "update an existing TerseForge skill; never replace a foreign skill", false)
    .action(async (options: { agent: SkillAgent; scope: SkillScope; force: boolean }) => {
      const result = await installSkill(root(), {
        ...options,
        ...(process.env.CODEX_HOME ? { codexRoot: process.env.CODEX_HOME } : {})
      });
      io.stdout(line(`Skill ${result.status}: ${result.destination}`));
      io.stdout(line(result.reloadHint));
    });
  skill
    .command("status")
    .description("inspect native skill discovery locations")
    .addOption(new Option("--agent <agent>", "target agent; omit to inspect all").choices([...SKILL_AGENTS]))
    .addOption(new Option("--scope <scope>", "user or project installation").choices([...SKILL_SCOPES]).default("user"))
    .action(async (options: { agent?: SkillAgent; scope: SkillScope }) => {
      const agents = options.agent ? [options.agent] : [...SKILL_AGENTS];
      for (const agent of agents) {
        const result = await inspectSkill(root(), {
          agent,
          scope: options.scope,
          ...(process.env.CODEX_HOME ? { codexRoot: process.env.CODEX_HOME } : {})
        });
        io.stdout(line(`${agent} ${options.scope}: ${result.status} (${result.destination})`));
      }
    });

  program
    .command("doctor")
    .description("check runtime, configuration, and honest integration levels")
    .action(async () => {
      const report = await diagnoseProject(root());
      for (const check of report.checks) io.stdout(line(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.detail}`));
      for (const integration of report.integrations) {
        io.stdout(line(`${integration.installed ? "ON" : "OFF"} ${integration.name} [${integration.level}]: ${integration.detail}`));
      }
      if (!report.ok) process.exitCode = 1;
    });

  program
    .command("exec")
    .description("run a command without a shell, store raw output, and print a compact view")
    .argument("<command>", "executable")
    .argument("[args...]", "arguments")
    .allowUnknownOption(true)
    .passThroughOptions()
    .action(async (command: string, args: string[]) => {
      const config = await loadConfig(root());
      const result = await runProcess({ root: root(), command, args, preset: config.preset, kind: "exec" });
      io.stdout(line(result.visibleOutput));
      if (result.exitCode !== 0) process.exitCode = result.exitCode;
    });

  program
    .command("output")
    .description("recover exact raw output from a prior run")
    .argument("<run-id>", "run identifier")
    .option("--lines <start:end>", "1-based inclusive line range")
    .action(async (id: string, options: { lines?: string }) => {
      const raw = await readArtifact(root(), id);
      io.stdout(line(selectArtifactLines(raw, options.lines)));
    });

  program
    .command("map")
    .description("print a compact TS/JS repository map")
    .option("--json", "emit JSON", false)
    .action(async (options: { json: boolean }) => {
      const config = await loadConfig(root());
      const map = await buildRepositoryMap(root(), config.context.maxFileBytes);
      io.stdout(line(options.json ? JSON.stringify(map, null, 2) : formatRepositoryMap(map)));
    });

  program
    .command("context")
    .description("select bounded, numbered TS/JS snippets for a query or symbol")
    .argument("[query...]", "context query", [])
    .option("--symbol <name>", "prioritize an exact symbol")
    .option("--budget <tokens>", "token estimate budget", (value) => Number(value))
    .action(async (query: string[], options: { symbol?: string; budget?: number }) => {
      const config = await loadConfig(root());
      const result = await selectContext(root(), {
        query: query.join(" "),
        ...(options.symbol ? { symbol: options.symbol } : {}),
        budgetTokens: options.budget ?? config.context.budgetTokens,
        maxFileBytes: config.context.maxFileBytes
      });
      io.stdout(line(result.text || "No relevant TS/JS context found."));
      io.stdout(line(`Estimated context tokens: ${result.estimatedTokens}`));
    });

  program
    .command("check")
    .description("run configured quality gates; required failures block success")
    .action(async () => {
      const config = await loadConfig(root());
      const result = await runQualityGates(root(), config);
      for (const gate of result.results) {
        io.stdout(line(`## ${gate.name} (${gate.exitCode === 0 ? "passed" : `failed: ${gate.exitCode}`})`));
        io.stdout(line(gate.output));
      }
      if (!result.ok) process.exitCode = 1;
    });

  program
    .command("handoff")
    .description("write a compact deterministic session handoff")
    .argument("[objective...]", "current objective", [])
    .action(async (objective: string[]) => {
      const metrics = await readMetrics(root());
      const gates: GateResult[] = metrics
        .filter((metric) => metric.kind === "gate")
        .slice(-20)
        .map((metric) => ({ name: metric.command, required: true, exitCode: metric.exitCode, output: "", runId: metric.id }));
      const target = await createHandoff(root(), objective.join(" "), gates);
      io.stdout(line(`Handoff written: ${target}`));
    });

  program
    .command("stats")
    .description("summarize local execution metrics")
    .option("--json", "emit JSON", false)
    .action(async (options: { json: boolean }) => {
      const summary = summarizeMetrics(await readMetrics(root()));
      io.stdout(
        line(
          options.json
            ? JSON.stringify(summary, null, 2)
            : `Runs: ${summary.runs}\nFailures: ${summary.failedRuns}\nRaw bytes: ${summary.rawBytes}\nVisible bytes: ${summary.visibleBytes}\nSaved bytes: ${summary.savedBytes} (${summary.reductionPercent}%)\nDuration: ${summary.durationMs} ms`
        )
      );
    });

  program
    .command("bench")
    .description("run the deterministic tool-output-pruning benchmark")
    .option("--json", "emit JSON", false)
    .action(async (options: { json: boolean }) => {
      const result = await runBenchmark(root());
      const text = options.json
        ? JSON.stringify(result, null, 2)
        : [
            `Scope: ${result.scope}`,
            ...result.conditions.map(
              (condition) =>
                `${condition.preset}: ${condition.reductionPercent}% visible-byte reduction; diagnostics ${condition.diagnosticsRetained ? "retained" : "LOST"}; raw ${condition.rawRecoverable ? "recoverable" : "missing"}`
            ),
            result.note
          ].join("\n");
      io.stdout(line(text));
      if (result.conditions.some((condition) => !condition.diagnosticsRetained || !condition.rawRecoverable)) process.exitCode = 1;
    });

  return program;
}
