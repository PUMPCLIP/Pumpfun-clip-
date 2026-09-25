import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const py=String.raw`
import importlib.util, json, os, pathlib, subprocess, tempfile
spec=importlib.util.spec_from_file_location('video_engine','engine/video.py')
engine=importlib.util.module_from_spec(spec); spec.loader.exec_module(engine)
assert engine.parse_time('45') == 45
assert engine.parse_time('01:12') == 72
assert engine.parse_time('1:02:03.5') == 3723.5
assert engine.parse_range('Clip 00:45–01:12') == (45.0,72.0)
assert engine.parse_range('from 1:10 to 2:05') == (70.0,125.0)
assert engine.parse_range('No timestamp here') is None
for invalid in ['00:60-01:10','00:00-04:00']:
    try: engine.parse_range(invalid)
    except ValueError: pass
    else: raise AssertionError('invalid time range accepted: '+invalid)
assert engine.allowed_video_url('https://www.youtube.com/watch?v=abc')
assert engine.allowed_video_url('https://vm.tiktok.com/abc')
assert engine.allowed_video_url('https://www.instagram.com/reel/abc/')
assert engine.allowed_video_url('https://x.com/user/status/1')
for invalid in ['http://youtube.com/watch?v=x','https://youtube.com.evil.test/watch?v=x','https://127.0.0.1/video','https://youtube.com@127.0.0.1/video','https://youtube.com:8443/watch?v=x']:
    assert not engine.allowed_video_url(invalid), invalid
assert engine.ASPECTS == {'9:16':(1080,1920),'1:1':(1080,1080),'16:9':(1920,1080)}
with tempfile.TemporaryDirectory(prefix='pumpclip-video-test-') as tmp:
    tmp=pathlib.Path(tmp); source=tmp/'source.mp4'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc=size=320x240:rate=24:duration=8','-f','lavfi','-i','sine=frequency=440:duration=8','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',str(source)],check=True,timeout=90)
    probe=engine.probe_video(source); assert 7.8 < probe['duration'] <= 8.1
    chunks=engine.chunk_audio(source,tmp/'audio',chunk_seconds=3)
    assert len(chunks)==3 and all(p.stat().st_size>100 for p in chunks)
    video_chunks=engine.chunk_video(source,tmp/'video',chunk_seconds=3)
    assert len(video_chunks)==3 and all(p.stat().st_size>1000 for p in video_chunks)
    for aspect in engine.ASPECTS:
        output=tmp/(aspect.replace(':','x')+'.mp4')
        engine.extract_clip(source,output,1.25,3.25,aspect,'A local test caption' if aspect=='9:16' else '')
        assert output.stat().st_size>1000
        result=subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',str(output)],check=True,capture_output=True,text=True)
        dimensions=json.loads(result.stdout)['streams'][0]
        assert (dimensions['width'],dimensions['height'])==engine.ASPECTS[aspect]
        rendered=engine.probe_video(output)
        assert abs(rendered['duration']-2.0)<0.15
print('native video engine tests passed')
`;

test('native Python video engine validates URLs/ranges and renders clips in all presets', {timeout:120000}, () => {
  const result=execFileSync('python3',['-c',py],{encoding:'utf8',timeout:110000});
  assert.match(result,/native video engine tests passed/);
});
