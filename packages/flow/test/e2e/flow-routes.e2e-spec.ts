import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { FlowFillsController } from '../../src/controllers/fills.controller';
import { FlowFormsController } from '../../src/controllers/forms.controller';
import { FlowRunsController } from '../../src/controllers/runs.controller';
import { FlowTasksController } from '../../src/controllers/tasks.controller';

function route(controller: Function, handler: string) {
  const basePath = Reflect.getMetadata(PATH_METADATA, controller) as string;
  const methodPath = Reflect.getMetadata(PATH_METADATA, controller.prototype[handler]) as string;
  const method = Reflect.getMetadata(
    METHOD_METADATA,
    controller.prototype[handler],
  ) as RequestMethod;
  return { method, path: `${basePath}${methodPath}`.replace(/\/+/g, '/') };
}

describe('Flow package HTTP route E2E contract', () => {
  it('keeps the generic runtime route families mounted', () => {
    expect(route(FlowRunsController, 'summary')).toEqual({
      method: RequestMethod.GET,
      path: '/flow/runs/summary',
    });
    expect(route(FlowTasksController, 'act')).toEqual({
      method: RequestMethod.POST,
      path: '/flow/tasks/:id/act',
    });
    expect(route(FlowFormsController, 'createFill')).toEqual({
      method: RequestMethod.POST,
      path: '/flow/forms/:formId/fills',
    });
    expect(route(FlowFillsController, 'waivers')).toEqual({
      method: RequestMethod.GET,
      path: '/flow/fills/:fillId/waivers',
    });
  });
});
