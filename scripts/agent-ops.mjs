#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOrRefreshGraph } from './cg/ast-compiler.mjs';
import { buildShardedMicroMission } from './cg/cluster-factory.mjs';
import { guardTestIds, runCoherenceLint } from './cg/coherence-guardian.mjs';
import { buildContextCapsule, computeImpact } from './cg/context-engine.mjs';
import { parseGoalToMission } from './cg/intent-parser.mjs';
import { evolveFromLedger, readNextMissionStep, updateMissionState } from './cg/state-updater.mjs';

const __DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__DIR, '..');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const k = tok.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[k] = next;
        i += 1;
      } else {
        args[k] = true;
      }
    } else {
      args._.push(tok);
    }
  }
  return args;
}

function runShellCheck(label, cmd, cmdArgs) {
  const executable = process.platform === 'win32' && cmd === 'npx' ? 'npx.cmd' : cmd;
  try {
    const out = execFileSync(executable, cmdArgs, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      shell: executable.endsWith('.cmd'),
    });
    return { label, ok: true, summary: out.trim().split(/\r?\n/).slice(-5).join(' | ') };
  } catch (err) {
    return {
      label,
      ok: false,
      error: String(err?.stderr || err?.stdout || err?.message || 'failed').slice(0, 600),
    };
  }
}

async function runVerifyGate(target) {
  const { indexObj } = await buildOrRefreshGraph(ROOT_DIR, { force: false });
  const lint = await runCoherenceLint(ROOT_DIR, { refresh: false });

  const checks = [];
  checks.push(runShellCheck('verify-handlers', 'node', ['scripts/verify-handlers.mjs']));
  checks.push(runShellCheck('tsc', 'npx', ['tsc', '-b', '--noEmit']));

  if (target) {
    const cleanFile = target.split('#')[0].replace(/\\/g, '/');
    const meta = indexObj.files?.[cleanFile];
    const invRaw = await readFile(path.join(ROOT_DIR, '.cg', 'invariants', 'registry.json'), 'utf8').catch(() => '{"invariants":[]}');
    const invs = JSON.parse(invRaw).invariants || [];
    const tests = Array.from(
      new Set([
        ...invs.filter((inv) => (inv.anchors || []).some((a) => a.startsWith(cleanFile))).map((inv) => inv.test),
        ...Object.entries(indexObj.files || {})
          .filter(([f, m]) => f.startsWith('tests/unit/') && meta && m.cell === meta.cell)
          .map(([f]) => f),
      ]),
    ).filter(Boolean);

    if (tests.length > 0) {
      checks.push(runShellCheck('targeted-tests', 'node', ['--test', ...tests]));
    }
  }

  const allOk = lint.ok && checks.every((c) => c.ok);
  return {
    ok: allOk,
    lintSummary: lint.summary,
    lintErrors: lint.findings.filter((f) => f.severity === 'error'),
    checks,
  };
}

async function runVerifyMicro(targetFile, expectedTestIds = []) {
  const cleanFile = String(targetFile || '').split('#')[0].replace(/\\/g, '/');
  const { indexObj } = await buildOrRefreshGraph(ROOT_DIR, { force: false });
  const checks = [];
  if (cleanFile.endsWith('.mjs') || cleanFile.endsWith('.js')) {
    checks.push(runShellCheck('syntax-check', 'node', ['--check', cleanFile]));
  }
  let testIdGuard = { ok: true, skipped: true };
  if (cleanFile.endsWith('.tsx') && expectedTestIds.length > 0) {
    testIdGuard = await guardTestIds(ROOT_DIR, { targetFile: cleanFile, expectedTestIds });
  }
  const meta = indexObj.files?.[cleanFile];
  const targetedTests = Object.entries(indexObj.files || {})
    .filter(([f, m]) => f.startsWith('tests/unit/') && meta && m.cell === meta.cell)
    .map(([f]) => f)
    .slice(0, 2);
  if (targetedTests.length > 0) {
    checks.push(runShellCheck('micro-unit-test', 'node', ['--test', ...targetedTests]));
  }
  return {
    ok: testIdGuard.ok && checks.every((c) => c.ok),
    mode: 'VERIFY_MICRO',
    file: cleanFile,
    reindexedCount: indexObj.reindexedCount,
    testIdGuard,
    checks,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || 'help';

  let out;
  switch (cmd) {
    case 'index': {
      const { indexObj, depObj, stateObj, treeObj } = await buildOrRefreshGraph(ROOT_DIR, {
        force: Boolean(args.force),
      });
      out = {
        ok: true,
        headCommit: indexObj.headCommit,
        fileCount: indexObj.fileCount,
        reindexedCount: indexObj.reindexedCount,
        reusedCount: indexObj.reusedCount,
        edgeCount: depObj.edgeCount,
        stateCount: stateObj.stateCount,
        screenCount: treeObj.screenCount,
      };
      break;
    }
    case 'lint': {
      out = await runCoherenceLint(ROOT_DIR, { refresh: !args['no-refresh'] });
      break;
    }
    case 'decompose': {
      if (args.sharded) {
        out = await buildShardedMicroMission(ROOT_DIR, {
          prompt: String(args.prompt || ''),
        });
      } else {
        out = await parseGoalToMission(ROOT_DIR, {
          prompt: String(args.prompt || ''),
          incidentId: String(args.incident || ''),
        });
      }
      break;
    }
    case 'next': {
      out = await readNextMissionStep(ROOT_DIR, { missionId: String(args.mission || '') });
      break;
    }
    case 'triage': {
      out = await buildContextCapsule(ROOT_DIR, {
        domain: String(args.domain || ''),
        incidentId: String(args.incident || ''),
        anchor: String(args.anchor || ''),
        tokenBudget: Number(args.budget || 6000),
      });
      break;
    }
    case 'impact': {
      out = await computeImpact(ROOT_DIR, { target: String(args.target || '') });
      break;
    }
    case 'guard-testids': {
      const expected = String(args.expected || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const allowRemoved = String(args.allow || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      out = await guardTestIds(ROOT_DIR, {
        targetFile: String(args.file || ''),
        expectedTestIds: expected,
        allowRemoved,
      });
      break;
    }
    case 'verify-micro': {
      const expected = String(args['expected-testids'] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      out = await runVerifyMicro(String(args.file || args.target || ''), expected);
      break;
    }
    case 'update-state': {
      out = await updateMissionState(ROOT_DIR, {
        missionId: String(args.mission || ''),
        stepId: String(args.step || ''),
        clusterId: String(args.cluster || ''),
        status: String(args.status || 'done'),
        outputJson: String(args.output || ''),
        expandFile: String(args.expand || ''),
        failurePattern: String(args.failure || ''),
      });
      break;
    }
    case 'verify': {
      out = await runVerifyGate(String(args.target || ''));
      break;
    }
    case 'evolve': {
      out = await evolveFromLedger(ROOT_DIR);
      break;
    }
    default:
      out = {
        ok: false,
        commands: ['index', 'lint', 'decompose', 'next', 'triage', 'impact', 'guard-testids', 'verify-micro', 'update-state', 'verify', 'evolve'],
      };
  }

  console.log(JSON.stringify(out, null, 2));
  if (out && out.ok === false) process.exitCode = 1;
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
