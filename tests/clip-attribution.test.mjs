import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';

const source=readFileSync('lib/clip-attribution.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
new Function('exports','require','module',js)(module.exports,createRequire(import.meta.url),module);
const {parseClipUrl,calculateClipFee}=module.exports;

test('clip links accept only supported public HTTPS post formats',()=>{
  assert.deepEqual(parseClipUrl('https://www.tiktok.com/@clipper/video/1234567890?is_from_webapp=1'),{url:'https://tiktok.com/@clipper/video/1234567890',platform:'tiktok'});
  assert.deepEqual(parseClipUrl('https://x.com/creator/status/1234567890'),{url:'https://x.com/creator/status/1234567890',platform:'x'});
  assert.deepEqual(parseClipUrl('https://www.youtube.com/shorts/abcdefgh?si=tracking'),{url:'https://youtube.com/shorts/abcdefgh',platform:'youtube_shorts'});
  for(const url of ['http://x.com/creator/status/123','https://youtube.com/watch?v=abcdefgh','https://example.com/clip','https://x.com@evil.test/creator/status/123'])assert.throws(()=>parseClipUrl(url));
});

test('clip fee allocation is 100 bps with a 40/40/20 split and deterministic rounding',()=>{
  const shares=calculateClipFee('1000000000');
  assert.deepEqual(shares,{total:10000000n,clipper:4000000n,streamer:4000000n,platform:2000000n});
  const small=calculateClipFee('1001');
  assert.equal(small.total,10n);
  assert.equal(small.clipper+small.streamer+small.platform,small.total);
  assert.throws(()=>calculateClipFee('1'));
});
