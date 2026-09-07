import { randomUUID } from 'crypto';
import { Repository } from './Repository.js';
import { NV, INT, BIG } from './sqlTypes.js';

export class CriteriaRepository extends Repository {
  async list() {
    const { recordset } = await this.pool.request()
      .query('SELECT * FROM bug_criteria ORDER BY sortOrder ASC, createdAt ASC');
    return recordset;
  }

  async create({ label, value, color, description, sortOrder }) {
    const id = randomUUID();
    const createdAt = Date.now();
    await this.request([
      ['id', NV(36), id],
      ['value', NV(100), value],
      ['label', NV(255), label],
      ['color', NV(20), color || '#3b82f6'],
      ['description', NV(), description || ''],
      ['sortOrder', INT, sortOrder ?? 99],
      ['createdAt', BIG, createdAt],
    ]).query(`INSERT INTO bug_criteria (id,value,label,color,description,sortOrder,createdAt)
              VALUES (@id,@value,@label,@color,@description,@sortOrder,@createdAt)`);
    return { id, value, label, color, description, sortOrder, createdAt };
  }

  async update(id, { label, color, description, sortOrder }) {
    await this.request([
      ['id', NV(36), id],
      ['label', NV(255), label || ''],
      ['color', NV(20), color || '#3b82f6'],
      ['description', NV(), description || ''],
      ['sortOrder', INT, sortOrder ?? 0],
    ]).query(`UPDATE bug_criteria SET label=@label, color=@color,
              description=@description, sortOrder=@sortOrder WHERE id=@id`);
  }

  // Returns null on success, or { status, body } if the caller should short-circuit.
  async remove(id) {
    const { recordset: rows } = await this.request([['id', NV(36), id]])
      .query('SELECT value FROM bug_criteria WHERE id = @id');
    if (!rows.length) return { status: 404, body: { error: 'Not found' } };

    const { value } = rows[0];
    const { recordset: [{ bugCount }] } = await this.request([['criteria', NV(100), value]])
      .query('SELECT COUNT(*) AS bugCount FROM bugs WHERE criteria = @criteria');

    if (bugCount > 0) {
      return { status: 409, body: { error: `Cannot delete: ${bugCount} bug(s) use this criterion`, bugCount } };
    }

    await this.request([['id', NV(36), id]])
      .query('DELETE FROM bug_criteria WHERE id = @id');
    return null;
  }
}
