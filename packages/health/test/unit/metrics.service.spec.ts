import { StynxMetricsService } from '../../src/metrics.service';

describe('StynxMetricsService', () => {
  it('renders baseline prometheus metrics', async () => {
    const metrics = new StynxMetricsService();
    const output = await metrics.render();

    expect(output).toContain('http_request_total');
    expect(output).toContain('session_active_total');
  });
});
