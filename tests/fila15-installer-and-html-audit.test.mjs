import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';

const execFileAsync = promisify(execFile);

const INSTALL_PS1 =
  'C:/Users/arthur/.gemini/antigravity/scratch/companygen-firebase-deploy/public/install.ps1';

test('QA15-01: install.ps1 aborta imediatamente com código 2 se 1 caractere do SHA-256 divergir e aprova hash exato em DryRun', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cg-qa15-ps1-'));
  try {
    const fakeExe = path.join(tmpDir, 'fake-installer.exe');
    const payload = Buffer.from('MZ-COMPANYGEN-QA15-TEST-BINARY-PAYLOAD');
    await writeFile(fakeExe, payload);
    const realSha = crypto.createHash('sha256').update(payload).digest('hex').toUpperCase();
    const tamperedSha = (realSha[0] === 'A' ? 'B' : 'A') + realSha.slice(1);

    // 1. Manifesto com hash adulterado (1 char trocado) -> DEVE ABORTAR com exitCode 2
    const badManifestPath = path.join(tmpDir, 'bad-manifest.json');
    await writeFile(
      badManifestPath,
      JSON.stringify({ version: '1.1.0', url: fakeExe, sha256: tamperedSha }),
      'utf8',
    );

    let failedAsExpected = false;
    try {
      await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `$env:CG_MANIFEST_PATH='${badManifestPath}'; $env:CG_DRYRUN='1'; Get-Content -Raw '${INSTALL_PS1}' | iex`]);
    } catch (err) {
      failedAsExpected = true;
      assert.match(String(err.stdout || ''), /ERRO DE SEGURANCA/i);
    }
    assert.equal(failedAsExpected, true, 'install.ps1 deveria ter abortado com hash adulterado');

    // 2. Manifesto com hash SHA-256 exato -> DryRun retorna 0
    const goodManifestPath = path.join(tmpDir, 'good-manifest.json');
    await writeFile(
      goodManifestPath,
      JSON.stringify({ version: '1.1.0', url: fakeExe, sha256: realSha }),
      'utf8',
    );

    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `$env:CG_MANIFEST_PATH='${goodManifestPath}'; $env:CG_DRYRUN='1'; Get-Content -Raw '${INSTALL_PS1}' | iex`]);
    assert.match(stdout, /Integridade confirmada/i);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('QA15-02: Zero botões de download direto de .exe nos HTMLs públicos e em WhatsAppView.tsx', async () => {
  const filesToAudit = [
    'C:/Users/arthur/.gemini/antigravity/scratch/companygen-oportunidades-v5/index.html',
    'C:/Users/arthur/.gemini/antigravity/scratch/companygen-firebase-deploy/public/index.html',
    'C:/Users/arthur/.gemini/antigravity/scratch/companygen-firebase-deploy/public/obrigado.html',
    'C:/Users/arthur/.gemini/antigravity/scratch/companygen-firebase-deploy/public/download/index.html',
    'C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/src/components/views/WhatsAppView.tsx',
  ];

  for (const file of filesToAudit) {
    const content = await readFile(file, 'utf8');
    assert.ok(
      !content.includes('CompanyGen-Setup'),
      `Referência direta a CompanyGen-Setup encontrada em ${file}`,
    );
    assert.ok(
      !content.includes('Baixar para Windows (.exe)'),
      `Botão "Baixar para Windows (.exe)" ainda presente em ${file}`,
    );
  }

  const downloadHtml = await readFile(
    'C:/Users/arthur/.gemini/antigravity/scratch/companygen-firebase-deploy/public/download/index.html',
    'utf8',
  );
  assert.ok(
    downloadHtml.includes('irm https://companygen.store/install.ps1 | iex'),
    '/download/index.html deve exibir o comando exato do PowerShell',
  );

  const landingHtml = await readFile(
    'C:/Users/arthur/.gemini/antigravity/scratch/companygen-firebase-deploy/public/index.html',
    'utf8',
  );
  assert.ok(landingHtml.includes('20 créditos'), 'Landing deve exibir plano de 20 créditos');
  assert.ok(landingHtml.includes('55 créditos'), 'Landing deve exibir plano de 55 créditos');
  assert.ok(landingHtml.includes('250 créditos'), 'Landing deve exibir plano de 250 créditos');
});

test('QA15-04: package.json configurado com v1.1.0, asInvoker e instalação por usuário sem UAC', async () => {
  const pkgRaw = await readFile(
    'C:/Users/arthur/.gemini/antigravity/scratch/companygen-post-studio/package.json',
    'utf8',
  );
  const pkg = JSON.parse(pkgRaw);
  assert.equal(pkg.version, '1.1.0');
  assert.equal(pkg.build?.win?.requestedExecutionLevel, 'asInvoker');
  assert.equal(pkg.build?.nsis?.perMachine, false);
  assert.equal(pkg.build?.nsis?.allowElevation, false);
});
