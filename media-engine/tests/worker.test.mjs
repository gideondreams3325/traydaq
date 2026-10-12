import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateJob,scaled,masterPlaylist,storageUrl} from '../worker.mjs';
import {selectPlayback,safePublicMediaUrl,attachPlaybackFallback} from '../client/playback.mjs';

const uuid='a1b2c3d4-56ef-47ab-8acd-0123456789ab';
const job={id:uuid,firebase_uid:'user_123',source_path:'media/user_123/posts/1234567890.mp4',attempts:1};
const base='https://vvpwntehstjbccarqqzp.supabase.co/storage/v1/object/public/traydaq-public-media/';
test('owned job validation fails closed',()=>{
  assert(validateJob(job));
  assert.throws(()=>validateJob({...job,firebase_uid:'different'}),/PATH_NOT_OWNED/);
  assert.throws(()=>validateJob({...job,source_path:'media/user_123/ghana-card/1234567890.jpg'}),/PATH_NOT_OWNED/);
  assert.throws(()=>validateJob({...job,attempts:5}),/INVALID_ATTEMPTS/);
});
test('video scale keeps landscape and portrait proportions',()=>{
  assert.deepEqual(scaled(1920,1080,640),{width:640,height:360});
  assert.deepEqual(scaled(1080,1920,640),{width:360,height:640});
  assert.deepEqual(scaled(320,240,640),{width:320,height:240});
  assert.throws(()=>scaled(0,500,640),/INVALID_VIDEO_DIMENSIONS/);
});
test('master HLS playlist is rendition sorted with relative paths',()=>{
  const playlist=masterPlaylist([
    {name:'high',width:720,height:1280,bandwidth:2450000},
    {name:'low',width:360,height:640,bandwidth:850000}
  ]);
  assert(playlist.startsWith('#EXTM3U'));
  assert(playlist.indexOf('low/index.m3u8')<playlist.indexOf('high/index.m3u8'));
  assert(!playlist.includes('https://'),'no untrusted redirect in master');
  assert.throws(()=>masterPlaylist([{name:'../../private',bandwidth:1,width:1,height:1}]),/INVALID_RENDITION/);
});
test('storage host and public-only URL validation',()=>{
  assert(storageUrl(job.source_path).startsWith(base));
  assert.throws(()=>storageUrl('media/user_123/kyc/anything.jpg'),/INVALID_STORAGE_PATH/);
  const original=storageUrl(job.source_path);
  assert.equal(safePublicMediaUrl(original),original);
  assert.equal(safePublicMediaUrl(original+'?token=secret'),null);
  assert.equal(safePublicMediaUrl(original.replace('supabase.co','example.org')),null);
  assert.equal(safePublicMediaUrl(original.replace('/object/public/','/object/sign/')),null);
});
test('MP4 is default and HLS is opt-in, with original fallback',()=>{
  const original=storageUrl(job.source_path);
  const mp4=base+'media/user_123/posts/transcoded/'+uuid+'/low.mp4';
  const hls=base+'media/user_123/posts/transcoded/'+uuid+'/master.m3u8';
  assert.deepEqual(selectPlayback({originalUrl:original}).source,original);
  const ready={originalUrl:original,playback:{mp4Url:mp4,hlsUrl:hls}};
  assert.equal(selectPlayback(ready).source,mp4);
  assert.equal(selectPlayback({...ready,nativeHls:true}).source,hls);
  assert.equal(selectPlayback({...ready,nativeHls:true}).fallback,mp4);
  assert.equal(selectPlayback({originalUrl:'https://evil.test/video.mp4'}).source,null);
});
test('player falls back to original only once',()=>{
  const original=storageUrl(job.source_path);
  const optimized=base+'media/user_123/posts/transcoded/'+uuid+'/low.mp4';
  const listeners={};
  const video={src:'',poster:'',loads:0,load(){this.loads++;},
    addEventListener(event,fn){listeners[event]=fn;},
    removeEventListener(event){delete listeners[event];}};
  const detach=attachPlaybackFallback(video,{source:optimized,fallback:original});
  assert.equal(video.src,optimized);
  listeners.error();listeners.error();
  assert.equal(video.src,original);assert.equal(video.loads,1);
  detach();assert.equal(listeners.error,undefined);
});
test('backend security and integration files exist',()=>{
  const sql=fs.readFileSync(new URL('../sql/001_media_jobs.sql',import.meta.url),'utf8');
  const gateway=fs.readFileSync(new URL('../edge/index.ts',import.meta.url),'utf8');
  const worker=fs.readFileSync(new URL('../worker.mjs',import.meta.url),'utf8');
  for(const guard of ['enable row level security','revoke all on public.traydaq_media_jobs from PUBLIC, anon, authenticated',
    'security invoker','for update skip locked','service_role'])
    assert(sql.toLowerCase().includes(guard.toLowerCase()),guard);
  for(const guard of ['jwtVerify','issuer:','audience:','match[1]!==uid','method:\'HEAD\'',
    'Daily processing allowance','source_path','getOwnedJob(uid,id)'])
    assert(gateway.includes(guard),guard);
  for(const guard of ["'ffmpeg'","'ffprobe'","-hls_segment_filename",
    "await upload(path.join(folder,'master.m3u8')","MAX_INPUT","fs.rm(folder"])
    assert(worker.includes(guard),guard);
});
