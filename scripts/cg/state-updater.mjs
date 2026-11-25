import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureFreshGraph } from './coherence-guardian.mjs';
import { buildContextCapsule } from './context-engine.mjs';

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readRangeSlice(rootDir, relPath, range) {
  if (!relPath || !Array.isArray(range) || range.length < 2) return '';
  try {
    const lines = (await readFile(path.join(rootDir, relPath), 'utf8')).split('\n');
    const s = Math.max(1, range[0]);
    const e = Math.min(lines.length, range[1]);
    return lines
      .slice(s - 1, e)
      .map((l, idx) => `${s + idx}: ${l}`)
      .join('\n');
  } catch {
    return '';
  }
}

function getModifiedGitFiles(rootDir) {
  try {
    const out = execFileSync('git', ['diff', '--name-only', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, '/'))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function readNextMissionStep(rootDir, { missionId }) {
  const shardedDir = path.join(rootDir, '.cg', 'missions', missionId);
  const manifest = await readJson(path.join(shardedDir, 'manifest.json'), null);
  if (manifest && Array.isArray(manifest.waveOrder)) {
    const { indexObj, treeObj } = await ensureFreshGraph(rootDir);
    for (const waveId of manifest.waveOrder) {
      const waveDef = await readJson(path.join(shardedDir, 'waves', `${waveId}.json`), { clusterIds: [] });
      for (const cid of waveDef.clusterIds || []) {
        const cl = await readJson(path.join(shardedDir, 'clusters', `${cid}.json`), null);
        if (!cl || cl.status === 'done' || cl.status === 'quarantined') continue;

        // Line Drift safety: recompute fresh region bounds if file changed during this Wave
        const targetFile = cl.allowedEditSet?.[0] || '';
        const freshScreen = targetFile ? treeObj.screens?.[targetFile] : null;
        if (freshScreen?.visualProfile) {
          if (cl.kind === 'GEN-UI-HEADER' && freshScreen.visualProfile.headerRange) {
            cl.range = freshScreen.visualProfile.headerRange;
          }
        }
        const excerpt = cl.range && targetFile ? await readRangeSlice(rootDir, targetFile, cl.range) : '';
        const designRef = await readJson(path.join(rootDir, '.cg', 'taxonomy', 'ui-design-reference.json'), null);
        return {
          ok: true,
          sharded: true,
          missionId,
          status: manifest.status,
          wave: waveId,
          counts: manifest.counts,
          cluster: cl,
          targetLinesCount: indexObj.files?.[targetFile]?.lines || null,
          excerpt,
          designTokens: cl.macroIntent === 'VISUAL' ? designRef?.tokens || null : null,
          nextCommandOnFinish: `node scripts/agent-ops.mjs update-state --mission ${missionId} --cluster ${cid} --status done`,
        };
      }
    }
    return { ok: true, sharded: true, missionId, status: 'completed', cluster: null, counts: manifest.counts };
  }

  const missionPath = path.join(rootDir, '.cg', 'missions', `${missionId}.json`);
  const mission = await readJson(missionPath, null);
  if (!mission) {
    return { ok: false, error: `Missão "${missionId}" não encontrada.` };
  }

  for (let c = 0; c < mission.clusters.length; c += 1) {
    const cl = mission.clusters[c];
    for (let s = 0; s < cl.steps.length; s += 1) {
      const st = cl.steps[s];
      if (st.status === 'pending' || st.status === 'in_progress') {
        const capsule = await buildContextCapsule(rootDir, {
          domain: cl.cell,
          incidentId: mission.incidentId || '',
          anchor: cl.allowedEditSet[0] || '',
          tokenBudget: 3500,
        });
        return {
          ok: true,
          missionId,
          status: mission.status,
          clusterId: cl.clusterId,
          step: st,
          allowedEditSet: cl.allowedEditSet,
          capsule,
          nextCommandOnFinish: `node scripts/agent-ops.mjs update-state --mission ${missionId} --step ${st.id} --status done`,
        };
      }
    }
  }

  return { ok: true, missionId, status: 'completed', step: null };
}

export async function updateMissionState(
  rootDir,
  { missionId, stepId = '', clusterId = '', status = 'done', outputJson = '', expandFile = '', failurePattern = '' } = {},
) {
  const shardedDir = path.join(rootDir, '.cg', 'missions', missionId);
  const manifestPath = path.join(shardedDir, 'manifest.json');
  const manifest = await readJson(manifestPath, null);
  if (manifest && Array.isArray(manifest.waveOrder)) {
    const targetClusterId = clusterId || stepId || manifest.cursorClusterId;
    const clPath = path.join(shardedDir, 'clusters', `${targetClusterId}.json`);
    const cl = await readJson(clPath, null);
    if (!cl) return { ok: false, error: `Micro-cluster "${targetClusterId}" não encontrado na missão "${missionId}".` };

    if (status === 'failed') {
      cl.retries = Number(cl.retries || 0) + 1;
      cl.status = cl.retries >= 2 ? 'quarantined' : 'pending';
      cl.lastError = failurePattern || 'verification_failed';
    } else {
      cl.status = status;
    }
    cl.updatedAt = new Date().toISOString();
    if (outputJson) {
      try {
        cl.output = JSON.parse(outputJson);
      } catch {
        cl.output = { raw: String(outputJson) };
      }
    }
    await writeFile(clPath, JSON.stringify(cl, null, 2));

    let pending = 0;
    let done = 0;
    let quarantined = 0;
    let nextWave = null;
    let nextCid = null;
    for (const wId of manifest.waveOrder) {
      const wDef = await readJson(path.join(shardedDir, 'waves', `${wId}.json`), { clusterIds: [] });
      for (const cid of wDef.clusterIds || []) {
        const item = cid === targetClusterId ? cl : await readJson(path.join(shardedDir, 'clusters', `${cid}.json`), null);
        if (!item) continue;
        if (item.status === 'done') done += 1;
        else if (item.status === 'quarantined') quarantined += 1;
        else {
          pending += 1;
          if (!nextCid) {
            nextWave = wId;
            nextCid = cid;
          }
        }
      }
    }
    manifest.counts = { pending, done, quarantined };
    manifest.activeWave = nextWave;
    manifest.cursorClusterId = nextCid;
    manifest.status = pending === 0 ? 'completed' : 'in_progress';
    manifest.updatedAt = new Date().toISOString();
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const ledgerDir = path.join(rootDir, '.cg', 'ledger');
    await mkdir(ledgerDir, { recursive: true });
    await appendFile(
      path.join(ledgerDir, 'events.jsonl'),
      `${JSON.stringify({
        ts: manifest.updatedAt,
        missionId,
        clusterId: targetClusterId,
        wave: cl.wave,
        kind: cl.kind,
        status: cl.status,
        retries: cl.retries,
        filesTouched: cl.allowedEditSet || [],
        ...(failurePattern ? { failurePattern } : {}),
      })}\n`,
    );

    return {
      ok: true,
      sharded: true,
      missionId,
      cluster: { id: cl.clusterId, status: cl.status, retries: cl.retries },
      counts: manifest.counts,
      nextCursorClusterId: manifest.cursorClusterId,
      activeWave: manifest.activeWave,
      missionStatus: manifest.status,
    };
  }

  const missionPath = path.join(rootDir, '.cg', 'missions', `${missionId}.json`);
  const mission = await readJson(missionPath, null);
  if (!mission) {
    return { ok: false, error: `Missão "${missionId}" não encontrada.` };
  }

  let parsedOutput = {};
  if (outputJson) {
    try {
      parsedOutput = JSON.parse(outputJson);
    } catch {
      parsedOutput = { raw: String(outputJson) };
    }
  }

  let updatedStep = null;
  let activeCluster = null;
  for (const cl of mission.clusters) {
    for (const st of cl.steps) {
      if (st.id === stepId) {
        st.status = status;
        st.updatedAt = new Date().toISOString();
        if (Object.keys(parsedOutput).length > 0) st.output = parsedOutput;
        updatedStep = st;
        activeCluster = cl;
      }
    }
  }

  if (!updatedStep) {
    return { ok: false, error: `Passo "${stepId}" não encontrado na missão "${missionId}".` };
  }

  if (expandFile && activeCluster && !activeCluster.allowedEditSet.includes(expandFile)) {
    activeCluster.allowedEditSet.push(expandFile);
    mission.expansions.push({
      stepId,
      addedFile: expandFile,
      at: new Date().toISOString(),
    });
  }

  const allDone = mission.clusters.every((cl) => cl.steps.every((st) => st.status === 'done'));
  mission.status = allDone ? 'completed' : 'in_progress';
  mission.updatedAt = new Date().toISOString();

  // Advance cursor to next pending step
  let nextPending = null;
  for (let c = 0; c < mission.clusters.length && !nextPending; c += 1) {
    const cl = mission.clusters[c];
    for (let s = 0; s < cl.steps.length; s += 1) {
      if (cl.steps[s].status !== 'done') {
        nextPending = { clusterIdx: c, stepIdx: s, stepId: cl.steps[s].id };
        break;
      }
    }
  }
  mission.cursor = nextPending || { clusterIdx: -1, stepIdx: -1, stepId: null };
  await writeFile(missionPath, JSON.stringify(mission, null, 2));

  // Append to .cg/ledger/events.jsonl
  const ledgerDir = path.join(rootDir, '.cg', 'ledger');
  await mkdir(ledgerDir, { recursive: true });
  const modified = getModifiedGitFiles(rootDir);
  const outOfScope = activeCluster
    ? modified.filter(
        (f) =>
          !activeCluster.allowedEditSet.includes(f) &&
          !f.startsWith('.cg/') &&
          !f.startsWith('tests/'),
      )
    : [];

  const ledgerEntry = {
    ts: new Date().toISOString(),
    missionId,
    stepId,
    op: updatedStep.op,
    status,
    rawPrompt: mission.rawPrompt.slice(0, 140),
    cell: activeCluster?.cell || 'core',
    filesTouched: activeCluster?.allowedEditSet || [],
    outOfScopeCount: outOfScope.length,
    ...(expandFile ? { parserMissExpanded: expandFile } : {}),
    ...(failurePattern ? { failurePattern } : {}),
  };
  await appendFile(path.join(ledgerDir, 'events.jsonl'), `${JSON.stringify(ledgerEntry)}\n`);

  return {
    ok: true,
    missionId,
    updatedStep: { id: updatedStep.id, op: updatedStep.op, status: updatedStep.status },
    missionStatus: mission.status,
    nextCursor: mission.cursor,
    outOfScopeFiles: outOfScope,
  };
}

export async function evolveFromLedger(rootDir) {
  const lexiconPath = path.join(rootDir, '.cg', 'taxonomy', 'parser-lexicon.json');
  const lexicon = await readJson(lexiconPath, { version: '1.0.0', phrases: {}, expansions: [] });
  let raw = '';
  try {
    raw = await readFile(path.join(rootDir, '.cg', 'ledger', 'events.jsonl'), 'utf8');
  } catch {
    return { ok: true, promotedCount: 0, note: 'Sem eventos no ledger ainda.' };
  }

  let promotedCount = 0;
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    try {
      const ev = JSON.parse(line);
      if (ev.parserMissExpanded && ev.rawPrompt) {
        const words = ev.rawPrompt
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length >= 4);
        const keyPhrase = words.slice(0, 2).join(' ');
        if (keyPhrase && lexicon.phrases[keyPhrase]) {
          if (!lexicon.phrases[keyPhrase].files.includes(ev.parserMissExpanded)) {
            lexicon.phrases[keyPhrase].files.push(ev.parserMissExpanded);
            lexicon.phrases[keyPhrase].weight = Math.min(0.99, Number((lexicon.phrases[keyPhrase].weight + 0.02).toFixed(2)));
            promotedCount += 1;
          }
        }
        lexicon.expansions.push({ at: ev.ts, prompt: ev.rawPrompt, file: ev.parserMissExpanded });
      }
    } catch {
      // Ignore malformed ledger line
    }
  }

  lexicon.expansions = (lexicon.expansions || []).slice(-50);
  await writeFile(lexiconPath, JSON.stringify(lexicon, null, 2));
  return { ok: true, promotedCount, totalLexiconPhrases: Object.keys(lexicon.phrases).length };
}
