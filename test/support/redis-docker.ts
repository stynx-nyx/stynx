import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from 'redis';

const execFileAsync = promisify(execFile);

export interface RedisDockerContainer {
  id: string;
  port: number;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startRedisDockerContainer(): Promise<RedisDockerContainer> {
  const { stdout } = await execFileAsync('docker', ['run', '-d', '-p', '127.0.0.1::6379', 'redis:7-alpine']);
  const id = stdout.trim();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const portResult = await execFileAsync('docker', ['port', id, '6379/tcp']);
    const match = portResult.stdout.trim().match(/:(\d+)$/u);
    if (match) {
      const port = Number(match[1]);
      const client = createClient({ url: `redis://127.0.0.1:${port}` });
      try {
        await client.connect();
        await client.ping();
        await client.quit();
        return { id, port };
      } catch {
        if (client.isOpen) {
          await client.quit();
        }
      }
    }
    await sleep(500);
  }

  await execFileAsync('docker', ['rm', '-f', id]);
  throw new Error('Redis container did not become ready');
}

export async function stopRedisDockerContainer(container: RedisDockerContainer | undefined): Promise<void> {
  if (!container) {
    return;
  }
  await execFileAsync('docker', ['rm', '-f', container.id]);
}
