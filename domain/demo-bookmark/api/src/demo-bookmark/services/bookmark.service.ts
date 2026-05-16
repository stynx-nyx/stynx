// Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692
/* Generated for demo/Bookmark — spec: 0.1.0 sha: a5553692 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bookmark } from '../entities/bookmark.entity';
import { CreateBookmarkDto } from '../dto/create-bookmark.dto';
import { UpdateBookmarkDto } from '../dto/update-bookmark.dto';

@Injectable()
export class BookmarkService {
  constructor(
    @InjectRepository(Bookmark)
    private readonly repo: Repository<Bookmark>,
  ) {}

  findAll() {
    return this.repo.find({ order: { created_at: 'DESC' } });
  }

  findOne(id: string) {
    return this.repo.findOneOrFail({ where: { id } });
  }

  create(dto: CreateBookmarkDto) {
    const entity = this.repo.create({ ...dto });
    return this.repo.save(entity);
  }

  update(id: string, dto: UpdateBookmarkDto) {
    return this.repo.save({ id, ...dto });
  }

  remove(id: string) {
    return this.repo.delete(id);
  }
}
