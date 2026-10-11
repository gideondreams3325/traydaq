import fs from 'node:fs';
import path from 'node:path';

// Bundle the face tracking runtime in the installed APK; do not rely on
// an unpinned external CDN or a second 10+ MB download during verification.
// FaceMesh is used only while online verification is active; no offline
// identity data or camera images are persisted locally by this patch.
export function patchFaceAssets(html) {
  const faceCdn='https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/';
  const cameraImport="new Promise(r => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js'; s.onload = r; s.onerror = r; document.head.appendChild(s); }),";
  if (html.split(faceCdn).length !== 3) throw Error('Unexpected FaceMesh runtime asset references');
  if (html.split(cameraImport).length !== 2) throw Error('Camera-utils import changed');
  html=html.replaceAll(faceCdn,'/traydaq-face-mesh/');
  html=html.replace(cameraImport,'Promise.resolve(), // CameraUtils is unnecessary: frames are fed directly to FaceMesh.');
  if(!html.includes("/traydaq-face-mesh/face_mesh.js")||!html.includes("/traydaq-face-mesh/"))throw Error('Local face model not configured');
  return html;
}
if(process.argv[1] && import.meta.url==='file://'+path.resolve(process.argv[1])){
 const file=path.join(path.resolve(process.argv[2]||'.'),'index.html');
 const before=fs.readFileSync(file,'utf8'), after=patchFaceAssets(before);
 fs.writeFileSync(file,after);
 console.log('PASS: verification FaceMesh loads bundled model assets rather than external CDN.');
}
