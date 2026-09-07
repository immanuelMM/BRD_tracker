// Base class for all data-access repositories.
// `getPool` is a function (not the pool itself) because the mssql ConnectionPool
// is assigned asynchronously inside server.js's init(), after repositories are constructed.
export class Repository {
  constructor(getPool) {
    this.getPool = getPool;
  }

  get pool() {
    return this.getPool();
  }

  // inputs: [[name, type, value], ...]
  request(inputs = []) {
    let req = this.pool.request();
    for (const [name, type, value] of inputs) req = req.input(name, type, value);
    return req;
  }
}
