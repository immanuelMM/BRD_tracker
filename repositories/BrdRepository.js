import { Repository } from './Repository.js';
import { NV, INT, BIG } from './sqlTypes.js';

export class BrdRepository extends Repository {
  async list() {
    const { recordset } = await this.pool.request()
      .query('SELECT * FROM brds ORDER BY createdAt DESC');
    return recordset;
  }

  async getById(id) {
    const { recordset } = await this.request([['id', NV(36), id]])
      .query('SELECT * FROM brds WHERE id = @id');
    return recordset[0];
  }

  // Shared by POST /api/brds and the legacy /api/migrate merge path.
  async insert(b) {
    await this.request([
      ['id', NV(36), b.id],
      ['title', NV(255), b.title || ''],
      ['description', NV(), b.description || ''],
      ['quarter', NV(5), b.quarter || 'Q1'],
      ['year', INT, b.year || new Date().getFullYear()],
      ['sprintStart', NV(20), b.sprintStart || ''],
      ['sprintEnd', NV(20), b.sprintEnd || ''],
      ['status', NV(50), b.status || 'planning'],
      ['googleDocsLink', NV(), b.googleDocsLink || ''],
      ['jiraLink', NV(), b.jiraLink || ''],
      ['bugLogLink', NV(), b.bugLogLink || ''],
      ['baName', NV(255), b.baName || ''],
      ['techLead', NV(255), b.techLead || ''],
      ['tshirtSize', NV(10), b.tshirtSize || ''],
      ['extendedQuarters', NV(), b.extendedQuarters || null],
      ['beTicket', NV(), b.beTicket || null],
      ['feTicket', NV(), b.feTicket || null],
      ['anciliaryTicket', NV(), b.anciliaryTicket || null],
      ['rndTicket', NV(), b.rndTicket || null],
      ['devAssignee', NV(), b.devAssignee || ''],
      ['meetings', NV(), b.meetings || null],
      ['createdAt', BIG, b.createdAt],
      ['updatedAt', BIG, b.updatedAt],
    ]).query(`INSERT INTO brds
      (id,title,description,quarter,year,sprintStart,sprintEnd,status,
       googleDocsLink,jiraLink,bugLogLink,baName,techLead,tshirtSize,extendedQuarters,
       beTicket,feTicket,anciliaryTicket,rndTicket,devAssignee,meetings,createdAt,updatedAt)
      VALUES
      (@id,@title,@description,@quarter,@year,@sprintStart,@sprintEnd,@status,
       @googleDocsLink,@jiraLink,@bugLogLink,@baName,@techLead,@tshirtSize,@extendedQuarters,
       @beTicket,@feTicket,@anciliaryTicket,@rndTicket,@devAssignee,@meetings,@createdAt,@updatedAt)`);
  }

  async update(id, b, now) {
    await this.request([
      ['id', NV(36), id],
      ['title', NV(255), b.title || ''],
      ['description', NV(), b.description || ''],
      ['quarter', NV(5), b.quarter || 'Q1'],
      ['year', INT, b.year || new Date().getFullYear()],
      ['sprintStart', NV(20), b.sprintStart || ''],
      ['sprintEnd', NV(20), b.sprintEnd || ''],
      ['status', NV(50), b.status || 'planning'],
      ['googleDocsLink', NV(), b.googleDocsLink || ''],
      ['jiraLink', NV(), b.jiraLink || ''],
      ['bugLogLink', NV(), b.bugLogLink || ''],
      ['baName', NV(255), b.baName || ''],
      ['techLead', NV(255), b.techLead || ''],
      ['tshirtSize', NV(10), b.tshirtSize || ''],
      ['extendedQuarters', NV(), b.extendedQuarters || null],
      ['beTicket', NV(), b.beTicket || null],
      ['feTicket', NV(), b.feTicket || null],
      ['anciliaryTicket', NV(), b.anciliaryTicket || null],
      ['rndTicket', NV(), b.rndTicket || null],
      ['devAssignee', NV(), b.devAssignee || ''],
      ['meetings', NV(), b.meetings || null],
      ['updatedAt', BIG, now],
    ]).query(`UPDATE brds SET
        title=@title, description=@description, quarter=@quarter, year=@year,
        sprintStart=@sprintStart, sprintEnd=@sprintEnd, status=@status,
        googleDocsLink=@googleDocsLink, jiraLink=@jiraLink, bugLogLink=@bugLogLink,
        baName=@baName, techLead=@techLead, tshirtSize=@tshirtSize,
        extendedQuarters=@extendedQuarters,
        beTicket=@beTicket, feTicket=@feTicket, anciliaryTicket=@anciliaryTicket, rndTicket=@rndTicket,
        devAssignee=@devAssignee,
        meetings=@meetings,
        updatedAt=@updatedAt
        WHERE id=@id`);
  }

  async remove(id) {
    await this.request([['id', NV(36), id]])
      .query('DELETE FROM brds WHERE id = @id');
  }
}
