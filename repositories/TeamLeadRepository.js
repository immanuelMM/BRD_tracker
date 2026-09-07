import { randomUUID } from 'crypto';
import { Repository } from './Repository.js';
import { NV, INT, BIG } from './sqlTypes.js';

export class TeamLeadRepository extends Repository {
  async list() {
    const { recordset } = await this.pool.request()
      .query('SELECT * FROM team_leads ORDER BY sortOrder ASC, createdAt ASC');
    return recordset;
  }

  async create({ name, sortOrder }) {
    const id = randomUUID();
    const createdAt = Date.now();
    await this.request([
      ['id', NV(36), id],
      ['name', NV(255), name],
      ['sortOrder', INT, sortOrder ?? 99],
      ['createdAt', BIG, createdAt],
    ]).query(`INSERT INTO team_leads (id,name,sortOrder,createdAt)
              VALUES (@id,@name,@sortOrder,@createdAt)`);
    return { id, name, sortOrder, createdAt };
  }

  async update(id, { name, sortOrder }) {
    await this.request([
      ['id', NV(36), id],
      ['name', NV(255), name || ''],
      ['sortOrder', INT, sortOrder ?? 0],
    ]).query(`UPDATE team_leads SET name=@name, sortOrder=@sortOrder WHERE id=@id`);
  }

  // Returns null on success, or { status, body } if the caller should short-circuit.
  async remove(id) {
    const { recordset: rows } = await this.request([['id', NV(36), id]])
      .query('SELECT name FROM team_leads WHERE id = @id');
    if (!rows.length) return { status: 404, body: { error: 'Not found' } };

    const { recordset: [{ brdCount }] } = await this.request([['teamLeadId', NV(36), id]])
      .query('SELECT COUNT(*) AS brdCount FROM brd_tech_leads WHERE teamLeadId = @teamLeadId');

    if (brdCount > 0) {
      return { status: 409, body: { error: `Cannot delete: ${brdCount} BRD(s) use this tech lead`, brdCount } };
    }

    await this.request([['id', NV(36), id]])
      .query('DELETE FROM team_leads WHERE id = @id');
    return null;
  }
}
