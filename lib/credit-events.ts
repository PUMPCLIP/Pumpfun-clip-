import {one,tx} from './db';

export const CREDIT_EVENT_CHANNEL='pumpclip_credit_events';
export type CreditEventType='credit_reserved'|'job_status_changed'|'credit_settled';
export type CreditEvent={id:string;type:CreditEventType;payload:Record<string,unknown>};

export async function publishCreditEvent(userId:string,type:CreditEventType,payload:Record<string,unknown>={}):Promise<CreditEvent>{
  return tx(async c=>{
    const row=await one<{id:string}>('INSERT INTO credit_events(user_id,event_type,payload) VALUES($1,$2,$3) RETURNING id',[userId,type,JSON.stringify(payload)],c);
    if(!row)throw new Error('CREDIT_EVENT_NOT_CREATED');
    const event:CreditEvent={id:String(row.id),type,payload:{...payload,userId}};
    await c.query('SELECT pg_notify($1,$2)',[CREDIT_EVENT_CHANNEL,JSON.stringify(event)]);
    return event;
  });
}
