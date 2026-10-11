'use client';

import {useEffect,useRef} from 'react';

export type CreditEventMessage={type:string;id:string;data:Record<string,unknown>};
type Options={enabled?:boolean;onEvent:(event:CreditEventMessage)=>void;onError?:(status?:number)=>void};

export function useCreditEvents({enabled=true,onEvent,onError}:Options){
  const eventRef=useRef(onEvent);
  const errorRef=useRef(onError);
  eventRef.current=onEvent;
  errorRef.current=onError;

  useEffect(()=>{
    if(!enabled)return;
    let stopped=false;
    let retry=0;
    let reconnectTimer:ReturnType<typeof setTimeout>|undefined;
    let controller:AbortController|undefined;
    let lastEventId='';

    const schedule=()=>{
      if(stopped)return;
      const base=Math.min(30000,500*2**retry);
      const delay=base+Math.floor(Math.random()*Math.min(1000,Math.max(250,base*.25)));
      retry=Math.min(retry+1,8);
      reconnectTimer=setTimeout(connect,delay);
    };

    const connect=async()=>{
      if(stopped)return;
      controller=new AbortController();
      const started=Date.now();
      try{
        const headers:Record<string,string>={'Accept':'text/event-stream','Cache-Control':'no-cache'};
        if(lastEventId)headers['Last-Event-ID']=lastEventId;
        const response=await fetch('/api/v1/ai/events',{headers,cache:'no-store',signal:controller.signal});
        if(!response.ok){
          errorRef.current?.(response.status);
          if(response.status===401||response.status===403)return;
          throw new Error(`SSE_${response.status}`);
        }
        const body=response.body;
        if(!body)throw new Error('SSE_NO_BODY');
        const reader=body.getReader();
        const decoder=new TextDecoder();
        let buffer='';
        let eventType='message';
        let eventId='';
        let dataLines:string[]=[];
        if(Date.now()-started>10000)retry=0;
        const dispatch=()=>{
          if(dataLines.length===0)return;
          const dataText=dataLines.join('\n');
          const id=eventId||lastEventId;
          if(eventId&&/^\d+$/.test(eventId)&&lastEventId&&BigInt(eventId)<=BigInt(lastEventId)){eventType='message';eventId='';dataLines=[];return;}
          if(eventId)lastEventId=eventId;
          if(eventType!=='ready'){
            try{eventRef.current({type:eventType,id,data:JSON.parse(dataText)});}catch{}
          }
          eventType='message';eventId='';dataLines=[];
        };
        while(!stopped){
          const result=await reader.read();
          if(result.done)break;
          buffer+=decoder.decode(result.value,{stream:true});
          const lines=buffer.split(/\r?\n/);
          buffer=lines.pop()||'';
          for(const line of lines){
            if(line===''){dispatch();continue;}
            if(line.startsWith(':'))continue;
            const separator=line.indexOf(':');
            const field=separator<0?line:line.slice(0,separator);
            let value=separator<0?'':line.slice(separator+1);
            if(value.startsWith(' '))value=value.slice(1);
            if(field==='event')eventType=value;
            else if(field==='id')eventId=value;
            else if(field==='data')dataLines.push(value);
          }
        }
        await reader.cancel().catch(()=>{});
        if(!stopped){errorRef.current?.();schedule();}
      }catch(error){
        if(stopped||(error instanceof DOMException&&error.name==='AbortError'))return;
        errorRef.current?.();
        schedule();
      }
    };

    connect();
    return()=>{
      stopped=true;
      if(reconnectTimer)clearTimeout(reconnectTimer);
      controller?.abort();
    };
  },[enabled]);
}
