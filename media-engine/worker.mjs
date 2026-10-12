// TRAYDAQ Media Engine: one concurrent FFmpeg job, no third-party video API.
// Node 22+, ffmpeg and ffprobe. NEVER expose SUPABASE_SERVICE_ROLE_KEY to Android.
import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {spawn} from 'node:child_process';

const PROJECT='https://vvpwntehstjbccarqqzp.supabase.co';
const BUCKET='traydaq-public-media';
const MAX_INPUT=50*1024*1024;
const MAX_SECONDS=180;
const VIDEO_PATH=/^media\/([A-Za-z0-9_-]{1,128})\/posts\/([A-Za-z0-9_-]{10,140})\.(mp4|webm|mov|m4v|3gp)$/i;
const ID=/^[a-f0-9-]{36}$/i;
const SLEEP_MS=6000;
const API_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const ENABLED=process.env.TRAYDAQ_MEDIA_ENGINE_ENABLED==='true';

export function validateJob(job) {
  if(!job||!ID.test(String(job.id||''))||typeof job.firebase_uid!=='string')
    throw Error('INVALID_JOB');
  const match=VIDEO_PATH.exec(String(job.source_path||''));
  if(!match||match[1]!==job.firebase_uid)throw Error('PATH_NOT_OWNED');
  if(!Number.isInteger(job.attempts)||job.attempts<1||job.attempts>3)
    throw Error('INVALID_ATTEMPTS');
  return match;
}
export function scaled(width,height,maxEdge) {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||
     width>10000||height>10000)throw Error('INVALID_VIDEO_DIMENSIONS');
  const ratio=Math.min(1,maxEdge/Math.max(width,height));
  const even=n=>Math.max(2,Math.round(n*ratio/2)*2);
  return {width:even(width),height:even(height)};
}
export function masterPlaylist(renditions) {
  if(!Array.isArray(renditions)||!renditions.length)throw Error('NO_RENDITIONS');
  const sorted=[...renditions].sort((a,b)=>a.width*a.height-b.width*b.height);
  return '#EXTM3U\n#EXT-X-VERSION:3\n'+sorted.map(r=>{
    if(!/^(low|high)$/.test(r.name)||!Number.isInteger(r.bandwidth)||
       !Number.isInteger(r.width)||!Number.isInteger(r.height))throw Error('INVALID_RENDITION');
    return '#EXT-X-STREAM-INF:BANDWIDTH='+r.bandwidth+
      ',RESOLUTION='+r.width+'x'+r.height+'\n'+r.name+'/index.m3u8\n';
  }).join('');
}
export function storageUrl(objectPath) {
  if(typeof objectPath!=='string'||!/^media\/[A-Za-z0-9_-]{1,128}\/posts\/[A-Za-z0-9_./-]{1,260}$/.test(objectPath)||
     objectPath.includes('..'))throw Error('INVALID_STORAGE_PATH');
  return PROJECT+'/storage/v1/object/public/'+BUCKET+'/'+objectPath;
}
function serviceHeaders(other={}) {
  return {apikey:API_KEY,Authorization:'Bearer '+API_KEY,...other};
}
async function api(endpoint,{method='GET',headers={},body,timeoutMs=15000}={}) {
  const res=await fetch(PROJECT+endpoint,{method,headers:serviceHeaders(headers),body,
    signal:AbortSignal.timeout(timeoutMs)});
  if(!res.ok)throw Error('SUPABASE_HTTP_'+res.status);
  if(res.status===204)return [];
  return res.json();
}
async function claim() {
  const rows=await api('/rest/v1/rpc/traydaq_media_claim_next',{
    method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  return Array.isArray(rows)?rows[0]||null:null;
}
async function update(job,values) {
  const entries=new URLSearchParams({id:'eq.'+job.id,state:'eq.processing'});
  const rows=await api('/rest/v1/traydaq_media_jobs?'+entries.toString(),{
    method:'PATCH',headers:{'Content-Type':'application/json','Prefer':'return=representation'},
    body:JSON.stringify({...values,updated_at:new Date().toISOString()})});
  if(!Array.isArray(rows)||rows.length!==1)throw Error('JOB_LEASE_CHANGED');
}
async function run(command,args,timeoutMs=180000) {
  return await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:['ignore','ignore','pipe'],shell:false});
    let settled=false,errorLog='',timer;
    const finish=(error)=>{
      if(settled)return;
      settled=true;clearTimeout(timer);
      if(error)reject(error);
      else resolve();
    };
    child.stderr.on('data',b=>{errorLog=(errorLog+String(b)).slice(-5000);});
    child.once('error',()=>finish(Error('ENCODER_NOT_INSTALLED')));
    child.once('close',code=>finish(code===0?null:Error('ENCODER_EXIT_'+code+' '+errorLog.slice(-450))));
    timer=setTimeout(()=>{child.kill('SIGKILL');finish(Error('ENCODER_TIMED_OUT'));},timeoutMs);
  });
}
async function probe(file) {
  const args=['-v','error','-show_entries','format=duration:stream=codec_type,width,height',
    '-of','json',file];
  return await new Promise((resolve,reject)=>{
    const process=spawn('ffprobe',args,{stdio:['ignore','pipe','ignore'],shell:false});
    let body='',timer;
    process.stdout.on('data',part=>{body+=part;if(body.length>32768)process.kill('SIGKILL');});
    process.once('error',()=>{clearTimeout(timer);reject(Error('FFPROBE_UNAVAILABLE'));});
    process.once('close',code=>{
      clearTimeout(timer);
      if(code!==0)return reject(Error('INVALID_VIDEO'));
      try{
        const meta=JSON.parse(body);
        const v=meta.streams?.find(s=>s.codec_type==='video');
        const duration=Number(meta.format?.duration);
        if(!v||!Number.isFinite(duration)||duration<=0||duration>MAX_SECONDS)
          throw Error('UNSUPPORTED_VIDEO_DURATION');
        resolve({width:Number(v.width),height:Number(v.height),duration});
      }catch(error){reject(error);}
    });
    timer=setTimeout(()=>{process.kill('SIGKILL');reject(Error('FFPROBE_TIMEOUT'));},15000);
  });
}
async function download(job,dest) {
  const res=await fetch(storageUrl(job.source_path),{
    method:'GET',signal:AbortSignal.timeout(90000),
    headers:{Accept:'video/*'}});
  if(!res.ok||!res.body)throw Error('ORIGINAL_UNAVAILABLE');
  const contentLength=Number(res.headers.get('content-length')||0);
  if(contentLength>MAX_INPUT)throw Error('ORIGINAL_TOO_LARGE');
  let received=0;
  const guard=new Transform({transform(chunk,_encoding,done){
    received+=chunk.length;
    if(received>MAX_INPUT)done(Error('ORIGINAL_TOO_LARGE'));
    else done(null,chunk);
  }});
  await pipeline(Readable.fromWeb(res.body),guard,createWriteStream(dest,{flags:'wx'}));
  if(received<1024)throw Error('ORIGINAL_TOO_SMALL');
}
function contentType(file){
  return file.endsWith('.m3u8')?'application/vnd.apple.mpegurl':
    file.endsWith('.ts')?'video/mp2t':file.endsWith('.mp4')?'video/mp4':
    file.endsWith('.jpg')?'image/jpeg':'application/octet-stream';
}
async function upload(localFile,remoteKey) {
  const bytes=await fs.readFile(localFile);
  if(!bytes.length||bytes.length>MAX_INPUT)throw Error('INVALID_OUTPUT_SIZE');
  const endpoint='/storage/v1/object/'+BUCKET+'/'+remoteKey;
  const res=await fetch(PROJECT+endpoint,{method:'POST',headers:serviceHeaders({
    'Content-Type':contentType(localFile),'x-upsert':'true',
    'cache-control':'public, max-age=31536000, immutable'
  }),body:bytes,signal:AbortSignal.timeout(60000)});
  if(!res.ok)throw Error('OUTPUT_UPLOAD_HTTP_'+res.status);
}
async function encodeVideo(input,output,{width,height,crf}) {
  const args=['-hide_banner','-loglevel','error','-nostdin','-y','-i',input,
    '-map','0:v:0','-map','0:a:0?','-vf','fps=30,scale='+width+':'+height+':flags=lanczos',
    '-c:v','libx264','-preset','veryfast','-profile:v','main','-pix_fmt','yuv420p',
    '-crf',String(crf),'-g','120','-keyint_min','120','-sc_threshold','0',
    '-c:a','aac','-b:a','96k','-ac','2','-movflags','+faststart','-max_muxing_queue_size','512',
    output];
  await run('ffmpeg',args,260000);
}
async function hlsVariant(mp4,outDir) {
  await fs.mkdir(outDir,{recursive:true});
  await run('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-i',mp4,
    '-map','0:v:0','-map','0:a:0?','-c','copy','-f','hls','-hls_time','4',
    '-hls_list_size','0','-hls_playlist_type','vod','-hls_segment_filename',
    path.join(outDir,'segment_%04d.ts'),path.join(outDir,'index.m3u8')],90000);
}
async function transcode(job) {
  validateJob(job);
  const folder=await fs.mkdtemp(path.join(tmpdir(),'td-encode-'));
  try{
    const input=path.join(folder,'original');
    await download(job,input);
    const {width,height,duration}=await probe(input);
    const entries=[{name:'low',...scaled(width,height,640),crf:29,bandwidth:850000}];
    if(Math.max(width,height)>=1000)entries.push({
      name:'high',...scaled(width,height,1280),crf:26,bandwidth:2450000});
    const remoteBase='media/'+job.firebase_uid+'/posts/transcoded/'+job.id+'/';
    const uploaded=[];
    for(const entry of entries){
      const mp4=path.join(folder,entry.name+'.mp4');
      await encodeVideo(input,mp4,entry);
      const dir=path.join(folder,entry.name);
      await hlsVariant(mp4,dir);
      const fragments=await fs.readdir(dir);
      // Upload MPEG-TS segments first, then the variant manifest.
      for(const fragment of fragments.filter(n=>n.endsWith('.ts')))
        await upload(path.join(dir,fragment),remoteBase+entry.name+'/'+fragment);
      await upload(path.join(dir,'index.m3u8'),remoteBase+entry.name+'/index.m3u8');
      await upload(mp4,remoteBase+entry.name+'.mp4');
      uploaded.push(entry);
    }
    const poster=path.join(folder,'poster.jpg');
    try{
      await run('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y',
        '-ss',String(Math.min(1,Math.max(0,duration/2))),'-i',input,
        '-frames:v','1','-vf','scale=480:-2','-q:v','4',poster],30000);
      await upload(poster,remoteBase+'poster.jpg');
    }catch(_){} // Original post cover still works if poster creation fails.
    await fs.writeFile(path.join(folder,'master.m3u8'),masterPlaylist(uploaded),'utf8');
    await upload(path.join(folder,'master.m3u8'),remoteBase+'master.m3u8'); // Last.
    return {
      hls_path:remoteBase+'master.m3u8',
      mp4_path:remoteBase+'low.mp4',
      poster_path:(await fs.stat(poster).catch(()=>null))?remoteBase+'poster.jpg':null
    };
  }finally{
    await fs.rm(folder,{recursive:true,force:true});
  }
}
export async function processJob(job) {
  try{
    const result=await transcode(job);
    await update(job,{state:'ready',...result,error_code:null});
    console.log('Completed media job',job.id);
  }catch(error){
    const code=String(error?.message||'PROCESS_FAILED').replace(/[^A-Z0-9_]/gi,'_').slice(0,72);
    console.error('Media job failed',job?.id||'unknown',code);
    await update(job,{state:job.attempts>=3?'failed':'queued',error_code:code})
      .catch(()=>console.error('Unable to persist media job error'));
  }
}
export async function main() {
  if(!ENABLED||!API_KEY)throw Error('Worker disabled: configure secrets and TRAYDAQ_MEDIA_ENGINE_ENABLED=true');
  let stopping=false;
  process.on('SIGTERM',()=>{stopping=true;});
  process.on('SIGINT',()=>{stopping=true;});
  console.log('TRAYDAQ Media Engine started; one encode at a time.');
  while(!stopping){
    try{
      const job=await claim();
      if(job)await processJob(job);
      else await new Promise(resolve=>setTimeout(resolve,SLEEP_MS));
    }catch(error){
      console.error('Media queue unavailable',String(error?.message||''));
      await new Promise(resolve=>setTimeout(resolve,15000));
    }
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname)
  main().catch(error=>{console.error(String(error?.message||error));process.exitCode=1;});
