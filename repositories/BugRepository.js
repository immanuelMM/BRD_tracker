import { Repository } from './Repository.js';
import { NV, BIG } from './sqlTypes.js';

export class BugRepository extends Repository {
  async list() {
    const { recordset } = await this.pool.request()
      .query('SELECT * FROM bugs ORDER BY createdAt DESC');
    return recordset;
  }

  async getByBrd(brdId) {
    const { recordset } = await this.request([['brdId', NV(36), brdId]])
      .query('SELECT * FROM bugs WHERE brdId = @brdId ORDER BY createdAt DESC');
    return recordset;
  }

  // Shared by POST /api/bugs and the legacy /api/migrate merge path.
  async insert(bug) {
    await this.request([
      ['id', NV(36), bug.id],
      ['brdId', NV(36), bug.brdId || ''],
      ['title', NV(255), bug.title || ''],
      ['criteria', NV(100), bug.criteria || ''],
      ['severity', NV(50), bug.severity || 'medium'],
      ['description', NV(), bug.description || ''],
      ['status', NV(50), bug.status || 'open'],
      ['jiraLink', NV(), bug.jiraLink || ''],
      ['rootCause', NV(), bug.rootCause || ''],
      ['storyTicket', NV(), bug.storyTicket || null],
      ['createdAt', BIG, bug.createdAt],
    ]).query(`INSERT INTO bugs (id,brdId,title,criteria,severity,description,status,jiraLink,rootCause,storyTicket,createdAt)
            VALUES (@id,@brdId,@title,@criteria,@severity,@description,@status,@jiraLink,@rootCause,@storyTicket,@createdAt)`);
  }

  async update(id, b) {
    await this.request([
      ['id', NV(36), id],
      ['title', NV(255), b.title || ''],
      ['criteria', NV(100), b.criteria || ''],
      ['severity', NV(50), b.severity || 'medium'],
      ['description', NV(), b.description || ''],
      ['status', NV(50), b.status || 'open'],
      ['jiraLink', NV(), b.jiraLink || ''],
      ['rootCause', NV(), b.rootCause || ''],
      ['storyTicket', NV(), b.storyTicket || null],
    ]).query(`UPDATE bugs SET title=@title, criteria=@criteria, severity=@severity,
              description=@description, status=@status, jiraLink=@jiraLink, rootCause=@rootCause,
              storyTicket=@storyTicket
              WHERE id=@id`);
  }

  async remove(id) {
    await this.request([['id', NV(36), id]])
      .query('DELETE FROM bugs WHERE id = @id');
  }
}
