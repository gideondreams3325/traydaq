import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const STARTUP_GATE_MARKER='tdFeedReadySplash20261011';

export function patchFeedGateHtml(html,runtime) {
  if (typeof html!=='string'||typeof runtime!=='string') throw Error('Missing TRAYDAQ startup inputs');
  if (html.includes(STARTUP_GATE_MARKER)) throw Error('Startup gate already installed');
  if (!html.includes('id="reelFeed"')||(html.match(/<\/body>/g)||[]).length!==1)
    throw Error('TRAYDAQ Home startup markup changed');
  for (const term of ['TraydaqStartupGate','mediaReady','firstReadyMedia','MAX_WAIT_MS','loadeddata']) {
    if (!runtime.includes(term)) throw Error('Incomplete startup gate runtime: '+term);
  }
  if (/<\/script/i.test(runtime)) throw Error('Unexpected script terminator');
  new Function(runtime);
  return html.replace('</body>','<script id="'+STARTUP_GATE_MARKER+'">\n'+runtime+'\n</script>\n</body>');
}

export function patchFeedGateActivity(java) {
  if (typeof java!=='string'||!java.includes('class MainActivity')||
      java.includes('TRAYDAQ_FEED_READY_SPLASH_20261011')) throw Error('Invalid or already patched MainActivity');
  const method=/(?:public|protected)\s+void\s+onCreate\s*\(\s*(?:android\.os\.)?Bundle\s+\w+\s*\)\s*\{/g;
  const methods=[...java.matchAll(method)];
  if(methods.length!==1)throw Error('Expected exactly one Android MainActivity onCreate');
  const start=methods[0].index+methods[0][0].length;
  const startup=[
    '',
    '        // TRAYDAQ_FEED_READY_SPLASH_20261011: Android splash is held until first media is decoded.',
    '        tdStartSplashAt = android.os.SystemClock.uptimeMillis();',
    '        androidx.core.splashscreen.SplashScreen splash =',
    '            androidx.core.splashscreen.SplashScreen.installSplashScreen(this);',
    '        splash.setKeepOnScreenCondition(() -> !tdFirstMediaReady &&',
    '            android.os.SystemClock.uptimeMillis() - tdStartSplashAt < 11500L);',
  ].join('\n');
  java=java.slice(0,start)+startup+java.slice(start);
  const anchor='                // Native Android Google Sign-In bridge.';
  if(java.split(anchor).length!==2||!java.includes('webView.addJavascriptInterface('))
    throw Error('Android webView JavaScript bridge anchor missing');
  const bound=[
    '                // No account data crosses this bridge: it only ends the splash.',
    '                webView.addJavascriptInterface(new Object() {',
    '                    @android.webkit.JavascriptInterface public void mediaReady() {',
    '                        tdFirstMediaReady = true;',
    '                    }',
    '                }, "TraydaqStartupGate");',
    '',
    anchor
  ].join('\n');
  java=java.replace(anchor,bound);
  const cls=/\bclass\s+MainActivity\s+extends\s+[A-Za-z0-9_.]+\s*\{/g;
  const classMatches=[...java.matchAll(cls)];
  if(classMatches.length!==1)throw Error('Cannot find unique native MainActivity class');
  const at=classMatches[0].index+classMatches[0][0].length;
  const fields='\n    private volatile boolean tdFirstMediaReady = false;\n    private long tdStartSplashAt;\n';
  return java.slice(0,at)+fields+java.slice(at);
}

export function main(root='.',runtimePath='',phase='html') {
  const base=path.resolve(root);
  if(phase==='html') {
    if(!runtimePath)throw Error('Missing feed readiness JS runtime');
    const location=path.join(base,'index.html');
    const source=fs.readFileSync(location,'utf8');
    fs.writeFileSync(location,patchFeedGateHtml(source,fs.readFileSync(runtimePath,'utf8')));
    console.log('PASS: Android Home waits for the first decoded For You media or safe timeout.');
  } else if(phase==='native') {
    const location=path.join(base,'android/app/src/main/java/com/sellerflow/app/MainActivity.java');
    const source=fs.readFileSync(location,'utf8');
    fs.writeFileSync(location,patchFeedGateActivity(source));
    console.log('PASS: native animated splash stays until media-ready bridge or 11.5-second safety timeout.');
  } else throw Error('Unknown startup gate patch phase');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main(process.argv[2]||'.',process.argv[3]||'',process.argv[4]||'html');
}
