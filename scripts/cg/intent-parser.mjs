import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureFreshGraph } from './coherence-guardian.mjs';

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function splitIntoClauses(prompt) {
  const raw = String(prompt || '').trim();
  if (!raw) return [];
  const parts = raw
    .split(/(?:\r?\n+|---+|\s+\+\s+|\s*;\s*|\b\d+[.)]\s+)/g)
    .map((p) => p.replace(/^[-*•]\s*/, '').trim())
    .filter((p) => p.length >= 3);
  return parts.length > 0 ? parts : [raw];
}

export async function parseGoalToMission(rootDir, { prompt = '', incidentId = '' } = {}) {
  const { indexObj, stateObj } = await ensureFreshGraph(rootDir);
  const macroReg = await readJson(path.join(rootDir, '.cg', 'taxonomy', 'macro-intents.json'), { macroIntents: {}, executionPriorityOrder: [] });
  const lexicon = await readJson(path.join(rootDir, '.cg', 'taxonomy', 'parser-lexicon.json'), { phrases: {} });
  const policies = await readJson(path.join(rootDir, '.cg', 'taxonomy', 'policies.json'), { policies: {} });
  const incident = incidentId
    ? await readJson(path.join(rootDir, '.cg', 'incidents', `${incidentId}.json`), null)
    : null;

  const effectivePrompt = prompt || incident?.summary || incident?.message || `Corrigir incidente ${incidentId}`;
  const clauses = splitIntoClauses(effectivePrompt);

  const parsedGoals = clauses.map((clauseText, idx) => {
    const clean = norm(clauseText);
    const intents = new Set();
    const candidateFiles = new Set();
    const candidateCells = new Set();

    // 1. Lexicon phrase match (domain-specific learned anchors)
    for (const [phrase, entry] of Object.entries(lexicon.phrases || {})) {
      if (clean.includes(norm(phrase))) {
        (entry.intents || []).forEach((i) => intents.add(i));
        if (entry.cell) candidateCells.add(entry.cell);
        (entry.files || []).forEach((f) => candidateFiles.add(f));
      }
    }

    // 2. Macro-intent keyword match
    for (const [intentKey, def] of Object.entries(macroReg.macroIntents || {})) {
      if ((def.keywords || []).some((kw) => clean.includes(norm(kw)))) {
        intents.add(intentKey);
      }
    }

    // 3. Direct file mentions
    for (const relFile of Object.keys(indexObj.files || {})) {
      const base = path.posix.basename(relFile).toLowerCase();
      if (clean.includes(relFile.toLowerCase()) || clean.includes(base)) {
        candidateFiles.add(relFile);
        candidateCells.add(indexObj.files[relFile].cell);
      }
    }

    // 4. Incident suspected files
    if (incident && Array.isArray(incident.suspectedFiles)) {
      for (const sf of incident.suspectedFiles) {
        if (indexObj.files?.[sf]) {
          candidateFiles.add(sf);
          candidateCells.add(indexObj.files[sf].cell);
        }
      }
      intents.add('BEHAVIOR');
    }

    if (intents.size === 0) intents.add('BEHAVIOR');

    // Auto-coupling rules
    const filesArr = Array.from(candidateFiles);
    if (filesArr.some((f) => indexObj.files?.[f]?.overBudget) && intents.size > 0) {
      // Only add STRUCTURE note, not forced full refactor unless requested
    }
    if (clauses.length >= 4) intents.add('DELIVERY');

    const sortedIntents = Array.from(intents).sort((a, b) => {
      const order = macroReg.executionPriorityOrder || [];
      return (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b));
    });

    const cell = Array.from(candidateCells)[0] || 'core';
    return {
      goalId: `G${idx + 1}`,
      text: clauseText,
      macroIntents: sortedIntents,
      cell,
      files: filesArr,
    };
  });

  // Group into Clusters by cell
  const byCell = new Map();
  for (const g of parsedGoals) {
    const key = g.cell || 'core';
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key).push(g);
  }

  const clusters = [];
  let stepCounter = 1;
  const allActivatedPolicies = new Set();

  for (const [cell, goals] of byCell.entries()) {
    const mergedIntents = Array.from(new Set(goals.flatMap((g) => g.macroIntents)));
    mergedIntents.forEach((i) => allActivatedPolicies.add(i));

    const allowedEditSet = Array.from(
      new Set(
        goals.flatMap((g) => g.files).length > 0
          ? goals.flatMap((g) => g.files)
          : Object.entries(indexObj.files || {})
              .filter(([, meta]) => meta.cell === cell && !meta.overBudget)
              .slice(0, 6)
              .map(([f]) => f),
      ),
    );

    const needsNav = mergedIntents.some((i) => macroReg.macroIntents?.[i]?.requiresNavigator);
    const steps = [
      {
        id: `S${stepCounter++}`,
        op: 'CONTEXT_TRIAGE',
        command: `node scripts/agent-ops.mjs triage --domain ${cell}${incidentId ? ` --incident ${incidentId}` : ''}`,
        status: 'pending',
      },
      {
        id: `S${stepCounter++}`,
        op: 'IMPACT_CHECK',
        command: allowedEditSet[0]
          ? `node scripts/agent-ops.mjs impact --target ${allowedEditSet[0]}`
          : `node scripts/agent-ops.mjs triage --domain ${cell}`,
        status: 'pending',
      },
      {
        id: `S${stepCounter++}`,
        op: 'CODE_EDIT',
        goals: goals.map((g) => `${g.goalId}: ${g.text}`),
        allowedFiles: allowedEditSet,
        status: 'pending',
      },
      {
        id: `S${stepCounter++}`,
        op: 'VERIFY_GATE',
        command: `node scripts/agent-ops.mjs verify${allowedEditSet[0] ? ` --target ${allowedEditSet[0]}` : ''}`,
        status: 'pending',
      },
      ...(needsNav
        ? [
            {
              id: `S${stepCounter++}`,
              op: 'OPEN_NAVIGATOR',
              targetUrl: 'http://127.0.0.1:5179/?theme=light',
              status: 'pending',
            },
          ]
        : []),
      {
        id: `S${stepCounter++}`,
        op: 'ATUALIZE_JSON',
        command: `node scripts/agent-ops.mjs update-state --mission __MISSION_ID__ --step __LAST__ --status done`,
        status: 'pending',
      },
    ];

    clusters.push({
      clusterId: `CL-${cell.toUpperCase()}`,
      cell,
      mode: clusters.length === 0 ? 'primary' : 'parallel_disjoint_files',
      goals,
      macroIntents: mergedIntents,
      allowedEditSet,
      steps,
    });
  }

  const missionId = `M-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${createHash('sha1').update(effectivePrompt + Date.now()).digest('hex').slice(0, 6)}`;
  for (const cl of clusters) {
    const last = cl.steps[cl.steps.length - 1];
    last.command = `node scripts/agent-ops.mjs update-state --mission ${missionId} --step ${last.id} --status done`;
  }

  const activePolicies = {};
  for (const intent of allActivatedPolicies) {
    if (policies.policies?.[intent]) activePolicies[intent] = policies.policies[intent];
  }

  const mission = {
    version: '1.0.0',
    missionId,
    createdAt: new Date().toISOString(),
    repoHeadAtStart: indexObj.headCommit,
    status: 'in_progress',
    rawPrompt: effectivePrompt,
    incidentId: incidentId || null,
    totalGoals: parsedGoals.length,
    cursor: {
      clusterIdx: 0,
      stepIdx: 0,
      stepId: clusters[0]?.steps[0]?.id || null,
    },
    activatedPolicies: activePolicies,
    stateSnapshotCount: Object.keys(stateObj.states || {}).length,
    clusters,
    expansions: [],
  };

  const missionsDir = path.join(rootDir, '.cg', 'missions');
  await mkdir(missionsDir, { recursive: true });
  await writeFile(path.join(missionsDir, `${missionId}.json`), JSON.stringify(mission, null, 2));
  return mission;
}
