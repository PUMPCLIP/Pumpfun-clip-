import {db} from './db';

export const CREDIT_EVENT_CHANNEL = 'pumpclip_credit_events';
export type CreditEventType = 'credit_reserved' | 'job_status_changed' | 'credit_settled';
export type CreditEvent = {id:string;type:CreditEventType;payload:Record<string,unknown>};

export async function publishCreditEvent(userId:string,type:CreditEventType,payload:Record<string,unknown>={}) {
  const event:CreditEvent = {id:crypto.randomUUID(),type,payload:{...payload,userId}};
  await db.query('SELECT pg_notify($1,$2)',[CREDIT_EVENT_CHANNEL,JSON.stringify(event)]);
  return event;
}
