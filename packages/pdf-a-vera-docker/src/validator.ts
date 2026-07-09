import {
  PDF_A_VALIDATION_ATTEMPTS_TOTAL,
  PDF_A_VALIDATION_DURATION_MS,
  PDF_A_VALIDATION_ERRORS_TOTAL,
} from '@stynx-nyx/pdf-a';
import type {
  PdfAValidateOptions,
  PdfAValidationLogger,
  PdfAValidationResult,
  PdfAValidator,
} from '@stynx-nyx/pdf-a';
import { DEFAULT_VERAPDF_IMAGE, DEFAULT_VERAPDF_TIMEOUT_MS } from './constants';
import { runVeraPdfDocker } from './docker';
import type { VeraPdfDockerRunner } from './docker';
import { VeraPdfDockerError } from './errors';
import { parseVeraPdfJson } from './parse-report';

export interface VeraPdfDockerValidatorOptions {
  image?: string;
  dockerBin?: string;
  timeoutMs?: number;
  logger?: PdfAValidationLogger;
  runner?: VeraPdfDockerRunner;
}

export class VeraPdfDockerValidator implements PdfAValidator {
  private readonly image: string;
  private readonly dockerBin: string;
  private readonly timeoutMs: number;
  private readonly logger: PdfAValidationLogger | undefined;
  private readonly runner: VeraPdfDockerRunner;

  constructor(options: VeraPdfDockerValidatorOptions = {}) {
    this.image = options.image ?? process.env.STYNX_VERAPDF_IMAGE ?? DEFAULT_VERAPDF_IMAGE;
    this.dockerBin = options.dockerBin ?? process.env.STYNX_VERAPDF_DOCKER_BIN ?? 'docker';
    this.timeoutMs =
      options.timeoutMs ?? parseTimeout(process.env.STYNX_VERAPDF_TIMEOUT_MS) ?? DEFAULT_VERAPDF_TIMEOUT_MS;
    this.logger = options.logger;
    this.runner = options.runner ?? runVeraPdfDocker;
  }

  async validate(pdf: Uint8Array, opts: PdfAValidateOptions = {}): Promise<PdfAValidationResult> {
    const startedAt = Date.now();
    await this.emitAttempt(opts);
    const run = await this.runner({
      dockerBin: this.dockerBin,
      image: this.image,
      flavour: flavourFrom(opts),
      pdf,
      timeoutMs: this.timeoutMs,
    });
    const durationMs = Date.now() - startedAt;

    if (run.timedOut) {
      const timeout = timeoutResult(durationMs);
      await this.emitResult(timeout, opts);
      return timeout;
    }

    const parsed = parseVeraPdfReport(run.stdout);
    if (run.exitCode !== 0 && !parsed) {
      throw new VeraPdfDockerError(
        `veraPDF Docker validation failed with exit code ${run.exitCode ?? 'unknown'}: ${summarizeStderr(run.stderr)}`,
      );
    }

    const result = { ...(parsed ?? parseVeraPdfJson(run.stdout)), durationMs };
    await this.emitResult(result, opts);
    return result;
  }

  private async emitAttempt(opts: PdfAValidateOptions): Promise<void> {
    await this.logger?.increment?.(PDF_A_VALIDATION_ATTEMPTS_TOTAL, {
      flavour: flavourFrom(opts),
    });
  }

  private async emitResult(result: PdfAValidationResult, opts: PdfAValidateOptions): Promise<void> {
    await this.logger?.observe?.(PDF_A_VALIDATION_DURATION_MS, result.durationMs, {
      flavour: flavourFrom(opts),
      valid: String(result.valid),
    });
    for (const error of result.errors) {
      await this.logger?.increment?.(PDF_A_VALIDATION_ERRORS_TOTAL, {
        rule_id: error.ruleId,
      });
    }
    this.logger?.log?.(
      `pdf/a validation completed valid=${result.valid} durationMs=${result.durationMs} errorCount=${result.errors.length}`,
    );
  }
}

export function flavourFrom(opts: PdfAValidateOptions = {}): string {
  return `${(opts.version ?? 'A-2').replace('A-', '')}${opts.conformance ?? 'b'}`.toLowerCase();
}

function parseTimeout(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function timeoutResult(durationMs: number): PdfAValidationResult {
  return {
    valid: false,
    declared: null,
    rulesetVersion: 'veraPDF Docker',
    validatedAt: new Date().toISOString(),
    durationMs,
    errors: [
      {
        ruleId: 'stynx.timeout',
        severity: 'error',
        clause: 'STYNX-PDF-A-R12',
        message: 'veraPDF Docker validation timed out.',
      },
    ],
  };
}

function summarizeStderr(stderr: string): string {
  const firstLine = stderr
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ?? 'no stderr output';
}

function parseVeraPdfReport(raw: string): PdfAValidationResult | undefined {
  if (raw.trim().length === 0) {
    return undefined;
  }
  try {
    return parseVeraPdfJson(raw);
  } catch {
    return undefined;
  }
}
