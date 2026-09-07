import { randomUUID } from 'crypto';
import { Repository } from './Repository.js';
import { NV, INT, BIG } from './sqlTypes.js';

export class TestScenarioKbRepository extends Repository {
  async list() {
    const { recordset } = await this.pool.request()
      .query('SELECT * FROM test_scenario_kb ORDER BY createdAt DESC');
    return recordset;
  }

  async create({ title, category, content, fileName, sortOrder }) {
    const id = randomUUID();
    const now = Date.now();
    await this.request([
      ['id', NV(36), id],
      ['title', NV(255), title],
      ['category', NV(100), category || 'General'],
      ['fileName', NV(255), fileName || null],
      ['content', NV(), content],
      ['sortOrder', INT, sortOrder ?? 0],
      ['createdAt', BIG, now],
      ['updatedAt', BIG, now],
    ]).query(`INSERT INTO test_scenario_kb (id,title,category,fileName,content,sortOrder,createdAt,updatedAt)
              VALUES (@id,@title,@category,@fileName,@content,@sortOrder,@createdAt,@updatedAt)`);
    return { id, title, category: category || 'General', fileName: fileName || null, content, sortOrder: sortOrder ?? 0, createdAt: now, updatedAt: now };
  }

  async update(id, { title, category, content, fileName, sortOrder }) {
    const now = Date.now();
    await this.request([
      ['id', NV(36), id],
      ['title', NV(255), title || ''],
      ['category', NV(100), category || 'General'],
      ['fileName', NV(255), fileName || null],
      ['content', NV(), content || ''],
      ['sortOrder', INT, sortOrder ?? 0],
      ['updatedAt', BIG, now],
    ]).query(`UPDATE test_scenario_kb SET title=@title, category=@category, fileName=@fileName,
              content=@content, sortOrder=@sortOrder, updatedAt=@updatedAt WHERE id=@id`);
    return now;
  }

  async remove(id) {
    await this.request([['id', NV(36), id]])
      .query('DELETE FROM test_scenario_kb WHERE id = @id');
  }
}
