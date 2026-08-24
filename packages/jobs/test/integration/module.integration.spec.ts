import { JobsRegistry, JobsService, JobsWorker, StynxJobsModule } from '../../src/index';

describe('jobs module wiring', () => {
  it('exports the public scheduling providers and registers configured handlers', () => {
    const module = StynxJobsModule.forRoot({ handlers: { 'worklist.sla-check': async () => undefined } });
    expect(module.exports).toEqual(expect.arrayContaining([JobsService, JobsRegistry, JobsWorker]));
    expect(module.providers).toHaveLength(8);
  });
});
