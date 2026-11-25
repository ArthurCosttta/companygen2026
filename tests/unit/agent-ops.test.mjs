import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT_DIR = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

function runAgentOps(args) {
  const out = execFileSync('node', ['scripts/agent-ops.mjs', ...args], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

test('agent-ops indexes repository incrementally and passes coherence lint on invariants', () => {
  const idx = runAgentOps(['index']);
  assert.equal(idx.ok, true);
  assert.ok(idx.fileCount >= 100);
  assert.ok(idx.edgeCount >= 100);

  // Second call without edits must reuse cached hashes cleanly
  const idx2 = runAgentOps(['index']);
  assert.equal(idx2.reindexedCount, 0);
  assert.equal(idx2.reusedCount, idx.fileCount);

  const lint = runAgentOps(['lint']);
  assert.equal(lint.ok, true, `Lint errors: ${JSON.stringify(lint.findings.filter((f) => f.severity === 'error'))}`);
});

test('agent-ops triage & impact deliver compact ContextCapsule with real state and invariants', () => {
  const cap = runAgentOps(['triage', '--domain', 'whatsapp', '--anchor', 'server/ai-sofia-local.mjs#loadCustomQuickReplies']);
  assert.equal(cap.domain, 'whatsapp');
  assert.ok(cap.allowedEditSet.includes('server/ai-sofia-local.mjs'));
  assert.ok(cap.relevantStates['disk:whatsapp_flows.json']);
  assert.ok(cap.relevantStates['disk:whatsapp_flows.json'].readers.includes('server/ai-sofia-local.mjs'));
  assert.ok(cap.relevantStates['disk:whatsapp_flows.json'].writers.includes('server/ai-sofia-local.mjs'));
  assert.ok(cap.invariantsAtRisk.some((i) => i.id === 'INV-WPP-TRIGGER-READS-FLOWS'));

  const imp = runAgentOps(['impact', '--target', 'server/ai-sofia-local.mjs#loadCustomQuickReplies']);
  assert.equal(imp.ok, true);
  assert.ok(imp.symbolInfo && Array.isArray(imp.symbolInfo.range));
  assert.ok(imp.relatedTests.includes('tests/unit/onda6-whatsapp-pix.test.mjs'));
});

test('agent-ops decompose crystallizes multi-goal prompt into clusters and ATUALIZE-JSON advances cursor', async () => {
  const mission = runAgentOps([
    'decompose',
    '--prompt',
    'wpp gatilho nao dispara no meu numero + loja voltou pro onboarding',
  ]);
  assert.ok(mission.missionId.startsWith('M-'));
  assert.equal(mission.totalGoals, 2);
  assert.ok(mission.clusters.some((c) => c.cell === 'whatsapp'));
  assert.ok(mission.clusters.some((c) => c.cell === 'onboarding'));

  const missionFile = path.join(ROOT_DIR, '.cg', 'missions', `${mission.missionId}.json`);
  assert.equal(existsSync(missionFile), true);

  try {
    const first = runAgentOps(['next', '--mission', mission.missionId]);
    assert.equal(first.ok, true);
    assert.equal(first.step.id, 'S1');

    const upd = runAgentOps([
      'update-state',
      '--mission',
      mission.missionId,
      '--step',
      'S1',
      '--status',
      'done',
      '--output',
      JSON.stringify({ capsuleId: first.capsule.capsuleId }),
    ]);
    assert.equal(upd.ok, true);
    assert.equal(upd.nextCursor.stepId, 'S2');
  } finally {
    await rm(missionFile, { force: true });
  }
});

test('Cluster Factory shards ambitious mission into 100+ micro-clusters with FileMutex, testId Diff Guard and Circuit Breaker', async () => {
  const manifest = runAgentOps([
    'decompose',
    '--sharded',
    '--prompt',
    'otimizar performance pc fraco + aplicar visual minimalista minha loja em todas as telas preservando botoes em gavetas + atualizar .cg jsons + validar no navegador',
  ]);
  assert.equal(manifest.version, '2.0.0-sharded');
  assert.ok(manifest.totalClusters >= 100, `Expected >= 100 micro-clusters, got ${manifest.totalClusters}`);
  assert.equal(manifest.fileMutexEnabled, true);

  const missionDir = path.join(ROOT_DIR, '.cg', 'missions', manifest.missionId);
  assert.equal(existsSync(path.join(missionDir, 'manifest.json')), true);
  assert.equal(existsSync(path.join(missionDir, 'clusters', 'C-001.json')), true);

  try {
    const nextItem = runAgentOps(['next', '--mission', manifest.missionId]);
    assert.equal(nextItem.ok, true);
    assert.equal(nextItem.sharded, true);
    assert.equal(nextItem.cluster.clusterId, 'C-001');

    // Circuit Breaker: 2 failures on C-001 must quarantine C-001 and advance cursor to C-002
    const f1 = runAgentOps([
      'update-state',
      '--mission',
      manifest.missionId,
      '--cluster',
      'C-001',
      '--status',
      'failed',
      '--failure',
      'transient_error_1',
    ]);
    assert.equal(f1.cluster.status, 'pending');
    const f2 = runAgentOps([
      'update-state',
      '--mission',
      manifest.missionId,
      '--cluster',
      'C-001',
      '--status',
      'failed',
      '--failure',
      'transient_error_2',
    ]);
    assert.equal(f2.cluster.status, 'quarantined');
    assert.equal(f2.counts.quarantined, 1);
    assert.equal(f2.nextCursorClusterId, 'C-002');

    // testId Diff Guard passes when existing testIds exist
    const okGuard = runAgentOps([
      'guard-testids',
      '--file',
      'src/components/views/whatsapp/WhatsAppConnectionView.tsx',
      '--expected',
      'wpp-ai-connection-pill,wpp-sound-mute-toggle',
    ]);
    assert.equal(okGuard.ok, true);

    // verify-micro executes fast isolated check cleanly
    const micro = runAgentOps(['verify-micro', '--file', 'server/crash-telemetry.mjs']);
    assert.equal(micro.ok, true);
    assert.equal(micro.mode, 'VERIFY_MICRO');
  } finally {
    await rm(missionDir, { recursive: true, force: true });
  }
});
