import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';

type A11yReportEntry = {
  title: string;
  file: string;
  project: string;
  url: string;
  status: 'passed' | 'scan-error';
  violationCount: number;
  violations: Array<{
    id: string;
    impact: string | null;
    description: string;
    nodes: number;
  }>;
  error?: string;
};

const reportPath = resolve(process.cwd(), '.test-results/a11y.json');
const lockPath = resolve(process.cwd(), '.test-results/a11y.lock');

async function acquireLock(): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await mkdir(lockPath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error('Timed out waiting for a11y report lock');
}

async function appendA11yEntry(entry: A11yReportEntry): Promise<void> {
  await mkdir(dirname(reportPath), { recursive: true });
  await acquireLock();
  try {
    let current: A11yReportEntry[] = [];
    try {
      current = JSON.parse(await readFile(reportPath, 'utf8')) as A11yReportEntry[];
    } catch {
      current = [];
    }
    current.push(entry);
    await writeFile(reportPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

export async function scanA11y(page: Page, testInfo: TestInfo): Promise<void> {
  try {
    const result = await new AxeBuilder({ page }).analyze();
    await appendA11yEntry({
      title: testInfo.title,
      file: testInfo.file,
      project: testInfo.project.name,
      url: page.url(),
      status: 'passed',
      violationCount: result.violations.length,
      violations: result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact ?? null,
        description: violation.description,
        nodes: violation.nodes.length,
      })),
    });
  } catch (error) {
    await appendA11yEntry({
      title: testInfo.title,
      file: testInfo.file,
      project: testInfo.project.name,
      url: page.url(),
      status: 'scan-error',
      violationCount: 0,
      violations: [],
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
