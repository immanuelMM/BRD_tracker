import { randomUUID } from 'crypto';
import { Repository } from './Repository.js';
import { NV, INT, BIG } from './sqlTypes.js';

export class TShirtSizeRepository extends Repository {
  async list() {
    const { recordset } = await this.pool.request()
      .query('SELECT * FROM tshirt_sizes ORDER BY sortOrder ASC');
    return recordset;
  }

  // Lets a UQ_tshirt_sizes_value violation propagate to the caller for 409 handling.
  async create({ value, label, minDays, maxDays, description, risk, color, sortOrder }) {
    const id = randomUUID();
    const createdAt = Date.now();
    await this.request([
      ['id', NV(36), id],
      ['value', NV(10), value],
      ['label', NV(50), label],
      ['minDays', INT, minDays ?? null],
      ['maxDays', INT, maxDays ?? null],
      ['description', NV(), description || ''],
      ['risk', NV(50), risk || ''],
      ['color', NV(7), color || '#3b82f6'],
      ['sortOrder', INT, sortOrder ?? 0],
      ['createdAt', BIG, createdAt],
    ]).query(`INSERT INTO tshirt_sizes (id,value,label,minDays,maxDays,description,risk,color,sortOrder,createdAt)
              VALUES (@id,@value,@label,@minDays,@maxDays,@description,@risk,@color,@sortOrder,@createdAt)`);
    return { id, value, label, minDays, maxDays, description, risk, color, sortOrder, createdAt };
  }

  async update(id, { label, minDays, maxDays, description, risk, color, sortOrder }) {
    await this.request([
      ['id', NV(36), id],
      ['label', NV(50), label],
      ['minDays', INT, minDays ?? null],
      ['maxDays', INT, maxDays ?? null],
      ['description', NV(), description || ''],
      ['risk', NV(50), risk || ''],
      ['color', NV(7), color || '#3b82f6'],
      ['sortOrder', INT, sortOrder ?? 0],
    ]).query(`UPDATE tshirt_sizes SET label=@label, minDays=@minDays, maxDays=@maxDays,
              description=@description, risk=@risk, color=@color, sortOrder=@sortOrder
              WHERE id=@id`);
  }

  // Returns null on success, or { status, body } if the caller should short-circuit.
  async remove(id) {
    const { recordset: rows } = await this.request([['id', NV(36), id]])
      .query('SELECT value FROM tshirt_sizes WHERE id = @id');
    if (!rows.length) return { status: 404, body: { error: 'Not found' } };

    const { value } = rows[0];
    const { recordset: [{ brdCount }] } = await this.request([['tshirtSize', NV(10), value]])
      .query('SELECT COUNT(*) AS brdCount FROM brds WHERE tshirtSize = @tshirtSize');

    if (brdCount > 0) {
      return { status: 409, body: { error: `Cannot delete: ${brdCount} BRD(s) use this size`, brdCount } };
    }

    await this.request([['id', NV(36), id]])
      .query('DELETE FROM tshirt_sizes WHERE id = @id');
    return null;
  }
}
