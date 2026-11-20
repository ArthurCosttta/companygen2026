import fs from 'node:fs';
import path from 'node:path';

export default async function afterPack(context) {
  const localesDir = path.join(context.appOutDir, 'locales');
  if (!fs.existsSync(localesDir)) return;
  const keep = new Set(['pt-BR.pak', 'en-US.pak']);
  for (const file of fs.readdirSync(localesDir)) {
    if (!keep.has(file)) {
      fs.rmSync(path.join(localesDir, file), { force: true });
    }
  }
}
