// C-4 Session S3-2 — service stub
//
// The scaffolder emitted a TypeORM-shaped service (InjectRepository +
// Repository<Bookmark>); stynx uses @stynx/data (drizzle-orm based),
// not TypeORM. Filed as D-A-15.
//
// This stub has the right method signatures but every method throws
// NotImplementedException with a clear hand-finishing pointer. That keeps
// the module compilable + DI-resolvable while making it loud that S3-2-
// step-2 needs to wire the real Postgres-backed queries.
//
// Hand-finishing reference: reference/api/src/sample/reference-sample.service.ts
// shows the canonical stynx service shape — constructor injection of
// `Database`, `RequestContext`, and dependent services from @stynx/*.

import { Injectable, NotImplementedException } from '@nestjs/common';
import type { Bookmark } from '../entities/bookmark.entity';
import type { CreateBookmarkDto } from '../dto/create-bookmark.dto';
import type { UpdateBookmarkDto } from '../dto/update-bookmark.dto';

const STEP_2_HINT =
  'Hand-finish in C-4 Session S3-2-step-2: wire to @stynx/data Database + drizzle schema. See reference/api/src/sample/reference-sample.service.ts.';

@Injectable()
export class BookmarkService {
  findAll(): Promise<Bookmark[]> {
    throw new NotImplementedException(`BookmarkService.findAll: ${STEP_2_HINT}`);
  }

  findOne(_id: string): Promise<Bookmark> {
    throw new NotImplementedException(`BookmarkService.findOne: ${STEP_2_HINT}`);
  }

  create(_dto: CreateBookmarkDto): Promise<Bookmark> {
    throw new NotImplementedException(`BookmarkService.create: ${STEP_2_HINT}`);
  }

  update(_id: string, _dto: UpdateBookmarkDto): Promise<Bookmark> {
    throw new NotImplementedException(`BookmarkService.update: ${STEP_2_HINT}`);
  }

  remove(_id: string): Promise<void> {
    throw new NotImplementedException(`BookmarkService.remove: ${STEP_2_HINT}`);
  }
}
