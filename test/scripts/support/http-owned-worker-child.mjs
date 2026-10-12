import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Tiny genuine IPC process only. No application, listener or external service.
if (process.argv[2] === 'descendant') {
  setTimeout(() => {
    writeFileSync(process.argv[3], JSON.stringify({ pid: process.pid, naturalExit: true }));
  }, 1800);
} else {
  const deadline = setTimeout(() => {
    if (process.connected) process.disconnect();
  }, 12_000);
  let descendant;
  if (process.argv[2] === 'with-descendant') {
    descendant = spawn(
      process.execPath,
      [fileURLToPath(import.meta.url), 'descendant', process.argv[3]],
      {
        env: { PATH: process.env.PATH, NODE_DISABLE_COMPILE_CACHE: '1' },
        detached: false,
        stdio: 'ignore',
      },
    );
    descendant.unref();
  }
  process.stdout.write('owned native worker\n');
  process.send({ ready: true, pid: process.pid, descendantPid: descendant?.pid ?? null });
  process.on('message', (message) => {
    if (message?.action !== 'exit') return;
    process.send({ exiting: true, pid: process.pid }, () => {
      clearTimeout(deadline);
      process.disconnect();
    });
  });
}
