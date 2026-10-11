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
  return html;
}

if(process.argv[1] && import.meta.url==='file://'+process.argv[1]){
 const path=(process.argv[2]||'.').replace(/\/$/,'')+'/index.html';
 const before=fs.readFileSync(path,'utf8');
 fs.writeFileSync(path,fixAndroidCameraPreview(before));
 console.log('PASS: Android camera video drawn into visible canvas and blank frames rejected.');
}
