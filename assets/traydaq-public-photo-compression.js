/* TRAYDAQ: guarded pre-upload photo compressor for Creator Studio.
 * Original file remains authoritative if conversion is unsupported, slow or larger.
 */
(function tdPublicImageOptimizer2026(){
  'use strict';
  if(typeof window.traydaqOptimizePublicImage==='function')return;
  const SUPPORTED=new Set(['image/jpeg','image/png','image/webp']);
  const THRESHOLD=1200*1024, MAX_EDGE=1600;
  async function convert(file) {
    if(!file || typeof Blob==='undefined' || !(file instanceof Blob) ||
       !SUPPORTED.has(String(file.type||'').toLowerCase()) ||
       file.size<THRESHOLD || typeof document==='undefined') return file;
    if(typeof createImageBitmap!=='function')return file;
    let bitmap;
    try {
      bitmap=await createImageBitmap(file);
      if(!bitmap.width || !bitmap.height) return file;
      const ratio=Math.min(1,MAX_EDGE/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
      canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
      const context=canvas.getContext('2d',{alpha:file.type==='image/png'});
      if(!context)return file;
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>
        canvas.toBlob(resolve,file.type,file.type==='image/png'?undefined:.82));
      if(!blob||blob.size>=file.size*.85||blob.size<100)return file;
      // Keep file extension, MIME and name unchanged for signed public uploads.
      return new File([blob],file.name||'traydaq-picture.jpg',
        {type:file.type,lastModified:file.lastModified||Date.now()});
    } catch(_) {return file;}
    finally {try{bitmap?.close?.();}catch(_){}}
  }
  window.traydaqOptimizePublicImage=function(file) {
    return Promise.race([
      convert(file),
      new Promise(resolve=>setTimeout(()=>resolve(file),4500))
    ]);
  };
})();
