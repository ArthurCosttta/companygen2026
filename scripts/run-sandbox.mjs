import { spawn } from 'node:child_process';
import process from 'node:process';

const windows = process.platform === 'win32';
const cmd = windows ? (process.env.ComSpec || 'cmd.exe') : 'npx';
const args = windows ? ['/d', '/s', '/c', 'npx vite'] : ['vite'];

const child = spawn(cmd, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    CG_PERSISTENCE: 'local',
    CG_LOCAL_SHOWCASE: '1',
    VITE_CG_LOCAL_SHOWCASE: '1',
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
