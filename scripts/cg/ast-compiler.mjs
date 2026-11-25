import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SCAN_ROOTS = ['server', 'src', 'shared', 'desktop', 'tests/unit'];
const EXTS = new Set(['.ts', '.tsx', '.mjs', '.js']);
const FILE_OVER_BUDGET_LINES = 400;

export function inferCellFromPath(relPath) {
  const norm = relPath.replace(/\\/g, '/').toLowerCase();
  if (norm.includes('whatsapp') || norm.includes('sofia') || norm.includes('onda6')) return 'whatsapp';
  if (norm.includes('onboarding') || norm.includes('maturity') || norm.includes('onda3')) return 'onboarding';
  if (norm.includes('spreadsheet') || norm.includes('xlsx')) return 'spreadsheet';
  if (norm.includes('storefront') || norm.includes('formula') || norm.includes('molde') || norm.includes('hydrator') || norm.includes('architect') || norm.includes('onda4')) return 'storefront';
  if (norm.includes('order') || norm.includes('onda5')) return 'orders';
  if (norm.includes('telemetry') || norm.includes('crash') || norm.includes('errorboundary')) return 'telemetry';
  if (norm.includes('admin')) return 'admin';
  if (norm.includes('access') || norm.includes('checkout') || norm.includes('kiwify')) return 'access';
  if (norm.includes('desktop')) return 'desktop';
  return 'core';
}

function sha1Hex(text) {
  return createHash('sha1').update(text).digest('hex');
}

async function collectFiles(rootDir) {
  const results = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (EXTS.has(path.extname(e.name).toLowerCase())) {
        results.push(path.relative(rootDir, full).replace(/\\/g, '/'));
      }
    }
  }
  for (const sub of SCAN_ROOTS) {
    await walk(path.join(rootDir, sub));
  }
  results.sort();
  return results;
}

function estimateBlockEnd(lineArr, startIdx) {
  let depth = 0;
  let seenOpen = false;
  const maxScan = Math.min(lineArr.length, startIdx + 260);
  for (let i = startIdx; i < maxScan; i += 1) {
    const l = lineArr[i];
    for (let c = 0; c < l.length; c += 1) {
      if (l[c] === '{') {
        depth += 1;
        seenOpen = true;
      } else if (l[c] === '}') {
        depth -= 1;
        if (seenOpen && depth <= 0) return i + 1;
      }
    }
  }
  return Math.min(lineArr.length, startIdx + 40);
}

function resolveImportPath(rootDir, fromRelPath, spec) {
  if (!spec) return null;
  if (spec.startsWith('@/')) {
    return `src/${spec.slice(2)}`;
  }
  if (!spec.startsWith('.')) return null;
  const baseDir = path.posix.dirname(fromRelPath);
  return path.posix.normalize(path.posix.join(baseDir, spec));
}

export function analyzeSourceFile(rootDir, relPath, text) {
  const ext = path.extname(relPath).toLowerCase();
  const lineArr = text.split('\n');
  const lines = lineArr.length;

  const symbols = {};
  const imports = new Set();
  const routesServed = new Set();
  const routesFetched = new Set();
  const eventsEmitted = new Set();
  const eventsListened = new Set();
  const stateReads = new Set();
  const stateWrites = new Set();
  const decisions = [];
  const testIds = new Set();
  const jsxChildren = new Set();
  const hooksUsed = new Set();
  const perfMarkers = { intervals: [], cloneCalls: 0 };
  let visualProfile = null;

  // Extract @cg annotations from comments
  for (const m of text.matchAll(/@cg:(reads|writes)\s+([^\s*]+)/g)) {
    if (m[1] === 'reads') stateReads.add(m[2]);
    else stateWrites.add(m[2]);
  }
  for (const m of text.matchAll(/@cg:decision\s+([a-zA-Z0-9_.-]+)/g)) {
    decisions.push(m[1]);
  }

  // Known disk JSON files & storage keys
  for (const m of text.matchAll(/(?:readJsonFile|readFile|existsSync)\s*\([^;\n]*?['"`]([a-zA-Z0-9_.-]+\.json)['"`]/g)) {
    stateReads.add(`disk:${m[1]}`);
  }
  for (const m of text.matchAll(/(?:atomicWriteJson|writeFile)\s*\([^;\n]*?['"`]([a-zA-Z0-9_.-]+\.json)['"`]/g)) {
    stateWrites.add(`disk:${m[1]}`);
  }
  const varToDisk = {
    templatesPath: 'disk:templates.json',
    flowsPath: 'disk:whatsapp_flows.json',
    eventsPath: 'disk:whatsapp_events.json',
    ordersPath: 'disk:orders.json',
    brainPath: 'disk:sofia_brain.json',
    configPath: 'disk:configuracoes.json',
    metricsPath: 'disk:metrics.json',
  };
  for (const m of text.matchAll(/(templatesPath|flowsPath|eventsPath|ordersPath|brainPath|configPath|metricsPath)/g)) {
    const idx = m.index || 0;
    const snippet = text.slice(Math.max(0, idx - 40), idx + 40);
    if (/(?:write|Write)/.test(snippet)) stateWrites.add(varToDisk[m[1]]);
    else if (/(?:read|Read)/.test(snippet)) stateReads.add(varToDisk[m[1]]);
  }
  for (const m of text.matchAll(/localStorage\.getItem\(\s*['"`]([^'"`]+)['"`]/g)) stateReads.add(`ls:${m[1]}`);
  for (const m of text.matchAll(/localStorage\.setItem\(\s*['"`]([^'"`]+)['"`]/g)) stateWrites.add(`ls:${m[1]}`);
  for (const m of text.matchAll(/sessionStorage\.getItem\(\s*['"`]([^'"`]+)['"`]/g)) stateReads.add(`ss:${m[1]}`);
  for (const m of text.matchAll(/sessionStorage\.setItem\(\s*['"`]([^'"`]+)['"`]/g)) stateWrites.add(`ss:${m[1]}`);

  // Imports
  for (const m of text.matchAll(/(?:import\s+[\s\S]*?\s+from\s+|import\s*\(\s*)['"`]([^'"`]+)['"`]/g)) {
    const resolved = resolveImportPath(rootDir, relPath, m[1]);
    if (resolved) imports.add(resolved);
  }

  // Symbols (functions including TS generics <T>, classes, const arrow functions / lazy wrappers)
  for (let i = 0; i < lineArr.length; i += 1) {
    const line = lineArr[i];
    const fnMatch = line.match(/^\s*(export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*(?:<|\()/);
    if (fnMatch) {
      symbols[fnMatch[2]] = {
        range: [i + 1, estimateBlockEnd(lineArr, i)],
        kind: 'function',
        exported: Boolean(fnMatch[1]),
      };
      continue;
    }
    const clsMatch = line.match(/^\s*(export\s+)?class\s+([a-zA-Z0-9_]+)/);
    if (clsMatch) {
      symbols[clsMatch[2]] = {
        range: [i + 1, estimateBlockEnd(lineArr, i)],
        kind: 'class',
        exported: Boolean(clsMatch[1]),
      };
      continue;
    }
    const constMatch = line.match(/^\s*(export\s+)?const\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|lazyNamed\s*\(|lazy\s*\()/);
    if (constMatch) {
      symbols[constMatch[2]] = {
        range: [i + 1, estimateBlockEnd(lineArr, i)],
        kind: 'const_fn',
        exported: Boolean(constMatch[1]),
      };
    }
  }

  // API routes, events & UI metadata
  for (const m of text.matchAll(/(?:authenticatedFetch|fetch)\(\s*['"`](\/api\/[^'"`?\s]+)['"`]/g)) {
    routesFetched.add(m[1]);
  }
  for (const m of text.matchAll(/dispatchEvent\(\s*new\s+CustomEvent\(\s*['"`]([^'"`]+)['"`]/g)) {
    eventsEmitted.add(m[1]);
  }
  for (const m of text.matchAll(/addEventListener\(\s*['"`]([^'"`]+:[^'"`]+)['"`]/g)) {
    eventsListened.add(m[1]);
  }
  for (const m of text.matchAll(/\b(use[A-Z][a-zA-Z0-9_]*)\s*\(/g)) {
    hooksUsed.add(m[1]);
  }
  for (let i = 0; i < lineArr.length; i += 1) {
    if (/setInterval\s*\(/.test(lineArr[i])) perfMarkers.intervals.push(i + 1);
  }
  perfMarkers.cloneCalls = (text.match(/\.clone\(/g) || []).length;

  if (ext === '.tsx') {
    for (const m of text.matchAll(/data-testid\s*=\s*['"`]([^'"`]+)['"`]/g)) testIds.add(m[1]);
    for (const m of text.matchAll(/<([A-Z][a-zA-Z0-9_]*)\b/g)) jsxChildren.add(m[1]);

    // Extract visual layout & editorial alignment markers directly into component-tree.json
    const exportedCompNames = Object.entries(symbols)
      .filter(([, s]) => s.exported)
      .map(([name]) => name);
    const mainComp = exportedCompNames[exportedCompNames.length - 1] || '';
    const mainStart = mainComp ? symbols[mainComp].range[0] : 1;
    let mainReturnLine = null;
    let headerRange = null;
    const gradientLines = [];
    let blurCount = 0;
    let heavyShadowCount = 0;
    let drawerCount = 0;

    for (let i = Math.max(0, mainStart - 1); i < lineArr.length; i += 1) {
      const l = lineArr[i];
      if (!mainReturnLine && /^\s*return\s*\(/.test(l)) mainReturnLine = i + 1;
      if (!headerRange && /<header\b/.test(l)) headerRange = [i + 1, Math.min(lineArr.length, i + 70)];
      if (/bg-gradient/.test(l)) gradientLines.push(i + 1);
      if (/backdrop-blur/.test(l)) blurCount += 1;
      if (/shadow-(?:md|lg|xl|2xl)/.test(l)) heavyShadowCount += 1;
      if (/aria-expanded=|Drawer|drawer|accordion|collapsible/i.test(l)) drawerCount += 1;
    }

    // Extract semantic JSX sub-regions (<=120 lines each) for deterministic micro-clusters
    const regions = [];
    const regionPatterns = [
      { kind: 'header', rx: /<header\b/ },
      { kind: 'nav_tabs', rx: /role="tablist"|<nav\b/ },
      { kind: 'drawer_or_modal', rx: /Drawer|Modal|activeSideDrawer|aria-expanded=/ },
      { kind: 'list_or_grid', rx: /\.map\(\(/ },
    ];
    for (const pat of regionPatterns) {
      let matches = 0;
      for (let i = Math.max(0, (mainReturnLine || mainStart) - 1); i < lineArr.length && matches < 4; i += 1) {
        if (pat.rx.test(lineArr[i])) {
          const rStart = i + 1;
          const rEnd = Math.min(lineArr.length, rStart + 90);
          const sliceText = lineArr.slice(rStart - 1, rEnd).join('\n');
          const sliceTestIds = Array.from(sliceText.matchAll(/data-testid\s*=\s*['"`]([^'"`]+)['"`]/g)).map((m) => m[1]);
          regions.push({ kind: pat.kind, range: [rStart, rEnd], testIds: Array.from(new Set(sliceTestIds)) });
          i = rEnd;
          matches += 1;
        }
      }
    }

    visualProfile = {
      mainComponent: mainComp || null,
      mainReturnLine,
      headerRange,
      hasFontSerif: /font-serif/.test(text),
      hasEditorialCanvas: /bg-\[#F8FAFC\]/.test(text),
      gradientLines: gradientLines.slice(0, 12),
      blurCount,
      heavyShadowCount,
      drawerCount,
      regions,
    };
  }
  if (relPath.startsWith('server/')) {
    for (const m of text.matchAll(/['"`](\/api\/[a-zA-Z0-9_/:.-]+)['"`]/g)) {
      if (!m[1].endsWith('/')) routesServed.add(m[1]);
    }
  }

  return {
    sha1: sha1Hex(text),
    lines,
    overBudget: lines > FILE_OVER_BUDGET_LINES,
    cell: inferCellFromPath(relPath),
    symbols,
    imports: Array.from(imports).sort(),
    routesServed: Array.from(routesServed).sort(),
    routesFetched: Array.from(routesFetched).sort(),
    eventsEmitted: Array.from(eventsEmitted).sort(),
    eventsListened: Array.from(eventsListened).sort(),
    stateReads: Array.from(stateReads).sort(),
    stateWrites: Array.from(stateWrites).sort(),
    decisions: Array.from(new Set(decisions)),
    testIds: Array.from(testIds).sort(),
    jsxChildren: Array.from(jsxChildren).sort(),
    hooksUsed: Array.from(hooksUsed).sort(),
    perfMarkers,
    visualProfile,
  };
}

function computeCoChangeCoupling(rootDir) {
  try {
    const raw = execFileSync('git', ['log', '--name-only', '--pretty=format:__COMMIT__', '-n', '60'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const fileCounts = new Map();
    const pairCounts = new Map();
    for (const block of raw.split('__COMMIT__')) {
      const files = Array.from(
        new Set(
          block
            .split(/\r?\n/)
            .map((l) => l.trim().replace(/\\/g, '/'))
            .filter((l) => l && EXTS.has(path.extname(l)) && !l.startsWith('tests/')),
        ),
      );
      if (files.length < 2 || files.length > 15) continue;
      for (const f of files) {
        fileCounts.set(f, (fileCounts.get(f) || 0) + 1);
      }
      for (let i = 0; i < files.length; i += 1) {
        for (let j = i + 1; j < files.length; j += 1) {
          const [a, b] = [files[i], files[j]].sort();
          const key = `${a}::${b}`;
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
      }
    }
    const coupling = {};
    for (const [key, count] of pairCounts.entries()) {
      if (count < 2) continue;
      const [a, b] = key.split('::');
      const confA = Number((count / Math.max(1, fileCounts.get(a) || 1)).toFixed(2));
      const confB = Number((count / Math.max(1, fileCounts.get(b) || 1)).toFixed(2));
      if (confA >= 0.4) {
        coupling[a] = coupling[a] || [];
        coupling[a].push({ file: b, count, confidence: confA });
      }
      if (confB >= 0.4) {
        coupling[b] = coupling[b] || [];
        coupling[b].push({ file: a, count, confidence: confB });
      }
    }
    for (const k of Object.keys(coupling)) {
      coupling[k].sort((x, y) => y.confidence - x.confidence);
      coupling[k] = coupling[k].slice(0, 6);
    }
    return coupling;
  } catch {
    return {};
  }
}

function getHeadCommit(rootDir) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function resolveFileMatch(allFilesSet, spec) {
  if (allFilesSet.has(spec)) return spec;
  for (const ext of ['.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx', '/index.mjs']) {
    if (allFilesSet.has(spec + ext)) return spec + ext;
  }
  return null;
}

export async function buildOrRefreshGraph(rootDir, { force = false } = {}) {
  const graphDir = path.join(rootDir, '.cg', 'graph');
  await mkdir(graphDir, { recursive: true });

  const indexPath = path.join(graphDir, 'index.json');
  let prevIndex = { files: {} };
  if (!force) {
    try {
      prevIndex = JSON.parse(await readFile(indexPath, 'utf8'));
    } catch {
      prevIndex = { files: {} };
    }
  }

  const currentFiles = await collectFiles(rootDir);
  const allFilesSet = new Set(currentFiles);
  const nextFiles = {};
  let reindexedCount = 0;
  let reusedCount = 0;

  for (const relPath of currentFiles) {
    const abs = path.join(rootDir, relPath);
    const text = await readFile(abs, 'utf8');
    const hash = sha1Hex(text);
    const prev = prevIndex.files?.[relPath];
    if (!force && prev && prev.sha1 === hash) {
      nextFiles[relPath] = prev;
      reusedCount += 1;
    } else {
      nextFiles[relPath] = analyzeSourceFile(rootDir, relPath, text);
      reindexedCount += 1;
    }
  }

  const edges = [];
  const stateMap = {};
  const screens = {};

  const ensureState = (id) => {
    if (!stateMap[id]) {
      stateMap[id] = { writers: [], readers: [], status: 'coherent' };
    }
    return stateMap[id];
  };

  for (const [relPath, info] of Object.entries(nextFiles)) {
    for (const rawImp of info.imports) {
      const target = resolveFileMatch(allFilesSet, rawImp);
      if (target) edges.push({ from: relPath, type: 'imports', to: target });
    }
    for (const r of info.routesFetched) {
      edges.push({ from: relPath, type: 'fetches', to: `route:${r}` });
    }
    for (const r of info.routesServed) {
      edges.push({ from: relPath, type: 'serves', to: `route:${r}` });
    }
    for (const ev of info.eventsEmitted) {
      edges.push({ from: relPath, type: 'emits', to: `event:${ev}` });
    }
    for (const ev of info.eventsListened) {
      edges.push({ from: relPath, type: 'listens', to: `event:${ev}` });
    }
    for (const stId of info.stateWrites) {
      ensureState(stId).writers.push(relPath);
      edges.push({ from: relPath, type: 'writes', to: stId });
    }
    for (const stId of info.stateReads) {
      ensureState(stId).readers.push(relPath);
      edges.push({ from: relPath, type: 'reads', to: stId });
    }
    if (relPath.endsWith('.tsx') && (info.testIds.length > 0 || info.jsxChildren.length > 0)) {
      screens[relPath] = {
        cell: info.cell,
        lines: info.lines,
        testIds: info.testIds,
        children: info.jsxChildren,
        hooks: info.hooksUsed,
        visualProfile: info.visualProfile,
      };
    }
  }

  for (const [stId, st] of Object.entries(stateMap)) {
    st.writers = Array.from(new Set(st.writers)).sort();
    st.readers = Array.from(new Set(st.readers)).sort();
    if (st.writers.length > 0 && st.readers.length === 0) st.status = 'orphan_writer';
    else if (st.readers.length > 0 && st.writers.length === 0) st.status = 'orphan_reader';
    else if (st.writers.length > 1) st.status = 'multi_writer';
    else st.status = 'coherent';
  }

  const indexObj = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    headCommit: getHeadCommit(rootDir),
    fileCount: currentFiles.length,
    reindexedCount,
    reusedCount,
    files: nextFiles,
  };

  const depObj = {
    generatedAt: indexObj.generatedAt,
    edgeCount: edges.length,
    edges,
    coChangeCoupling: computeCoChangeCoupling(rootDir),
  };

  const stateObj = {
    generatedAt: indexObj.generatedAt,
    stateCount: Object.keys(stateMap).length,
    states: stateMap,
  };

  const treeObj = {
    generatedAt: indexObj.generatedAt,
    screenCount: Object.keys(screens).length,
    screens,
  };

  const uiDesignRef = {
    version: '1.0.0',
    sourceReference: 'src/components/views/storefront/EditorialStoreControlView.tsx',
    generatedAt: indexObj.generatedAt,
    tokens: {
      canvasBg: 'bg-[#F8FAFC]',
      surfaceCard: 'rounded-[14px] border border-[#E2E8F0] bg-white',
      headerTitle: 'font-serif text-[32px] sm:text-[44px] font-extrabold leading-[0.95] tracking-[-0.03em] text-[#09090B]',
      subtitle: 'text-xs text-[#64748B]',
      metricsValue: 'font-bold leading-none tabular-nums text-[#09090B]',
      pillActive: 'rounded-full bg-[#09090B] text-white',
      pillInactive: 'rounded-full text-[#334155] hover:bg-[#F1F5F9]',
      forbiddenClasses: ['backdrop-blur', 'shadow-xl', 'shadow-lg', 'bg-gradient-'],
    },
    referenceTestIds: screens['src/components/views/storefront/EditorialStoreControlView.tsx']?.testIds || [],
  };

  const routeScreenMap = {
    version: '1.0.0',
    generatedAt: indexObj.generatedAt,
    routes: [
      { id: 'auth', query: '?theme=light', file: 'src/components/auth/AuthFlowView.tsx', testIds: screens['src/components/auth/AuthFlowView.tsx']?.testIds || [] },
      { id: 'access', query: '?route=access&theme=light', file: 'src/components/views/access/AccessCodeView.tsx', testIds: screens['src/components/views/access/AccessCodeView.tsx']?.testIds || [] },
      { id: 'store', tab: 'store', file: 'src/components/views/storefront/EditorialStoreControlView.tsx', testIds: screens['src/components/views/storefront/EditorialStoreControlView.tsx']?.testIds || [] },
      { id: 'whatsapp', tab: 'whatsapp', file: 'src/components/views/whatsapp/WhatsAppConnectionView.tsx', testIds: screens['src/components/views/whatsapp/WhatsAppConnectionView.tsx']?.testIds || [] },
      { id: 'dashboard', tab: 'dashboard', file: 'src/components/views/orders/OrdersKanbanView.tsx', testIds: screens['src/components/views/orders/OrdersKanbanView.tsx']?.testIds || [] },
      { id: 'settings', tab: 'settings', file: 'src/components/views/settings/SettingsView.tsx', testIds: screens['src/components/views/settings/SettingsView.tsx']?.testIds || [] },
      { id: 'admin', tab: 'admin', file: 'src/components/views/admin/AdminConsoleView.tsx', testIds: screens['src/components/views/admin/AdminConsoleView.tsx']?.testIds || [] },
      { id: 'checkout', query: '?route=checkout&theme=light', file: 'src/components/views/checkout/CheckoutPlansView.tsx', testIds: screens['src/components/views/checkout/CheckoutPlansView.tsx']?.testIds || [] },
    ],
  };

  await mkdir(path.join(rootDir, '.cg', 'taxonomy'), { recursive: true });
  await Promise.all([
    writeFile(path.join(graphDir, 'index.json'), JSON.stringify(indexObj, null, 2)),
    writeFile(path.join(graphDir, 'dependency-graph.json'), JSON.stringify(depObj, null, 2)),
    writeFile(path.join(graphDir, 'state-ownership.json'), JSON.stringify(stateObj, null, 2)),
    writeFile(path.join(graphDir, 'component-tree.json'), JSON.stringify(treeObj, null, 2)),
    writeFile(path.join(graphDir, 'route-screen-map.json'), JSON.stringify(routeScreenMap, null, 2)),
    writeFile(path.join(rootDir, '.cg', 'taxonomy', 'ui-design-reference.json'), JSON.stringify(uiDesignRef, null, 2)),
  ]);

  return { indexObj, depObj, stateObj, treeObj, routeScreenMap, uiDesignRef };
}
