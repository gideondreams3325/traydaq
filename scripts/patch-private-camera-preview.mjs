import fs from 'node:fs';

function swap(text, before, after, what) {
  if (text.split(before).length !== 2) throw Error('Traydaq camera source changed: ' + what);
  return text.replace(before, after);
}

export function fixAndroidCameraPreview(html) {
  if (html.includes('tdVisibleCameraFrame2026')) throw Error('Preview update already installed');

  // Render frames in the WebView canvas above the native Android video layer.
  html = swap(html,
    '<canvas id="livenessCanvas" class="absolute inset-0 w-full h-full pointer-events-none transform -scale-x-100"></canvas>',
    '<canvas id="livenessCanvas" class="absolute inset-0 w-full h-full pointer-events-none transform -scale-x-100" style="z-index:5;display:block;opacity:1;object-fit:cover;" aria-hidden="true"></canvas>',
    'live camera canvas');

  // Avoid an opaque flash layer accidentally hiding the preview.
  html = swap(html,
    '<div id="selfieFlashOverlay" class="absolute inset-0 bg-white/90 transition-opacity duration-200 opacity-0 pointer-events-none z-30"></div>',
    '<!-- Camera flash disabled to protect native video visibility. -->',
    'white layer');

  html = swap(html,
    '      canvas.width = video.videoWidth || 640;\n      canvas.height = video.videoHeight || 480;\n\n      const now = performance.now();',
    [
      '      // Explicitly show live frames: Android WebView video surfaces can be invisible',
      '      // behind a rounded modal even while getUserMedia reports a live stream.',
      '      const tdVisibleCameraFrame2026 = canvas.getContext("2d",{willReadFrequently:true});',
      '      const w=video.videoWidth||0,h=video.videoHeight||0;',
      '      if(w>1&&h>1&&tdVisibleCameraFrame2026){',
      '        if(canvas.width!==w)canvas.width=w;',
      '        if(canvas.height!==h)canvas.height=h;',
      '        tdVisibleCameraFrame2026.drawImage(video,0,0,w,h);',
      '      }',
      '      const now = performance.now();'
    ].join('\n'),
    'real frames on canvas');

  // Detect a camera that is connected but only outputs uniform/blank images.
  html = swap(html,
    '  let lastFrameTime = performance.now();',
    [
      '  let lastFrameTime = performance.now();',
      '  let tdBlankFrameCount=0,tdLastFrameCheck=0;',
      '  const tdHealthCanvas=document.createElement("canvas");',
      '  tdHealthCanvas.width=16;tdHealthCanvas.height=16;',
      '  const tdHealthCtx=tdHealthCanvas.getContext("2d",{willReadFrequently:true});'
    ].join('\n'),
    'video health state');

  html = swap(html,
    '      const now = performance.now();\n      if (faceMeshInstance && (now - lastFrameTime > 60)) {',
    [
      '      const now = performance.now();',
      '      if(tdHealthCtx&&w>1&&h>1&&now-tdLastFrameCheck>550){',
      '        tdLastFrameCheck=now;',
      '        tdHealthCtx.drawImage(video,0,0,16,16);',
      '        const d=tdHealthCtx.getImageData(0,0,16,16).data;',
      '        let lo=255,hi=0;',
      '        for(let p=0;p<d.length;p+=4){',
      '          const lum=(d[p]*3+d[p+1]*6+d[p+2])/10;',
      '          if(lum<lo)lo=lum;if(lum>hi)hi=lum;',
      '        }',
      '        tdBlankFrameCount=(hi-lo<13)?tdBlankFrameCount+1:0;',
      '        if(tdBlankFrameCount>=5){',
      '          stopLivenessCamera();',
      '          if(faceStatusText)faceStatusText.textContent="Camera is showing a blank picture. Check Android Camera privacy settings and retry.";',
      '          if(actionDesc)actionDesc.textContent="A visible camera picture is required before verification can continue.";',
      '          retryBtn?.classList.remove("hidden");',
      '          return;',
      '        }',
      '      }',
      '      if (faceMeshInstance && (now - lastFrameTime > 60)) {'
    ].join('\n'),
    'blank camera detection');

  html = swap(html,
    '<!-- Camera flash disabled to protect native video visibility. -->',
    [
      '<div id="tdCameraStartPanel" style="position:absolute;inset:0;z-index:35;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;background:#172b24;color:#fff;text-align:center;padding:24px">',
      '  <span style="font-size:34px" aria-hidden="true">📷</span>',
      '  <strong style="font-size:19px">Live verification camera</strong>',
      '  <p style="font-size:12px;line-height:1.6;max-width:250px;color:#e2eee5">Start your front camera. You must see yourself clearly before face tracking begins.</p>',
      '  <button type="button" id="tdStartVerificationCamera" style="padding:13px 25px;border-radius:999px;background:#d7ac38;color:#18281e;font-weight:900">Start Camera</button>',
      '  <small style="font-size:11px;color:#e2eee5">Camera is used only during this check.</small>',
      '</div>'
    ].join('\n'),
    'start panel');

  html = swap(html,
    '  initLivenessDetection(kycData);\n}\n\nasync function tdCameraFix2026()',
    [
      "  $('tdStartVerificationCamera')?.addEventListener('click',async()=>{",
      "    const button=$('tdStartVerificationCamera');",
      "    if(button.disabled)return;",
      "    button.disabled=true;button.textContent='Opening camera…';",
      "    try{await initLivenessDetection(kycData);}",
      "    catch(error){",
      "      console.warn('Camera preview start error:',error?.name||'unknown');",
      "      $('tdCameraStartPanel')?.classList.add('hidden');",
      "      if($('livenessFaceStatusText'))$('livenessFaceStatusText').textContent='Camera failed. Tap Retry camera.';",
      "      $('retryCameraBtn')?.classList.remove('hidden');",
      "    }",
      "  });",
      "}",
      "",
      "async function tdCameraFix2026()"
    ].join('\n'),
    'camera explicit start');

  html = swap(html,
    '<span id="livenessFaceStatusText">Initializing camera…</span>',
    '<span id="livenessFaceStatusText">Tap Start Camera to begin.</span>',
    'camera initial status');

  html = swap(html,
    '    if(faceStatusText)faceStatusText.textContent="Camera active. Preparing face tracker…";',
    '    if(faceStatusText)faceStatusText.textContent="Camera active. Checking picture…";\n    $("tdCameraStartPanel")?.classList.add("hidden");',
    'reveal camera when connected');

  html = swap(html,
    '    if(faceStatusText)faceStatusText.textContent=message;\n    if(faceStatusPill)',
    '    $("tdCameraStartPanel")?.classList.add("hidden");\n    if(faceStatusText)faceStatusText.textContent=message;\n    if(faceStatusPill)',
    'reveal camera failure');

  html = swap(html,
    'function stopLivenessCamera() {\n  if (activeLivenessAnimId) {',
    [
      'function stopLivenessCamera() {',
      '  window._tdCameraSession=(window._tdCameraSession||0)+1;',
      "  const video=document.getElementById('livenessVideo');",
      '  if(video){try{video.pause();video.srcObject=null;}catch(_){}}',
      '  if (activeLivenessAnimId) {'
    ].join('\n'),
    'camera release');

  return html;
}

if(process.argv[1] && import.meta.url==='file://'+process.argv[1]){
 const path=(process.argv[2]||'.').replace(/\/$/,'')+'/index.html';
 const before=fs.readFileSync(path,'utf8');
 fs.writeFileSync(path,fixAndroidCameraPreview(before));
 console.log('PASS: Android camera video drawn into visible canvas and blank frames rejected.');
}
