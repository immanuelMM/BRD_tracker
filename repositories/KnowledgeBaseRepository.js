import { randomUUID } from 'crypto';
import { Repository } from './Repository.js';
import { NV, INT, BIG } from './sqlTypes.js';

export class KnowledgeBaseRepository extends Repository {
  async list() {
    const { recordset } = await this.pool.request()
      .query('SELECT * FROM knowledge_base ORDER BY category ASC, sortOrder ASC, createdAt ASC');
    return recordset;
  }

  async create({ title, category, content, sortOrder }) {
    const id = randomUUID();
    const now = Date.now();
    await this.request([
      ['id', NV(36), id],
      ['title', NV(255), title],
      ['category', NV(100), category || 'General'],
      ['content', NV(), content],
      ['sortOrder', INT, sortOrder ?? 99],
      ['createdAt', BIG, now],
      ['updatedAt', BIG, now],
    ]).query(`INSERT INTO knowledge_base (id,title,category,content,sortOrder,createdAt,updatedAt)
              VALUES (@id,@title,@category,@content,@sortOrder,@createdAt,@updatedAt)`);
    return { id, title, category: category || 'General', content, sortOrder, createdAt: now, updatedAt: now };
  }

  async update(id, { title, category, content, sortOrder }) {
    const now = Date.now();
    await this.request([
      ['id', NV(36), id],
      ['title', NV(255), title || ''],
      ['category', NV(100), category || 'General'],
      ['content', NV(), content || ''],
      ['sortOrder', INT, sortOrder ?? 0],
      ['updatedAt', BIG, now],
    ]).query(`UPDATE knowledge_base SET title=@title, category=@category, content=@content,
              sortOrder=@sortOrder, updatedAt=@updatedAt WHERE id=@id`);
    return now;
  }

  async remove(id) {
    await this.request([['id', NV(36), id]])
      .query('DELETE FROM knowledge_base WHERE id = @id');
  }
}
