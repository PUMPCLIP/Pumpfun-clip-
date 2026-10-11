import {requireUser,jsonError} from '@/lib/auth';
import {db} from '@/lib/db';
import {CREDIT_EVENT_CHANNEL,type CreditEvent} from '@/lib/credit-events';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request){
  const requestId=crypto.randomUUID();
  try{
    const user=await requireUser();
    const rawLast=request.headers.get('last-event-id');
    const lastEventId=rawLast&&/^\d+$/.test(rawLast)?BigInt(rawLast):0n;
    const encoder=new TextEncoder();
    const client=await db.connect();
    let heartbeat:ReturnType<typeof setInterval>|undefined;
    let closed=false;
    const close=async()=>{
      if(closed)return;
      closed=true;
      if(heartbeat)clearInterval(heartbeat);
      client.removeAllListeners('notification');
      await client.query(`UNLISTEN "${CREDIT_EVENT_CHANNEL}"`).catch(()=>{});
      client.release();
    };
    const stream=new ReadableStream<Uint8Array>({
      async start(controller){
        const send=(event:string,data:unknown,id?:string)=>{
          if(closed)return;
          try{controller.enqueue(encoder.encode(`${id?`id: ${id}\n`:''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));}
          catch{void close();}
        };
        const sendStored=async()=>{
          const rows=await client.query<{id:string;event_type:string;payload:Record<string,unknown>}>(
            `SELECT id,event_type,payload FROM credit_events WHERE user_id=$1 AND id>$2 ORDER BY id ASC LIMIT 500`,
            [user.user_id,lastEventId.toString()]
          );
          for(const row of rows.rows)send(row.event_type,row.payload,String(row.id));
        };
        client.on('notification',message=>{
          if(message.channel!==CREDIT_EVENT_CHANNEL||!message.payload)return;
          try{
            const event=JSON.parse(message.payload) as CreditEvent & {payload:Record<string,unknown> & {userId?:string}};
            if(event.payload?.userId!==user.user_id)return;
            const {userId:_,...payload}=event.payload||{};
            send(event.type,payload,event.id);
          }catch{}
        });
        client.on('error',()=>{try{controller.close();}catch{};void close();});
        try{
          await client.query(`LISTEN "${CREDIT_EVENT_CHANNEL}"`);
          await sendStored();
          send('ready',{ok:true});
          heartbeat=setInterval(()=>{if(!closed){try{controller.enqueue(encoder.encode(': heartbeat\n\n'));}catch{void close();}}},15000);
        }catch(error){try{controller.error(error);}catch{};await close();}
      },
      async cancel(){await close();},
    });
    return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'} });
  }catch(error){return jsonError(error,requestId);}
}
