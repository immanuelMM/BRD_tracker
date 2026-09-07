import { randomUUID } from 'crypto';
import { Repository } from './Repository.js';
import { NV, INT, BIG } from './sqlTypes.js';

export class PmNoteRepository extends Repository {
  async list() {
    const { recordset } = await this.pool.request()
      .query('SELECT * FROM pm_notes ORDER BY createdAt DESC');
    return recordset;
  }

  async create({ title, content, quarter, year, sprint, priority, status, brdId }) {
    const id = randomUUID();
    const now = Date.now();
    await this.request([
      ['id', NV(36), id],
      ['title', NV(255), title || ''],
      ['content', NV(), content || ''],
      ['quarter', NV(5), quarter || null],
      ['year', INT, year || new Date().getFullYear()],
      ['sprint', NV(20), sprint || null],
      ['priority', NV(20), priority || 'medium'],
      ['status', NV(20), status || 'todo'],
      ['brdId', NV(), brdId || null],
      ['createdAt', BIG, now],
      ['updatedAt', BIG, now],
    ]).query(`INSERT INTO pm_notes (id,title,content,quarter,year,sprint,priority,status,brdId,createdAt,updatedAt)
              VALUES (@id,@title,@content,@quarter,@year,@sprint,@priority,@status,@brdId,@createdAt,@updatedAt)`);
    return { id, title, content, quarter, year, sprint, priority, status, brdId, createdAt: now, updatedAt: now };
  }

  async update(id, { title, content, quarter, year, sprint, priority, status, brdId }) {
    const updatedAt = Date.now();
    await this.request([
      ['id', NV(36), id],
      ['title', NV(255), title || ''],
      ['content', NV(), content || ''],
      ['quarter', NV(5), quarter || null],
      ['year', INT, year || new Date().getFullYear()],
      ['sprint', NV(20), sprint || null],
      ['priority', NV(20), priority || 'medium'],
      ['status', NV(20), status || 'todo'],
      ['brdId', NV(), brdId || null],
      ['updatedAt', BIG, updatedAt],
    ]).query(`UPDATE pm_notes SET title=@title,content=@content,quarter=@quarter,year=@year,
              sprint=@sprint,priority=@priority,status=@status,brdId=@brdId,updatedAt=@updatedAt
              WHERE id=@id`);
  }

  async remove(id) {
    await this.request([['id', NV(36), id]])
      .query('DELETE FROM pm_notes WHERE id = @id');
  }
}
