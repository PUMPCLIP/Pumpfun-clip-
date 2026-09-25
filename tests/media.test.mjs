import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('FFmpeg can render captioned vertical MP4 with audio',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'pumpclip-video-'));
  try {
    const source=path.join(dir,'source.mp4'),output=path.join(dir,'clip.mp4'),srt=path.join(dir,'caption.srt');
    writeFileSync(srt,'1\n00:00:00,000 --> 00:00:01,000\nA real caption\n');
    const sample=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=640x360:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-c:a','aac','-shortest','-y',source]);
    assert.equal(sample.status,0,sample.stderr?.toString());
    const render=spawnSync('ffmpeg',['-v','error','-ss','0','-i',source,'-t','1',
      '-vf',`scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,subtitles=${srt}:force_style=FontSize=25\\,Outline=3\\,Shadow=1\\,Alignment=2\\,MarginV=140`,
      '-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-y',output]);
    assert.equal(render.status,0,render.stderr?.toString());
    const probe=spawnSync('ffprobe',['-v','error','-show_streams','-of','json',output]);
    assert.equal(probe.status,0);
    const streams=JSON.parse(probe.stdout.toString()).streams;
    assert.ok(streams.some(s=>s.codec_type==='video'&&s.width===1080&&s.height===1920));
    assert.ok(streams.some(s=>s.codec_type==='audio'));
  } finally {rmSync(dir,{recursive:true,force:true});}
});
