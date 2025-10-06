import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import chalk from 'chalk';
import { baseAwsConfig, ensureDryRun } from './aws';
import { invalidateDistribution, CloudFrontEnsureInput } from './cloudfront';

export interface FrontendDeployOptions {
  appName: string;
  region: string;
  profile?: string;
  dryRun?: boolean;
  debug?: boolean;
  bucketName: string;
  distributionId?: string;
  distributionDomain?: string;
  invalidate?: boolean;
}

function run(command: string, args: string[], cwd: string, dryRun?: boolean): Promise<void> {
  if (dryRun) {
    // eslint-disable-next-line no-console
    console.log(chalk.yellow(`dry-run: ${command} ${args.join(' ')} (cwd=${cwd})`));
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: process.env });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function detectContentType(file: string): string {
  const ext = path.extname(file).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html';
    case '.js':
      return 'application/javascript';
    case '.css':
      return 'text/css';
    case '.json':
      return 'application/json';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.ico':
      return 'image/x-icon';
    case '.txt':
      return 'text/plain';
    case '.webmanifest':
      return 'application/manifest+json';
    default:
      return 'application/octet-stream';
  }
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function buildFrontend(options: FrontendDeployOptions): Promise<void> {
  await run('npm', ['run', 'build', '--workspace', 'frontend'], process.cwd(), options.dryRun);
}

export async function deployFrontend(options: FrontendDeployOptions): Promise<{ bucket: string; distributionDomain?: string }> {
  const distRoot = path.resolve(process.cwd(), 'frontend/dist');
  const entries = await fs.readdir(distRoot);
  if (entries.length === 0) {
    throw new Error('frontend/dist is empty – run build first');
  }
  const buildDir = entries.length === 1 ? path.join(distRoot, entries[0]) : distRoot;
  const files = await walkFiles(buildDir);
  const s3 = new S3Client(baseAwsConfig({
    region: options.region,
    profile: options.profile,
    dryRun: options.dryRun,
    debug: options.debug,
    appName: options.appName,
  }));
  for (const file of files) {
    const key = path.relative(buildDir, file).replace(/\\/g, '/');
    if (options.dryRun) {
      // eslint-disable-next-line no-console
      console.log(chalk.yellow(`dry-run: upload s3://${options.bucketName}/${key}`));
      continue;
    }
    const body = await fs.readFile(file);
    await s3.send(
      new PutObjectCommand({
        Bucket: options.bucketName,
        Key: key,
        Body: body,
        ContentType: detectContentType(file),
        CacheControl: key.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000',
      }),
    );
  }
  if (options.invalidate && options.distributionId) {
    await invalidateDistribution({
      appName: options.appName,
      bucketDomain: `${options.bucketName}.s3.amazonaws.com`,
      profile: options.profile,
      region: options.region,
      dryRun: options.dryRun,
      debug: options.debug,
    } as CloudFrontEnsureInput, options.distributionId);
  }
  return { bucket: options.bucketName, distributionDomain: options.distributionDomain };
}
