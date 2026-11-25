import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildOrRefreshGraph } from './ast-compiler.mjs';

async function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function ensureFreshGraph(rootDir) {
  const indexPath = path.join(rootDir, '.cg', 'graph', 'index.json');
  const existing = await readJsonSafe(indexPath, null);
  if (!existing || !existing.files) {
    return buildOrRefreshGraph(rootDir, { force: true });
  }
  return buildOrRefreshGraph(rootDir, { force: false });
}

export async function runCoherenceLint(rootDir, { refresh = true } = {}) {
  const graph = refresh
    ? await ensureFreshGraph(rootDir)
    : {
        indexObj: await readJsonSafe(path.join(rootDir, '.cg', 'graph', 'index.json'), { files: {} }),
        depObj: await readJsonSafe(path.join(rootDir, '.cg', 'graph', 'dependency-graph.json'), { edges: [] }),
        stateObj: await readJsonSafe(path.join(rootDir, '.cg', 'graph', 'state-ownership.json'), { states: {} }),
      };

  const { indexObj, depObj, stateObj } = graph;
  const findings = [];

  // 1. Check SHA-1 coherence against disk
  for (const [relPath, entry] of Object.entries(indexObj.files || {})) {
    try {
      const diskSha = createHash('sha1').update(await readFile(path.join(rootDir, relPath), 'utf8')).digest('hex');
      if (diskSha !== entry.sha1) {
        findings.push({ rule: 'STALE_HASH', severity: 'error', file: relPath });
      }
    } catch {
      findings.push({ rule: 'MISSING_INDEXED_FILE', severity: 'error', file: relPath });
    }
    if (entry.overBudget && !relPath.startsWith('tests/')) {
      findings.push({
        rule: 'FILE_OVER_BUDGET',
        severity: 'warn',
        file: relPath,
        lines: entry.lines,
        cell: entry.cell,
      });
    }
  }

  // 2. Check state ownership: ORPHAN_WRITER / MULTI_WRITER (ignoring test fixtures)
  for (const [stateId, st] of Object.entries(stateObj.states || {})) {
    const prodWriters = (st.writers || []).filter((f) => !f.startsWith('tests/'));
    const prodReaders = (st.readers || []).filter((f) => !f.startsWith('tests/'));
    if (prodWriters.length > 0 && prodReaders.length === 0) {
      findings.push({
        rule: 'ORPHAN_WRITER',
        severity: 'warn',
        stateId,
        writers: prodWriters,
      });
    }
    if (prodWriters.length > 1) {
      findings.push({
        rule: 'MULTI_WRITER_STATE',
        severity: 'info',
        stateId,
        writers: prodWriters,
      });
    }
  }

  // 3. Validate invariants anchors exist in real indexed files/symbols
  const invReg = await readJsonSafe(path.join(rootDir, '.cg', 'invariants', 'registry.json'), { invariants: [] });
  for (const inv of invReg.invariants || []) {
    for (const anchor of inv.anchors || []) {
      const [file, symbol] = String(anchor).split('#');
      const fileEntry = indexObj.files?.[file];
      if (!fileEntry) {
        findings.push({
          rule: 'BROKEN_INVARIANT_ANCHOR',
          severity: 'error',
          invariantId: inv.id,
          anchor,
          reason: 'Arquivo âncora não encontrado no índice',
        });
      } else if (symbol && !fileEntry.symbols?.[symbol]) {
        findings.push({
          rule: 'BROKEN_INVARIANT_ANCHOR',
          severity: 'error',
          invariantId: inv.id,
          anchor,
          reason: `Símbolo "${symbol}" não encontrado em ${file}`,
        });
      }
    }
  }

  // 4. Cross-check shared/formula-ir/route-registry.json routes have server implementations
  const routeReg = await readJsonSafe(path.join(rootDir, 'shared', 'formula-ir', 'route-registry.json'), null);
  const servedRoutes = new Set(
    (depObj.edges || []).filter((e) => e.type === 'serves').map((e) => e.to),
  );
  if (routeReg && Array.isArray(routeReg.routes)) {
    for (const rt of routeReg.routes) {
      const pathStr = typeof rt === 'string' ? rt : rt?.path;
      if (pathStr && pathStr.startsWith('/api/') && !servedRoutes.has(`route:${pathStr}`)) {
        findings.push({
          rule: 'UNSERVED_REGISTRY_ROUTE',
          severity: 'warn',
          route: pathStr,
        });
      }
    }
  }

  const errors = findings.filter((f) => f.severity === 'error');
  return {
    ok: errors.length === 0,
    checkedAt: new Date().toISOString(),
    summary: {
      files: Object.keys(indexObj.files || {}).length,
      edges: (depObj.edges || []).length,
      states: Object.keys(stateObj.states || {}).length,
      errors: errors.length,
      warnings: findings.filter((f) => f.severity === 'warn').length,
      infos: findings.filter((f) => f.severity === 'info').length,
    },
    findings,
  };
}

/**
 * testId Diff Guard: garante que refatorações UI / gavetas não apaguem botões existentes.
 */
export async function guardTestIds(rootDir, { targetFile, expectedTestIds = [], allowRemoved = [] } = {}) {
  const { treeObj } = await ensureFreshGraph(rootDir);
  const currentIds = new Set(treeObj.screens?.[targetFile]?.testIds || []);
  const allowedSet = new Set(allowRemoved);
  const missing = expectedTestIds.filter((id) => !currentIds.has(id) && !allowedSet.has(id));
  return {
    ok: missing.length === 0,
    targetFile,
    expectedCount: expectedTestIds.length,
    currentCount: currentIds.size,
    missingTestIds: missing,
  };
}
