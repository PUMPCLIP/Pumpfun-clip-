import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankHighlights} from '../lib/highlights.mjs';

test('highlight ranking preserves bounded, ordered timestamp segments and removes overlaps',()=>{
  const segments=[
    {start:0,end:8,text:'A short opening.'},
    {start:8,end:18,text:'The first idea appears.'},
    {start:18,end:31,text:'But the secret is what happens next.'},
    {start:29,end:45,text:'This overlapping provider segment is invalid for sequence ranking.'},
    {start:31,end:48,text:'Actually, a second lesson follows.'},
    {start:91,end:200,text:'An interval over ninety seconds should never be ranked.'},
  ];
  const result=rankHighlights(segments);
  assert.ok(result.length>0);
  for(const candidate of result){
    assert.ok(candidate.start>=0);
    assert.ok(candidate.end>candidate.start);
    assert.ok(candidate.end-candidate.start<=90);
    assert.ok(candidate.excerpt.length<=500);
  }
  assert.deepEqual(result.map(item=>item.start),[...result].map(item=>item.start).sort((a,b)=>a-b));
});

test('empty/no-speech transcription yields no highlight suggestions',()=>{
  assert.deepEqual(rankHighlights([]),[]);
  assert.deepEqual(rankHighlights(null),[]);
});
