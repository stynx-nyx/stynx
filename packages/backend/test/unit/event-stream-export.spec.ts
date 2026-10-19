import * as Backend from '../../src/index.js';
import { StynxEventStreamModule } from '../../src/event-stream/event-stream.module.js';
import { StynxEventStreamService } from '../../src/event-stream/event-stream.service.js';
import { STYNX_SSE_CONTEXT_RUNNER, STYNX_SSE_METRICS, STYNX_SSE_SCHEDULER } from '../../src/event-stream/tokens.js';
import type {
  EventStreamContextRunner, EventStreamCursor, EventStreamMetricsSink,
  EventStreamRow, EventStreamScheduler, EventStreamSource,
  StynxEventStreamOptions, StynxSseRequest, StynxSseResponse, StynxSseScope,
} from '../../src/index.js';

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
