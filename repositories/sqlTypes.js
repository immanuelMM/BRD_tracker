import sql from 'mssql';

export const NV = (n) => sql.NVarChar(n || sql.MAX);
export const INT = sql.Int;
export const BIG = sql.BigInt;
