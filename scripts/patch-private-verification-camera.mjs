import fs from 'node:fs';

const change = (s,a,b,name) => {
  if (s.indexOf(a) < 0 || s.indexOf(a) !== s.lastIndexOf(a)) throw Error('Source drift: '+name);
  return s.replace(a,b);
};
const range = (s,a,b,replacement,name) => {
  const start=s.indexOf(a), end=s.indexOf(b,start+a.length);
  if(start<0||end<0||s.indexOf(a,start+1)>=0)throw Error('Source drift: '+name);
  return s.slice(0,start)+replacement+s.slice(end);
};

export function patchVerificationHtml(s) {
  if(s.includes('tdCameraFix2026'))throw Error('Camera patch already applied');
  if(!s.includes('Live Verification Auto-Capture'))throw Error('Liveness UI not found');
  s=range(s,'    // If modal selfie was captured directly,','    // If not captured in modal yet and no existing selfie,',
   '    // One historical selfie may never skip the live multi-angle challenge.\n    window._modalVerificationSelfieBlob=null;\n    window._modalVerificationSelfieBase64=null;\n\n','modal selfie bypass');
  s=change(s,'Live Verification Auto-Capture</h2>','Secure Live Identity Check</h2>','verification title');
  s=change(s,'Auto-captures Front, Left, Right & Full Person pictures',
    'Four guided live captures · identity subject to secure review','subtitle');
  s=change(s,'Multi-Angle & Full Person Comparison','Four guided camera checks','notice');
  s=change(s,'The camera <b>auto-captures</b> once positioned well so both close-up and full person views are compared.',
   'Keep one person in frame. Each view is captured separately while face tracking is active. Camera captures are not automatic approval.','security instructions');
  s=change(s,'max-h-[350px] rounded-2xl bg-white border-2 border-[#2b2b36]',
   'max-h-[380px] rounded-2xl bg-[#172b24] border-2 border-[#26764c]','camera contrast');
  s=change(s,'<video id="livenessVideo" autoplay playsinline muted class="w-full h-full object-cover transform -scale-x-100"></video>',
   '<video id="livenessVideo" autoplay playsinline muted class="w-full h-full object-cover transform -scale-x-100" style="display:block;background:#172b24"></video>','video preview');
  s=change(s,'          <span>🔄</span> Reset\n        </button>',
   '          <span>🔄</span> Retry camera\n        </button>\n        <button id="tdCameraSettingsBtn" type="button" class="hidden rounded-xl border border-[#17653c] px-3 py-2 text-xs font-bold text-[#17653c]">Open camera settings</button>','settings button');
  s=range(s,'            <!-- Direct Fallback Capture when browser getUserMedia is blocked/denied -->',
   '          </div>\n        </div>\n\n        <!-- Auto-Capture Flash Overlay -->',
   '            <div id="livenessFallbackOptions" role="alert" class="hidden rounded-xl bg-amber-50 border border-amber-200 text-[#795600] text-xs p-2">Live camera is required. Allow Camera permission in Android settings, close other camera apps, then retry.</div>\n',
   'unsafe gallery fallback');
  const helper=[
  'async function tdCameraFix2026() {',
  '  const bridge=window.TraydaqCameraPermissionBridge;',
  '  if(bridge && !bridge.granted()){',
  '    const granted=await new Promise(resolve=>{',
  '      let settled=false;',
  '      const callback=e=>finish(e?.detail?.granted===true);',
  '      function finish(value){if(settled)return;settled=true;window.removeEventListener("traydaq-camera-permission",callback);resolve(value);}',
  '      window.addEventListener("traydaq-camera-permission",callback);',
  '      setTimeout(()=>finish(false),18000);',
  '      try{bridge.request();}catch(_){finish(false);}',
  '    });',
  '    if(!granted)throw new DOMException("Camera permission denied","NotAllowedError");',
  '  }',
  '  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new DOMException("Secure WebView camera unsupported","NotSupportedError");',
  '  try{return await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"user"},width:{ideal:640},height:{ideal:480}},audio:false});}',
  '  catch(error){',
  '    if(error?.name!=="OverconstrainedError")throw error;',
  '    return navigator.mediaDevices.getUserMedia({video:true,audio:false});',
  '  }',
  '}',
  ''
  ].join('\n');
  s=change(s,'async function initLivenessDetection(kycData) {',helper+'async function initLivenessDetection(kycData) {','camera permission helper');
  s=change(s,'  try {\n    const stream = await navigator.mediaDevices.getUserMedia({\n      video: {\n        facingMode: \'user\',\n        width: { ideal: 640 },\n        height: { ideal: 480 }\n      },\n      audio: false\n    });\n    activeLivenessStream = stream;\n    video.srcObject = stream;\n    await video.play();\n\n    if (faceStatusText) faceStatusText.textContent = \'Camera ready. Align face in oval.\';',
  [
   '  const tdSession=window._tdCameraSession=(window._tdCameraSession||0)+1;',
   '  const settingsBtn=$("tdCameraSettingsBtn");',
   '  settingsBtn?.addEventListener("click",()=>{try{window.TraydaqCameraPermissionBridge?.settings();}catch(_){}});',
   '  try {',
   '    if(faceStatusText)faceStatusText.textContent="Requesting camera permission…";',
   '    const stream=await tdCameraFix2026();',
   '    if(tdSession!==window._tdCameraSession||!video.isConnected){stream.getTracks().forEach(t=>t.stop());return;}',
   '    activeLivenessStream=stream;',
   '    const track=stream.getVideoTracks()[0];',
   '    if(!track||track.readyState!=="live")throw new DOMException("No active video track","NotReadableError");',
   '    video.muted=true;video.playsInline=true;video.srcObject=stream;',
   '    await Promise.race([video.play(),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Camera preview timeout")),8500))]);',
   '    if(!video.videoWidth||!video.videoHeight){',
   '      await Promise.race([new Promise(resolve=>video.addEventListener("loadedmetadata",resolve,{once:true})),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Camera video not ready")),5000))]);',
   '    }',
   '    if(faceStatusText)faceStatusText.textContent="Camera active. Preparing face tracker…";'
  ].join('\n'),'open real camera stream');
  s=range(s,'  } catch (camErr) {\n    console.warn(\'Liveness camera stream unavailable or permission blocked:',
   '  // Optional MediaPipe FaceMesh',
   [
    '  } catch (camErr) {',
    '    stopLivenessCamera();',
    '    console.warn("Verification camera unavailable:",camErr?.name||"Error");',
    '    const code=camErr?.name||"";',
    '    const message=(code==="NotAllowedError"||code==="PermissionDeniedError")?',
    '      "Camera permission denied. Open Android Settings → Apps → Traydaq → Permissions → Camera.":',
    '      code==="NotFoundError"?"No camera is available on this device.":',
    '      code==="NotReadableError"?"Camera is busy. Close other camera apps and retry.":',
    '      code==="NotSupportedError"?"Secure Android WebView camera is unavailable.":',
    '      "Camera preview failed. Check permission and retry.";',
    '    if(faceStatusText)faceStatusText.textContent=message;',
    '    if(faceStatusPill)faceStatusPill.className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-300 text-xs font-bold text-[#795600]";',
    '    if(actionTitle)actionTitle.textContent="Camera not ready";',
    '    if(actionDesc)actionDesc.textContent=message;',
    '    $("livenessHoldBarWrap")?.classList.add("hidden");',
    '    $("livenessFallbackOptions")?.classList.remove("hidden");',
    '    retryBtn?.classList.remove("hidden");',
    '    if(window.TraydaqCameraPermissionBridge)settingsBtn?.classList.remove("hidden");',
    '    return; // Never use a gallery file to counterfeit live verification.',
    '  }',
    ''
   ].join('\n')+'\n','unsafe camera error recovery');
  s=range(s,'      } else {\n        // Optical luminance & skin centroid detection',
    '      // UI Guidance & Dynamic Guides',
    '      } else {\n        detectedFaceCount=0;\n        headPose="UNKNOWN";\n      }\n\n',
    'skin-tone spoofable fallback');
  s=change(s,"          detectedFaceCount = 1;\n          headPose = currentStepIndex === 3 ? 'FULL_PERSON' : 'FORWARD';",
           "          detectedFaceCount = 0;\n          headPose = 'UNKNOWN';",'native detector error');
  s=change(s,"                headPose = 'FORWARD';\n              }\n            }\n          }\n        } catch (_)",
           "                headPose = 'UNKNOWN';\n              }\n            }\n          }\n        } catch (_)",'no pose landmark fallback');
  s=change(s,'  let lastFrameTime = performance.now();',
    '  if(!faceMeshInstance){\n    if(faceStatusText)faceStatusText.textContent="Secure face tracking unavailable. Connect to internet and retry.";\n    if(actionDesc)actionDesc.textContent="The live head movement tracker did not load. No verification photos were accepted.";\n    retryBtn?.classList.remove("hidden");\n    return;\n  }\n  let lastFrameTime = performance.now();','face-tracker fail closed');
  s=range(s,'  // Quick snap button for step 4','  async function processVideoFrame()',
    '  snapNowBtn?.remove(); // Require live detection, not manual shortcut.\n\n','manual bypass');
  s=range(s,"            if (nextStep.id === 'FULL_PERSON' && snapNowBtn) {",
     '          } else {\n            // All 4 photos auto-captured',
     '            if(nextStep.id==="FULL_PERSON" && ovalBorder)ovalBorder.className="w-56 sm:w-64 h-72 sm:h-80 rounded-2xl border-4 border-dashed border-gold/70 transition-all duration-300 relative flex items-center justify-center";\n',
     'manual last step');
  s=change(s,'          completedMovements.push(currentTarget.id);\n          await snapAnglePhoto(currentTarget.id);\n\n          currentStepIndex++;',
    '          await snapAnglePhoto(currentTarget.id);\n          if(!capturedPhotos[currentTarget.id]?.blob){\n            if(faceStatusText)faceStatusText.textContent="Capture failed. Retry camera.";\n            retryBtn?.classList.remove("hidden");\n            return;\n          }\n          completedMovements.push(currentTarget.id);\n          currentStepIndex++;',
    'verified step capture');
  const requiredGuard=[
    '  const views=["FRONT","LEFT","RIGHT","FULL_PERSON"];',
    '  if(!capturedPhotos || views.some(v=>!capturedPhotos[v]?.blob||!capturedPhotos[v]?.base64)||',
    '    new Set(views.map(v=>capturedPhotos[v].base64)).size!==4||',
    '    !views.every(v=>completedMovements?.includes(v))){',
    '    toast("Four separate live camera views are required. Please retry verification.","error");',
    '    return;',
    '  }'
   ].join('\n');
  s=change(s,'function showLivenessConfirmationPreview(kycData, capturedPhotos, completedMovements) {',
    'function showLivenessConfirmationPreview(kycData, capturedPhotos, completedMovements) {\n'+requiredGuard,'photo integrity before preview');
  s=change(s,'async function finalizeIdentityVerification(kycData, selfieBlob, selfieBase64, livenessResult, capturedPhotos = null) {\n  try {',
    'async function finalizeIdentityVerification(kycData, selfieBlob, selfieBase64, livenessResult, capturedPhotos = null) {\n'+requiredGuard.replaceAll('completedMovements?.includes(v)','livenessResult?.movements?.includes(v)')+'\n  try {',
    'photo integrity before submit');
  s=s.replaceAll('Live Selfie & 3 Phone Library Pictures Matched','Images ready for administrator review');
  s=s.replaceAll('Live front-camera facial biometric features align with all 3 separated full-body pictures uploaded from your phone library.',
    'Supporting images are awaiting identity review. A matching result has not been established.');
  s=s.replaceAll('Live Camera Selfie + 3 Separated Phone Library Full-Body Pictures',
    'Four live camera views plus supporting images');
  s=s.replaceAll('✓ Human Verified','Photo received');
  return s;
}

export function patchAndroidMainActivity(s){
  if(s.includes('TraydaqCameraPermissionBridge'))throw Error('Native camera patch already applied.');
  s=change(s,'    private static final int GOOGLE_SIGN_IN_REQUEST_CODE = 9102;',
    '    private static final int GOOGLE_SIGN_IN_REQUEST_CODE = 9102;\n    private static final int TRAYDAQ_CAMERA_PERMISSION_REQUEST = 9403;',
    'Android permission request constant');
  const nativeMethods=[
  '    @Override',
  '    public void onRequestPermissionsResult(int code, String[] permissions, int[] grantResults) {',
  '        super.onRequestPermissionsResult(code, permissions, grantResults);',
  '        if (code == TRAYDAQ_CAMERA_PERMISSION_REQUEST) sendTraydaqCameraResult();',
  '    }',
  '    private boolean traydaqCameraAllowed() {',
  '        return ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA)',
  '            == android.content.pm.PackageManager.PERMISSION_GRANTED;',
  '    }',
  '    private void sendTraydaqCameraResult() {',
  '        try {',
  '            if (getBridge() == null || getBridge().getWebView() == null) return;',
  '            WebView view = getBridge().getWebView();',
  '            String js = "window.dispatchEvent(new CustomEvent(\'traydaq-camera-permission\',{detail:{granted:" +',
  '                (traydaqCameraAllowed() ? "true" : "false") + "}}));";',
  '            view.post(() -> view.evaluateJavascript(js, null));',
  '        } catch (Throwable ignored) {}',
  '    }',
  '',
  '    @Override',
  '    public void onCreate(Bundle savedInstanceState) {'
  ].join('\n');
  s=change(s,'    @Override\n    public void onCreate(Bundle savedInstanceState) {',
    nativeMethods,'Android permission callback');
  const bridge=[
  '                // Runtime permission is not silently granted to the WebView.',
  '                webView.addJavascriptInterface(new Object() {',
  '                    @JavascriptInterface public boolean granted() { return traydaqCameraAllowed(); }',
  '                    @JavascriptInterface public void request() {',
  '                        runOnUiThread(() -> {',
  '                            if (traydaqCameraAllowed()) sendTraydaqCameraResult();',
  '                            else androidx.core.app.ActivityCompat.requestPermissions(',
  '                                MainActivity.this, new String[]{android.Manifest.permission.CAMERA},',
  '                                TRAYDAQ_CAMERA_PERMISSION_REQUEST);',
  '                        });',
  '                    }',
  '                    @JavascriptInterface public void settings() {',
  '                        runOnUiThread(() -> startActivity(new Intent(',
  '                            android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,',
  '                            Uri.parse("package:" + getPackageName()))));',
  '                    }',
  '                }, "TraydaqCameraPermissionBridge");',
  '',
  '                // Native Android Google Sign-In bridge.'
  ].join('\n');
  s=change(s,'                // Native Android Google Sign-In bridge.',bridge,'Android permission JS bridge');
  return s;
}
if(process.argv[1]&&import.meta.url==='file://'+process.argv[1]){
  const root=(process.argv[2]||'.').replace(/\/$/,'');
  const htmlFile=root+'/index.html', javaFile=root+'/android/app/src/main/java/com/sellerflow/app/MainActivity.java';
  const patchedHtml=patchVerificationHtml(fs.readFileSync(htmlFile,'utf8'));
  const patchedJava=patchAndroidMainActivity(fs.readFileSync(javaFile,'utf8'));
  fs.writeFileSync(htmlFile,patchedHtml);
  fs.writeFileSync(javaFile,patchedJava);
  console.log('PASS: Traydaq Android camera permissions and secure four-view capture patched.');
}
