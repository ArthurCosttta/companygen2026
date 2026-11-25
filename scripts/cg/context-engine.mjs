import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureFreshGraph } from './coherence-guardian.mjs';

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readLinesRange(rootDir, relPath, startLine, endLine) {
  try {
    const lines = (await readFile(path.join(rootDir, relPath), 'utf8')).split('\n');
    const s = Math.max(1, Number(startLine || 1));
    const e = Math.min(lines.length, Number(endLine || Math.min(lines.length, s + 60)));
    return lines
      .slice(s - 1, e)
      .map((l, idx) => `${s + idx}: ${l}`)
      .join('\n');
  } catch {
    return '';
  }
}

async function loadNegativeMemory(rootDir, candidateFiles) {
  try {
    const raw = await readFile(path.join(rootDir, '.cg', 'ledger', 'events.jsonl'), 'utf8');
    const entries = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const set = new Set(candidateFiles);
    return entries
      .filter((e) => e.failurePattern && (e.filesTouched || []).some((f) => set.has(f)))
      .slice(-4);
  } catch {
    return [];
  }
}

export async function buildContextCapsule(
  rootDir,
  { domain = '', incidentId = '', anchor = '', tokenBudget = 6000 } = {},
) {
  const { indexObj, depObj, stateObj, treeObj } = await ensureFreshGraph(rootDir);
  const invReg = await readJson(path.join(rootDir, '.cg', 'invariants', 'registry.json'), { invariants: [] });
  const policies = await readJson(path.join(rootDir, '.cg', 'taxonomy', 'policies.json'), { policies: {} });
  const incident = incidentId
    ? await readJson(path.join(rootDir, '.cg', 'incidents', `${incidentId}.json`), null)
    : null;

  const anchorFile = anchor ? anchor.split('#')[0] : '';
  const anchorSym = anchor ? anchor.split('#')[1] || '' : '';

  const rankedFiles = new Set();
  if (anchorFile && indexObj.files?.[anchorFile]) rankedFiles.add(anchorFile);
  if (incident && Array.isArray(incident.suspectedFiles)) {
    incident.suspectedFiles.forEach((f) => {
      if (indexObj.files?.[f]) rankedFiles.add(f);
    });
  }
  if (domain) {
    for (const [relPath, meta] of Object.entries(indexObj.files || {})) {
      if (meta.cell === domain && !relPath.startsWith('tests/')) {
        rankedFiles.add(relPath);
      }
    }
  }

  // Pull 1-hop state co-readers/co-writers & coChange coupling
  const baseList = Array.from(rankedFiles);
  for (const f of baseList) {
    const meta = indexObj.files?.[f];
    if (!meta) continue;
    for (const stId of [...(meta.stateReads || []), ...(meta.stateWrites || [])]) {
      const st = stateObj.states?.[stId];
      if (!st) continue;
      [...(st.writers || []), ...(st.readers || [])].slice(0, 4).forEach((nf) => {
        if (!nf.startsWith('tests/')) rankedFiles.add(nf);
      });
    }
    for (const co of depObj.coChangeCoupling?.[f] || []) {
      if (co.confidence >= 0.55) rankedFiles.add(co.file);
    }
  }

  const allowedEditSet = Array.from(rankedFiles).filter((f) => !f.startsWith('tests/')).slice(0, 8);
  const relevantStates = {};
  for (const [stId, st] of Object.entries(stateObj.states || {})) {
    if ([...(st.writers || []), ...(st.readers || [])].some((f) => allowedEditSet.includes(f))) {
      relevantStates[stId] = st;
    }
  }

  const invariantsAtRisk = (invReg.invariants || []).filter((inv) =>
    (inv.anchors || []).some((a) => allowedEditSet.includes(a.split('#')[0])),
  );

  const requiredTests = Array.from(
    new Set([
      ...invariantsAtRisk.map((i) => i.test).filter(Boolean),
      ...Object.entries(indexObj.files || {})
        .filter(([f, meta]) => f.startsWith('tests/unit/') && (meta.cell === domain || allowedEditSet.some((af) => meta.cell === indexObj.files[af]?.cell)))
        .map(([f]) => f),
    ]),
  );

  const componentSubtree = {};
  for (const f of allowedEditSet) {
    if (treeObj.screens?.[f]) componentSubtree[f] = treeObj.screens[f];
  }

  // Fill excerpts respecting character/token budget (~4 chars/token)
  const charBudget = Math.max(2000, tokenBudget * 4);
  let usedChars = 0;
  const excerpts = [];

  if (anchorFile && anchorSym && indexObj.files?.[anchorFile]?.symbols?.[anchorSym]) {
    const [s, e] = indexObj.files[anchorFile].symbols[anchorSym].range;
    const code = await readLinesRange(rootDir, anchorFile, s, Math.min(e, s + 90));
    usedChars += code.length;
    excerpts.push({ file: anchorFile, symbol: anchorSym, range: [s, e], code });
  } else {
    for (const f of allowedEditSet.slice(0, 4)) {
      const meta = indexObj.files?.[f];
      if (!meta) continue;
      const firstSym = Object.entries(meta.symbols || {})[0];
      if (!firstSym) continue;
      const [symName, symInfo] = firstSym;
      if (usedChars >= charBudget) break;
      const code = await readLinesRange(rootDir, f, symInfo.range[0], Math.min(symInfo.range[1], symInfo.range[0] + 55));
      if (usedChars + code.length <= charBudget) {
        usedChars += code.length;
        excerpts.push({ file: f, symbol: symName, range: symInfo.range, code });
      }
    }
  }

  const negativeMemory = await loadNegativeMemory(rootDir, allowedEditSet);
  const capsuleBody = {
    capsuleId: `cap-${createHash('sha1').update(`${indexObj.headCommit}:${domain}:${incidentId}:${anchor}`).digest('hex').slice(0, 8)}`,
    commit: indexObj.headCommit,
    domain: domain || (allowedEditSet[0] ? indexObj.files[allowedEditSet[0]]?.cell : 'core'),
    incident: incident ? { id: incident.id, category: incident.category, message: incident.message, context: incident.context } : null,
    allowedEditSet,
    symbolsByFile: Object.fromEntries(
      allowedEditSet.map((f) => [f, indexObj.files?.[f]?.symbols || {}]),
    ),
    relevantStates,
    invariantsAtRisk,
    componentSubtree,
    negativeMemory,
    excerpts,
    requiredTests,
    policiesSummary: policies.policies?.BEHAVIOR?.generationPolicies || [],
  };
  return capsuleBody;
}

export async function computeImpact(rootDir, { target = '' } = {}) {
  const { indexObj, depObj, stateObj, treeObj } = await ensureFreshGraph(rootDir);
  const invReg = await readJson(path.join(rootDir, '.cg', 'invariants', 'registry.json'), { invariants: [] });
  const [rawFile, rawSymbol] = String(target).split('#');
  const file = rawFile.replace(/\\/g, '/');
  const meta = indexObj.files?.[file];
  if (!meta) {
    return { ok: false, error: `Arquivo "${file}" não está indexado em .cg/graph/index.json.` };
  }

  const directImporters = (depObj.edges || []).filter((e) => e.type === 'imports' && e.to === file).map((e) => e.from);
  const sharedStates = [];
  for (const stId of [...(meta.stateReads || []), ...(meta.stateWrites || [])]) {
    if (stateObj.states?.[stId]) sharedStates.push({ stateId: stId, ...stateObj.states[stId] });
  }
  const invariants = (invReg.invariants || []).filter((inv) =>
    (inv.anchors || []).some((a) => a === target || a.startsWith(`${file}#`)),
  );
  const relatedTests = Array.from(
    new Set([
      ...invariants.map((i) => i.test).filter(Boolean),
      ...Object.entries(indexObj.files || {})
        .filter(([f, m]) => f.startsWith('tests/') && m.cell === meta.cell)
        .map(([f]) => f),
    ]),
  );

  return {
    ok: true,
    target,
    cell: meta.cell,
    lines: meta.lines,
    overBudget: meta.overBudget,
    symbolInfo: rawSymbol ? meta.symbols?.[rawSymbol] || null : meta.symbols,
    directImporters,
    sharedStates,
    coChangeCoupling: depObj.coChangeCoupling?.[file] || [],
    screenInfo: treeObj.screens?.[file] || null,
    invariants,
    relatedTests,
  };
}
