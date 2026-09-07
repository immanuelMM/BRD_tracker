import { randomUUID } from 'crypto';
import { Repository } from './Repository.js';
import { NV, INT, BIG } from './sqlTypes.js';

export class StyleFeatureRepository extends Repository {
  // Matches the old loadStyleFeatures() helper: parses the JSON keywords column back into an array.
  async list() {
    const { recordset } = await this.pool.request()
      .query('SELECT * FROM style_features ORDER BY tab ASC, sortOrder ASC');
    return recordset.map((sf) => ({
      ...sf,
      keywords: JSON.parse(sf.keywords || '[]'),
    }));
  }

  async create({ feature, tab, status, keywords, sortOrder }) {
    const id = randomUUID();
    const now = Date.now();
    const keywordsJson = JSON.stringify(Array.isArray(keywords) ? keywords : []);
    await this.request([
      ['id', NV(36), id],
      ['feature', NV(255), feature],
      ['tab', NV(100), tab || 'General'],
      ['status', NV(50), status || 'stable'],
      ['keywords', NV(), keywordsJson],
      ['sortOrder', INT, sortOrder ?? 99],
      ['createdAt', BIG, now],
      ['updatedAt', BIG, now],
    ]).query(`INSERT INTO style_features (id,feature,tab,status,keywords,sortOrder,createdAt,updatedAt)
              VALUES (@id,@feature,@tab,@status,@keywords,@sortOrder,@createdAt,@updatedAt)`);
    return { id, feature, tab: tab || 'General', status: status || 'stable', keywords: Array.isArray(keywords) ? keywords : [], sortOrder, createdAt: now, updatedAt: now };
  }

  async update(id, { feature, tab, status, keywords, sortOrder }) {
    const now = Date.now();
    const keywordsJson = JSON.stringify(Array.isArray(keywords) ? keywords : []);
    await this.request([
      ['id', NV(36), id],
      ['feature', NV(255), feature || ''],
      ['tab', NV(100), tab || 'General'],
      ['status', NV(50), status || 'stable'],
      ['keywords', NV(), keywordsJson],
      ['sortOrder', INT, sortOrder ?? 0],
      ['updatedAt', BIG, now],
    ]).query(`UPDATE style_features SET feature=@feature, tab=@tab, status=@status,
              keywords=@keywords, sortOrder=@sortOrder, updatedAt=@updatedAt WHERE id=@id`);
    return now;
  }

  async remove(id) {
    await this.request([['id', NV(36), id]])
      .query('DELETE FROM style_features WHERE id = @id');
  }
}
