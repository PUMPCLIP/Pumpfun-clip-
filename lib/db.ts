import {Pool, PoolClient, QueryResultRow} from 'pg';
const globalDb = globalThis as unknown as {pumpclipPool?: Pool};
export const db = globalDb.pumpclipPool ||= new Pool({connectionString:process.env.DATABASE_URL});
export type Conn = Pool | PoolClient;
export async function one<T extends QueryResultRow = QueryResultRow>(sql:string, values:unknown[]=[], conn:Conn=db):Promise<T|null> {
  const r = await conn.query<T>(sql,values); return r.rows[0] || null;
}
export async function tx<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T> {
  const client=await db.connect();
  try { await client.query('BEGIN'); const result=await fn(client); await client.query('COMMIT'); return result; }
  catch(e) { await client.query('ROLLBACK'); throw e; }
  finally {client.release();}
}
export async function audit(conn:Conn,actor:string|null,action:string,type:string,id:string,detail:object={}) {
  await conn.query('INSERT INTO audit_events(actor_id,action,subject_type,subject_id,detail) VALUES($1,$2,$3,$4,$5)',[actor,action,type,id,JSON.stringify(detail)]);
}
