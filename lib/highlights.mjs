export function rankHighlights(segments){
  if(!Array.isArray(segments))return [];
  const valid=segments.filter(segment=>Number.isFinite(Number(segment?.start))&&Number.isFinite(Number(segment?.end))&&
    Number(segment.start)>=0&&Number(segment.end)>Number(segment.start)&&typeof segment.text==='string');
  const candidates=[];
  for(let i=0;i<valid.length;i++){
    const start=Number(valid[i].start);
    for(let j=i;j<valid.length&&Number(valid[j].end)-start<=90;j++){
      const end=Number(valid[j].end),length=end-start;
      if(length<15)continue;
      const text=valid.slice(i,j+1).map(segment=>segment.text.trim()).join(' ');
      const signals=(text.match(/\b(but|however|secret|never|mistake|million|because|imagine|why|actually|first|lost|won|surpris|risk|lesson)\w*/gi)||[]).length;
      const score=signals*3+Math.min(8,text.length/120)-Math.abs(length-40)/15;
      candidates.push({start:Number(start.toFixed(2)),end:Number(end.toFixed(2)),score:Number(score.toFixed(2)),hook:text.slice(0,180),excerpt:text.slice(0,500)});
    }
  }
  candidates.sort((a,b)=>b.score-a.score);
  const result=[];
  for(const item of candidates){
    if(result.every(candidate=>Math.max(candidate.start,item.start)>=Math.min(candidate.end,item.end)))result.push(item);
    if(result.length===8)break;
  }
  return result.sort((a,b)=>a.start-b.start);
}
