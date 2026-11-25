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

/**
 * Cluster Factory: expande uma missão ambiciosa em dezenas/centenas de Micro-Clusters atômicos
 * cruzando as macro-intenções detectadas com .cg/graph/ (estados, perfMarkers, visualProfile, regiões JSX e rotas).
 */
export async function buildShardedMicroMission(rootDir, { prompt = '' } = {}) {
  const { indexObj, stateObj, treeObj, routeScreenMap } = await ensureFreshGraph(rootDir);
  const cleanPrompt = norm(prompt);

  const wantsPerf = /otimiz|performance|pc fraco|leve|pesado|travando/.test(cleanPrompt);
  const wantsVisual = /visual|minimalis|minha loja|minha pagina|pagina|tela|gaveta|botao|botoes|ui/.test(cleanPrompt);
  const wantsState = /estado|coerenc|json|.cg|quebrar|contrato/.test(cleanPrompt);
  const wantsNav = /navegador|browser|print|open navigator|valida/.test(cleanPrompt) || wantsVisual;

  const clusters = [];
  let seq = 1;
  const pushCluster = (wave, { macroIntent, kind, targetFile, range = null, description, preserveTestIds = [], check = 'verify-micro' }) => {
    const id = `C-${String(seq++).padStart(3, '0')}`;
    clusters.push({
      clusterId: id,
      wave,
      macroIntent,
      kind,
      status: 'pending',
      retries: 0,
      allowedEditSet: targetFile ? [targetFile] : [],
      range,
      preserveTestIds,
      description,
      check,
      after: [],
    });
  };

  // Wave 1: GEN-STATE-COHERENCE + GEN-PERF-TIMERS
  if (wantsState || wantsPerf) {
    for (const [stateId, st] of Object.entries(stateObj.states || {})) {
      if (st.status === 'orphan_writer' || st.status === 'orphan_reader') {
        const target = (st.writers[0] || st.readers[0] || '').replace(/\\/g, '/');
        if (!target || target.startsWith('tests/')) continue;
        pushCluster('W1', {
          macroIntent: 'STATE_FLOW',
          kind: 'GEN-STATE-COHERENCE',
          targetFile: target,
          description: `Resolver ${st.status} em "${stateId}" (${target})`,
          check: 'agent-ops lint',
        });
      }
    }
    for (const [file, meta] of Object.entries(indexObj.files || {})) {
      for (const ln of meta.perfMarkers?.intervals || []) {
        pushCluster('W1', {
          macroIntent: 'PERFORMANCE',
          kind: 'GEN-PERF-TIMERS',
          targetFile: file,
          range: [Math.max(1, ln - 10), Math.min(meta.lines, ln + 25)],
          description: `Auditar setInterval na linha ${ln} de ${path.posix.basename(file)} (pausar quando oculto / sem alocação ociosa)`,
        });
      }
    }
  }

  // Wave 2: GEN-PERF-SURFACE (sombras/gradientes/blur) + GEN-PERF-LIST-CV
  if (wantsPerf || wantsVisual) {
    for (const [file, scr] of Object.entries(treeObj.screens || {})) {
      const vp = scr.visualProfile || {};
      if ((vp.heavyShadowCount || 0) > 0 || (vp.blurCount || 0) > 0 || (vp.gradientLines?.length || 0) > 0) {
        const firstLine = vp.gradientLines?.[0] || vp.mainReturnLine || 1;
        pushCluster('W2', {
          macroIntent: 'PERFORMANCE',
          kind: 'GEN-PERF-SURFACE',
          targetFile: file,
          range: [Math.max(1, firstLine - 15), Math.min(scr.lines, firstLine + 80)],
          preserveTestIds: scr.testIds || [],
          description: `Achatar ${vp.heavyShadowCount || 0} sombra(s), ${vp.blurCount || 0} blur(s) e ${vp.gradientLines?.length || 0} gradiente(s) em ${path.posix.basename(file)}`,
        });
      }
    }
  }

  // Wave 3 & 4: GEN-UI-HEADER + GEN-UI-SECTION-MINIMAL + GEN-UI-DRAWER-FOLD para cada tela e sub-região JSX
  if (wantsVisual) {
    for (const [file, scr] of Object.entries(treeObj.screens || {})) {
      if (file.endsWith('EditorialStoreControlView.tsx')) continue; // Referência visual
      const vp = scr.visualProfile || {};
      const isShell = file.includes('/shell/') || file.includes('/ui/');
      const wave = isShell ? 'W3' : 'W4';

      if (!vp.hasFontSerif || !vp.hasEditorialCanvas) {
        pushCluster(wave, {
          macroIntent: 'VISUAL',
          kind: 'GEN-UI-HEADER',
          targetFile: file,
          range: vp.headerRange || (vp.mainReturnLine ? [vp.mainReturnLine, Math.min(scr.lines, vp.mainReturnLine + 65)] : [1, Math.min(scr.lines, 80)]),
          preserveTestIds: (scr.testIds || []).slice(0, 15),
          description: `Aplicar canvas bg-[#F8FAFC] + cabeçalho editorial font-serif de Minha Loja em ${path.posix.basename(file)}`,
        });
      }

      for (const reg of vp.regions || []) {
        pushCluster(wave, {
          macroIntent: 'VISUAL',
          kind: reg.kind === 'drawer_or_modal' ? 'GEN-UI-DRAWER-FOLD' : 'GEN-UI-SECTION-MINIMAL',
          targetFile: file,
          range: reg.range,
          preserveTestIds: reg.testIds || [],
          description: `Padronizar região "${reg.kind}" (${reg.range[0]}-${reg.range[1]}) de ${path.posix.basename(file)} preservando ${reg.testIds?.length || 0} testId(s)`,
        });
      }
    }
  }

  // Wave 5: GEN-NAV-EACH-SCREEN (OPEN_NAVIGATOR por rota x viewport 1280x800 + 375x812)
  if (wantsNav && routeScreenMap?.routes) {
    for (const rt of routeScreenMap.routes) {
      for (const vp of ['1280x800', '375x812']) {
        pushCluster('W5', {
          macroIntent: 'VISUAL',
          kind: 'GEN-NAV-EACH-SCREEN',
          targetFile: rt.file,
          preserveTestIds: rt.testIds || [],
          description: `OPEN_NAVIGATOR: validar rota "${rt.id}" (${vp}) com consoleErrors==0 e todos os botões/gavetas vivos`,
          check: 'OPEN_NAVIGATOR',
        });
      }
    }
  }

  // Wave 6: Consolidação .cg/ + Verify Gate Final
  pushCluster('W6', {
    macroIntent: 'DELIVERY',
    kind: 'GEN-CG-SYNC',
    targetFile: '.cg/taxonomy/policies.json',
    description: 'Reindexar .cg/graph/, validar testId Diff Guard global, tsc -b, vite build e suíte tests/unit/*.test.mjs',
    check: 'agent-ops verify',
  });

  // FileMutex intra-Wave: encadeia `after` automaticamente quando 2 clusters na mesma Onda tocam o mesmo arquivo
  const lastWriterInWave = new Map();
  const wavesSummary = {};
  for (const cl of clusters) {
    wavesSummary[cl.wave] = wavesSummary[cl.wave] || [];
    wavesSummary[cl.wave].push(cl.clusterId);
    for (const f of cl.allowedEditSet) {
      const k = `${cl.wave}::${f}`;
      if (lastWriterInWave.has(k)) {
        cl.after.push(lastWriterInWave.get(k));
      }
      lastWriterInWave.set(k, cl.clusterId);
    }
  }

  const missionId = `M-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${createHash('sha1').update(prompt + Date.now()).digest('hex').slice(0, 6)}`;
  const missionDir = path.join(rootDir, '.cg', 'missions', missionId);
  const wavesDir = path.join(missionDir, 'waves');
  const clustersDir = path.join(missionDir, 'clusters');
  await mkdir(wavesDir, { recursive: true });
  await mkdir(clustersDir, { recursive: true });

  const waveOrder = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'].filter((w) => (wavesSummary[w] || []).length > 0);
  const manifest = {
    version: '2.0.0-sharded',
    missionId,
    createdAt: new Date().toISOString(),
    repoHeadAtStart: indexObj.headCommit,
    status: 'in_progress',
    rawPrompt: prompt,
    totalClusters: clusters.length,
    waveOrder,
    activeWave: waveOrder[0] || null,
    cursorClusterId: clusters[0]?.clusterId || null,
    counts: {
      pending: clusters.length,
      done: 0,
      quarantined: 0,
    },
    fileMutexEnabled: true,
    waveBarriers: waveOrder.map((w) => ({
      wave: w,
      clusterCount: wavesSummary[w].length,
      passed: false,
    })),
  };

  await writeFile(path.join(missionDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await Promise.all([
    ...waveOrder.map((w) =>
      writeFile(
        path.join(wavesDir, `${w}.json`),
        JSON.stringify({ wave: w, clusterIds: wavesSummary[w] }, null, 2),
      ),
    ),
    ...clusters.map((cl) =>
      writeFile(path.join(clustersDir, `${cl.clusterId}.json`), JSON.stringify(cl, null, 2)),
    ),
  ]);

  return manifest;
}
