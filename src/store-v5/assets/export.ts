import JSZip from 'jszip';
import type { SiteIR } from '../compiler/types';
import { promptFor } from './prompts';
import { compilePublicStore } from '../compiler/public-compiler';

export type Override = {
  url: string;
  alt: string;
  approved: boolean;
  sourceUrl?: string;
  license?: string;
  creator?: string;
  origin: 'upload' | 'search';
};

export type RuntimeBundle = {
  files: Record<string, string | ArrayBuffer>;
};

const slug = (x: string) =>
  x
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .slice(0, 80);

export async function loadRuntime(): Promise<RuntimeBundle> {
  const root = '/export-runtime/';
  const manifest = await fetch(root + 'bundle.json');
  if (!manifest.ok)
    throw new Error(`Runtime da loja indisponível (${manifest.status}); execute npm run build:runtime`);
  const data = (await manifest.json()) as { files: string[] };
  if (
    !data.files?.includes('standalone.html') ||
    !data.files.some(x => x.endsWith('.js')) ||
    !data.files.some(x => x.endsWith('.css'))
  )
    throw new Error('Bundle executável incompleto');
  const entries = await Promise.all(
    data.files.map(async path => {
      if (path.startsWith('/') || path.includes('..')) throw new Error('Caminho inválido no runtime');
      const r = await fetch(root + path);
      if (!r.ok) throw new Error(`Arquivo ausente: ${path}`);
      return [path, await r.arrayBuffer()] as const;
    })
  );
  return { files: Object.fromEntries(entries) };
}

const server = `const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=__dirname,port=5611,types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400).end();return}const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end('Arquivo não encontrado');return}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'}).end(data)})});
server.listen(port,'127.0.0.1',()=>{const url='http://localhost:'+port+'/';console.log('Loja pronta: '+url);if(process.platform==='win32'){const child=cp.spawn('cmd',['/c','start','',url],{detached:true,stdio:'ignore'});child.unref()}});
server.on('error',e=>{console.error('Não foi possível abrir a porta '+port+': '+e.message);process.exitCode=1});
`;

const launcher = `@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (\r\n  echo Node.js nao encontrado. Instale https://nodejs.org/\r\n  pause\r\n  exit /b 1\r\n)\r\necho Abrindo a loja em http://localhost:5611/\r\necho Mantenha esta janela aberta. Ctrl+C encerra.\r\nnode serve.cjs\r\nif errorlevel 1 pause\r\nendlocal\r\n`;

export async function exportProject(
  s: SiteIR,
  overrides: Record<string, Override>,
  getRuntime: () => Promise<RuntimeBundle> = loadRuntime
) {
  const runtime = await getRuntime();
  const zip = new JSZip();

  for (const [path, contents] of Object.entries(runtime.files)) {
    const target = path === 'standalone.html' ? 'index.html' : path;
    zip.file(target, contents);
  }
  if (!runtime.files['standalone.html']) throw new Error('Página da loja ausente no runtime');

  // Validação pública estrita
  const publicResult = compilePublicStore(s, overrides);
  const isPreview = publicResult.validation.isBlocked;

  // Processamento e desempacotamento de assets: imagens base64 viram arquivos em assets/
  const manifest: any[] = [];
  const processedAssets = s.assets.map(a => {
    const o = overrides[a.assetId];
    const baseAsset = o
      ? {
          ...a,
          url: o.url,
          alt: o.alt,
          approved: o.approved,
          sourceUrl: o.sourceUrl,
          license: o.license,
          creator: o.creator,
          status: 'ready' as const
        }
      : a;

    let relativePath = baseAsset.path || '';
    if (baseAsset.url?.startsWith('data:')) {
      const match = baseAsset.url.match(/^data:(image\/(?:png|jpeg|webp|avif));base64,(.+)$/);
      if (match) {
        const ext = match[1].split('/')[1] === 'jpeg' ? 'jpg' : match[1].split('/')[1];
        relativePath = `assets/${slug(baseAsset.assetId)}.${ext}`;
        zip.file(relativePath, match[2], { base64: true });
      }
    } else if (baseAsset.url?.startsWith('assets/')) {
      relativePath = baseAsset.url;
    }

    manifest.push({
      assetId: baseAsset.assetId,
      kind: baseAsset.kind,
      ownerRef: baseAsset.ownerRef,
      status: baseAsset.status,
      path: relativePath,
      url: relativePath || baseAsset.url,
      sourceUrl: baseAsset.sourceUrl,
      license: baseAsset.license,
      creator: baseAsset.creator,
      approved: baseAsset.approved
    });

    // Retorna asset com URL relativa para impedir JSON inflado
    return {
      ...baseAsset,
      url: relativePath || baseAsset.url
    };
  });

  // Também empacota quaisquer arquivos gerados por compilePublicStore
  for (const file of publicResult.filesToZip) {
    if (!zip.file(file.path)) {
      if (file.isBase64 && typeof file.data === 'string') {
        zip.file(file.path, file.data, { base64: true });
      } else {
        zip.file(file.path, file.data);
      }
    }
  }

  // site.json reimportável e livre de base64 gigante
  const out = {
    schemaVersion: s.schemaVersion,
    business: s.business,
    theme: s.theme,
    whatsapp: s.whatsapp,
    categories: s.categories,
    products: s.products,
    assets: processedAssets,
    prompts: s.prompts,
    layout: s.layout,
    messages: s.messages,
    rules: s.rules
  };

  const siteJsonString = JSON.stringify(out, null, 2);
  const siteJsonBytes = new TextEncoder().encode(siteJsonString).length;

  zip.file('site.json', siteJsonString);
  zip.file('store.public.json', publicResult.publicJsonString);
  zip.file('assets.manifest.json', JSON.stringify(manifest, null, 2));

  // Prompts apenas de assets pendentes
  const unapproved = s.assets.filter(a => !processedAssets.find(b => b.assetId === a.assetId)?.approved);
  zip.file(
    'PROMPT_ASSETS.md',
    unapproved.map(a => `## ${a.assetId}\n\n${promptFor(a, s)}`).join('\n\n')
  );

  zip.file('serve.cjs', server);
  zip.file('INICIAR_LOJA.bat', launcher);

  // Relatório de publicação / preview
  const publicationReport = `# Relatório de Publicação — ${s.business.name}
**Status:** ${isPreview ? '⚠️ PACOTE DE PREVIEW' : '✅ PRONTO PARA PUBLICAÇÃO PÚBLICA'}
**Data:** ${new Date().toISOString()}
**Tamanho do site.json:** ${(siteJsonBytes / 1024).toFixed(2)} KB
**Tamanho do store.public.json:** ${(publicResult.publicJsonBytes / 1024).toFixed(2)} KB
**Assets catalogados:** ${processedAssets.length} (${processedAssets.filter(a => a.approved).length} aprovados)

${
  isPreview
    ? `### ⚠️ Motivos do bloqueio para publicação comercial definitiva:\n${publicResult.validation.blockedReasons
        .map(r => `- ${r}`)
        .join('\n')}\n\n**Aviso:** O WhatsApp configurado é fictício ou existem assets obrigatórios pendentes. A loja funciona em modo PREVIEW com servidor local (\`INICIAR_LOJA.bat\`). Para torná-la comercial pública, forneça o telefone real do negócio e aprove as imagens.`
    : `### ✅ Validações Concluídas:
- Número de WhatsApp válido: ${s.whatsapp.phoneE164}
- Todos os assets obrigatórios resolvidos
- Zero base64 embutido nos JSONs públicos (imagens extraídas para assets/)
- Controles de edição (AssetModal, 'Trocar imagem') estritamente excluídos do runtime público.`
}
`;
  zip.file('RELATORIO_PUBLICACAO.md', publicationReport);

  const readme = `# ${s.business.name} — Loja ${isPreview ? '(Modo Preview)' : '(Produção)'}

Extraia o ZIP e execute **INICIAR_LOJA.bat** no Windows (Node.js instalado).
A loja abrirá automaticamente em http://localhost:5611/.
No macOS ou Linux: \`node serve.cjs\`.
Não precisa de npm, Vite ou do Genome Studio.

### Arquivos essenciais:
- \`index.html\`, \`assets/\` e \`site.json\` devem permanecer na mesma pasta.
- Imagens foram extraídas para a pasta \`assets/\` para garantir carregamento rápido.
- O checkout formata o pedido e abre diretamente o WhatsApp do comerciante.

${
  isPreview
    ? `> **ATENÇÃO (PREVIEW):** Este pacote contém número de demonstração fictício. Veja \`RELATORIO_PUBLICACAO.md\` para detalhes de configuração antes de atender clientes reais.`
    : `> **Status:** Configuração validada para atendimento comercial.`
}
`;
  zip.file('README.md', readme);

  return zip.generateAsync({ type: 'blob' });
}

export function download(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
