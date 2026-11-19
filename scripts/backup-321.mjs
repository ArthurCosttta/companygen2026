import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

export function deriveBackupKey(passphrase) {
  return createHash('sha256').update(String(passphrase || 'companygen-dev-backup-key')).digest();
}

export function encryptBufferAes256Gcm(plainBuffer, passphrase) {
  const key = deriveBackupKey(passphrase);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from('CG321V1', 'ascii'), iv, authTag, encrypted]);
}

export function decryptBufferAes256Gcm(cipherBuffer, passphrase) {
  const magic = cipherBuffer.subarray(0, 7).toString('ascii');
  if (magic !== 'CG321V1') {
    throw new Error('Cabeçalho de backup criptografado inválido.');
  }
  const iv = cipherBuffer.subarray(7, 19);
  const authTag = cipherBuffer.subarray(19, 35);
  const payload = cipherBuffer.subarray(35);
  const key = deriveBackupKey(passphrase);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(payload), decipher.final()]);
}

export async function runBackup321({
  sourceRoot,
  outputDir,
  passphrase = process.env.CG_BACKUP_PASSPHRASE || 'companygen-321-local-secret',
}) {
  await mkdir(outputDir, { recursive: true });
  const zip = new JSZip();
  let fileCount = 0;

  async function walk(dir, relBase = '') {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(fullPath, relPath);
      } else if (entry.name.endsWith('.json')) {
        const bytes = await readFile(fullPath);
        zip.file(relPath, bytes);
        fileCount += 1;
      }
    }
  }

  await walk(sourceRoot);
  const manifest = {
    createdAt: new Date().toISOString(),
    fileCount,
    strategy: '3-2-1 (AES-256-GCM + SHA-256)',
  };
  zip.file('_backup_manifest.json', JSON.stringify(manifest, null, 2));

  const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const encryptedBuf = encryptBufferAes256Gcm(zipBuf, passphrase);
  const sha256 = createHash('sha256').update(encryptedBuf).digest('hex');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outEncPath = path.join(outputDir, `companygen-backup-${stamp}.enc`);
  const outShaPath = `${outEncPath}.sha256`;
  await writeFile(outEncPath, encryptedBuf);
  await writeFile(outShaPath, `${sha256}  ${path.basename(outEncPath)}\n`, 'utf8');

  // Automated roundtrip integrity verification
  const readEnc = await readFile(outEncPath);
  const verifySha = createHash('sha256').update(readEnc).digest('hex');
  if (verifySha !== sha256) {
    throw new Error('Falha na verificação SHA-256 pós-escrita do backup.');
  }
  const decryptedZip = decryptBufferAes256Gcm(readEnc, passphrase);
  const reloaded = await JSZip.loadAsync(decryptedZip);
  const reloadedManifest = await reloaded.file('_backup_manifest.json')?.async('string');
  if (!reloadedManifest) {
    throw new Error('Roundtrip de restauração falhou: _backup_manifest.json ausente.');
  }

  return {
    ok: true,
    outEncPath,
    outShaPath,
    sha256,
    fileCount,
    sizeBytes: (await stat(outEncPath)).size,
    roundtripVerified: true,
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('backup-321.mjs')) {
  const sourceRoot = process.env.CG_DATA_DIR || path.join(os.homedir(), '.companygen', 'workspaces');
  const outputDir = process.env.CG_BACKUP_OUT_DIR || path.join(os.homedir(), '.companygen', 'backups');
  runBackup321({ sourceRoot, outputDir })
    .then((res) => console.log(JSON.stringify(res, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
