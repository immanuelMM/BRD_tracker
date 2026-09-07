import { randomUUID } from 'crypto';
import { Repository } from './Repository.js';
import { NV, INT, BIG } from './sqlTypes.js';

export class DevMemberRepository extends Repository {
  async list() {
    const { recordset } = await this.pool.request()
      .query('SELECT * FROM dev_members ORDER BY team ASC, sortOrder ASC, createdAt ASC');
    return recordset;
  }

  async create({ name, team, sortOrder }) {
    const id = randomUUID();
    const createdAt = Date.now();
    await this.request([
      ['id', NV(36), id],
      ['name', NV(255), name],
      ['team', NV(50), team || 'FE'],
      ['sortOrder', INT, sortOrder ?? 99],
      ['createdAt', BIG, createdAt],
    ]).query(`INSERT INTO dev_members (id,name,team,sortOrder,createdAt)
              VALUES (@id,@name,@team,@sortOrder,@createdAt)`);
    return { id, name, team: team || 'FE', sortOrder, createdAt };
  }

  async update(id, { name, team, sortOrder }) {
    await this.request([
      ['id', NV(36), id],
      ['name', NV(255), name || ''],
      ['team', NV(50), team || 'FE'],
      ['sortOrder', INT, sortOrder ?? 0],
    ]).query(`UPDATE dev_members SET name=@name, team=@team, sortOrder=@sortOrder WHERE id=@id`);
  }

  async remove(id) {
    await this.request([['id', NV(36), id]])
      .query('DELETE FROM dev_members WHERE id = @id');
  }
}
