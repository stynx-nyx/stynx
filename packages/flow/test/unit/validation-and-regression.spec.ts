import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FlowAdapterRegistry, type FlowDomainAdapter } from '../../src/adapters';
import { FlowDesignService } from '../../src/flow-design.service';
import {
  answerWriteSchema,
  createNodeSchema,
  ensureRunSchema,
  parseDto,
} from '../../src/validation';

function sourceFiles(dir: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      entries.push(...sourceFiles(path));
    } else if (path.endsWith('.ts')) {
      entries.push(path);
    }
  }
  return entries;
}

describe('Flow validation and regression guards', () => {
  it('rejects invalid workflow DTOs before they reach the database', () => {
    expect(() => parseDto(createNodeSchema, {
      graphId: '01978f4a-32bf-7c27-a131-fd73a9e001a1',
      code: 'review',
      kind: 'manual',
    })).toThrow(BadRequestException);

    expect(() => parseDto(ensureRunSchema, {
      graphCode: 'approval',
      targetId: 'target-1',
    })).toThrow(BadRequestException);
  });

  it('accepts answer writes identified by itemId before normalization', () => {
    expect(parseDto(answerWriteSchema, {
      itemId: '01978f4a-32bf-7c27-a131-fd73a9e001a1',
      value: true,
    })).toMatchObject({ itemId: '01978f4a-32bf-7c27-a131-fd73a9e001a1' });
  });

  it('rejects invalid graph imports with duplicate or missing node references', () => {
    const service = new FlowDesignService({} as never, {} as never);
    const graph = {
      scopeId: '01978f4a-32bf-7c27-a131-fd73a9e001a1',
      code: 'approval',
      version: 'v1',
    };

    expect(() => service.importGraph({
      graph,
      nodes: [
        { code: 'start', kind: 'start' },
        { code: 'start', kind: 'human' },
      ],
    })).toThrow(BadRequestException);

    expect(() => service.importGraph({
      graph,
      nodes: [
        { code: 'start', kind: 'start' },
        { code: 'review', kind: 'human' },
      ],
      edges: [{ fromNodeCode: 'review', toNodeCode: 'missing' }],
    })).toThrow(BadRequestException);
  });

  it('wraps domain adapter failures without leaking domain implementation details', async () => {
    const adapter: FlowDomainAdapter = {
      key: 'failing',
      async buildFacts() {
        throw new Error('domain exploded');
      },
      async applyEffect() {
        return { ok: true };
      },
      async canManage() {
        return true;
      },
      async canView() {
        return true;
      },
    };
    const registry = new FlowAdapterRegistry([adapter]);

    await expect(registry.buildFacts({
      tenantId: '01978f4a-32bf-7c27-a131-fd73a9e001a1',
      adapterKey: 'failing',
      targetType: 'generic',
      targetId: 'target-1',
    })).rejects.toThrow(BadGatewayException);
  });

  it('keeps generic Flow source free of PORM/CMS domain coupling', () => {
    const forbidden = /\b(cms\.content|porm\.opportunity|porm\.proposal|porm\.engagement)\b/;
    const offenders = sourceFiles(join(__dirname, '../../src'))
      .filter((path) => forbidden.test(readFileSync(path, 'utf8')));

    expect(offenders).toEqual([]);
  });
});
