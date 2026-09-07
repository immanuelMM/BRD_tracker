import { randomUUID } from 'crypto';
import { Repository } from './Repository.js';
import { NV, INT, BIG } from './sqlTypes.js';

export class BrdTechLeadRepository extends Repository {
  async list() {
    const { recordset } = await this.pool.request().query(`
      SELECT btl.id, btl.brdId, btl.teamLeadId, tl.name, btl.expertise, btl.sortOrder, btl.createdAt
      FROM brd_tech_leads btl
      JOIN team_leads tl ON btl.teamLeadId = tl.id
      ORDER BY btl.brdId, btl.sortOrder ASC
    `);
    return recordset;
  }

  async getForBrd(brdId) {
    const { recordset } = await this.request([['brdId', NV(36), brdId]])
      .query(`
        SELECT btl.id, btl.brdId, btl.teamLeadId, tl.name, btl.expertise, btl.sortOrder, btl.createdAt
        FROM brd_tech_leads btl
        JOIN team_leads tl ON btl.teamLeadId = tl.id
        WHERE btl.brdId = @brdId
        ORDER BY btl.sortOrder ASC
      `);
    return recordset;
  }

  async create({ brdId, teamLeadId, expertise }) {
    const id = randomUUID();
    const createdAt = Date.now();

    const { recordset: [{ maxSort }] } = await this.request([['brdId', NV(36), brdId]])
      .query('SELECT ISNULL(MAX(sortOrder), -1) AS maxSort FROM brd_tech_leads WHERE brdId = @brdId');

    const sortOrder = maxSort + 1;

    await this.request([
      ['id', NV(36), id],
      ['brdId', NV(36), brdId],
      ['teamLeadId', NV(36), teamLeadId],
      ['expertise', NV(255), expertise || ''],
      ['sortOrder', INT, sortOrder],
      ['createdAt', BIG, createdAt],
    ]).query(`INSERT INTO brd_tech_leads (id, brdId, teamLeadId, expertise, sortOrder, createdAt)
              VALUES (@id, @brdId, @teamLeadId, @expertise, @sortOrder, @createdAt)`);

    return { id, brdId, teamLeadId, expertise, sortOrder, createdAt };
  }

  async update(id, { expertise }) {
    await this.request([
      ['id', NV(36), id],
      ['expertise', NV(255), expertise || ''],
    ]).query('UPDATE brd_tech_leads SET expertise = @expertise WHERE id = @id');
  }

  async remove(id) {
    await this.request([['id', NV(36), id]])
      .query('DELETE FROM brd_tech_leads WHERE id = @id');
  }

  async reorder(order) {
    for (const item of order) {
      await this.request([
        ['id', NV(36), item.id],
        ['sortOrder', INT, item.sortOrder],
      ]).query('UPDATE brd_tech_leads SET sortOrder = @sortOrder WHERE id = @id');
    }
  }
}
