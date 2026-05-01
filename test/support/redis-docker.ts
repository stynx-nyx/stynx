import { execFile } from 'node:child_process';
import { Socket } from 'node:net';
import { promisify } from 'node:util';
import { createClient } from 'redis';

const execFileAsync = promisify(execFile);
const DOCKER_TIMEOUT_MS = 30_000;
const REDIS_READY_TIMEOUT_MS = 2_000;

export interface RedisDockerContainer {
  id: string;
  host: string;
  port: number;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function dockerHost(): string {
  return process.env.TESTCONTAINERS_HOST_OVERRIDE ?? '127.0.0.1';
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${ms}ms`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function waitForTcp(host: string, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timed out connecting to Redis at ${host}:${port}`));
    }, REDIS_READY_TIMEOUT_MS);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.connect(port, host);
  });
}

async function assertRedisReady(host: string, port: number): Promise<void> {
  await waitForTcp(host, port);
  const client = createClient({
    socket: {
      connectTimeout: REDIS_READY_TIMEOUT_MS,
    },
    url: `redis://${host}:${port}`,
  });
  client.on('error', () => undefined);
  try {
    await withTimeout(client.connect(), REDIS_READY_TIMEOUT_MS, `Redis connect ${host}:${port}`);
    await withTimeout(client.ping(), REDIS_READY_TIMEOUT_MS, `Redis ping ${host}:${port}`);
  } finally {
    if (client.isOpen) {
      await withTimeout(client.quit(), REDIS_READY_TIMEOUT_MS, `Redis quit ${host}:${port}`).catch(() => undefined);
    }
  }
}

export async function startRedisDockerContainer(): Promise<RedisDockerContainer> {
  const publish = process.env.TESTCONTAINERS_HOST_OVERRIDE ? '0.0.0.0::6379' : '127.0.0.1::6379';
  const { stdout } = await execFileAsync(
    'docker',
    [
      'run',
      '-d',
      '-e',
      'GLOG_minloglevel=2',
      '-p',
      publish,
      'redis:7-alpine',
    ],
    { timeout: DOCKER_TIMEOUT_MS },
  );
  const id = stdout.trim();

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const portResult = await execFileAsync(
      'docker',
      ['port', id, '6379/tcp'],
      { timeout: DOCKER_TIMEOUT_MS },
    );
    const match = portResult.stdout.trim().match(/:(\d+)$/u);
    if (match) {
      const port = Number(match[1]);
      const host = dockerHost();
      try {
        await assertRedisReady(host, port);
        return { id, host, port };
      } catch {
        // Redis may have a published port before it accepts connections.
      }
    }
    await sleep(500);
  }

  await execFileAsync('docker', ['rm', '-f', id], { timeout: DOCKER_TIMEOUT_MS });
  throw new Error('Redis container did not become ready');
}

export async function stopRedisDockerContainer(container: RedisDockerContainer | undefined): Promise<void> {
  if (!container) {
    return;
  }
  await execFileAsync('docker', ['rm', '-f', container.id], { timeout: DOCKER_TIMEOUT_MS });
}
