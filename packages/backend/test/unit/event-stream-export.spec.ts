import * as Backend from '../../src';
import { StynxEventStreamModule } from '../../src/event-stream/event-stream.module';
import { StynxEventStreamService } from '../../src/event-stream/event-stream.service';
import { STYNX_SSE_CONTEXT_RUNNER, STYNX_SSE_METRICS, STYNX_SSE_SCHEDULER } from '../../src/event-stream/tokens';
import type {
  EventStreamContextRunner, EventStreamCursor, EventStreamMetricsSink,
  EventStreamRow, EventStreamScheduler, EventStreamSource,
  StynxEventStreamOptions, StynxSseRequest, StynxSseResponse, StynxSseScope,
} from '../../src';

type PublicSseTypes = [
  EventStreamContextRunner, EventStreamCursor, EventStreamMetricsSink,
  EventStreamRow, EventStreamScheduler, EventStreamSource<EventStreamRow>,
  StynxEventStreamOptions<EventStreamRow>, StynxSseRequest, StynxSseResponse, StynxSseScope,
];
const publicTypesExist: PublicSseTypes | undefined = undefined;
void publicTypesExist;

describe('@stynx-nyx/backend SSE public exports', () => {
  it('surfaces the service, module, and injection tokens through the package barrel', () => {
    expect(Backend.StynxEventStreamModule).toBe(StynxEventStreamModule);
    expect(Backend.StynxEventStreamService).toBe(StynxEventStreamService);
    expect(Backend.STYNX_SSE_CONTEXT_RUNNER).toBe(STYNX_SSE_CONTEXT_RUNNER);
    expect(Backend.STYNX_SSE_SCHEDULER).toBe(STYNX_SSE_SCHEDULER);
    expect(Backend.STYNX_SSE_METRICS).toBe(STYNX_SSE_METRICS);
  });
});
