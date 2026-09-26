import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('public tenant route tooling contract', () => {
  it('classifies @PublicTenantRoute as an explicit public route in the route inventory', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'stynx-public-tenant-route-'));
    try {
      const source = join(workspace, 'packages', 'portal', 'src');
      mkdirSync(source, { recursive: true });
      writeFileSync(join(workspace, 'packages', 'portal', 'package.json'), '{"name":"@fixture/portal"}\n');
      writeFileSync(join(source, 'portal.controller.ts'), `
        @Controller('/portal')
        export class PortalController {
          @PublicTenantRoute({ optionalAuth: true })
          @Get('/status')
          status() { return {}; }
        }
      `);

      const routeTool = await import('../../../../scripts/list-routes.mjs');
      const [route] = routeTool.collectRoutes({ repoRoot: workspace });

      expect(route).toMatchObject({
        package: '@fixture/portal',
        method: 'GET',
        path: '/portal/status',
        permissions: 'public-tenant',
      });
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
