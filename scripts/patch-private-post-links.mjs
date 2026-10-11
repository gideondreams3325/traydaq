import fs from 'node:fs';
import path from 'node:path';

// Runs against the private source only inside the public Traydaq APK builder.
// No private source, user data or signing secrets are copied into this repository.
const MARKER = 'tdPostDeepLinks2026';

export function patchPostLinkHtml(html, runtime) {
  if (typeof html !== 'string' || typeof runtime !== 'string') throw TypeError('HTML and post link runtime required');
  if (html.includes(MARKER)) throw Error('Post deep link runtime already injected');
  if (!html.includes('async function renderFeed(targetPostId, options){')) {
    throw Error('The existing post-targeted For You route is missing');
  }
  if (!runtime.includes('TRAYDAQ_POST_LINKS_2026') ||
      !runtime.includes('traydaqPostShareUrl') ||
      !runtime.includes("window.navigate('feed', id)") ||
      !runtime.includes('stopImmediatePropagation')) throw Error('Post link runtime is incomplete');
  if ((html.match(/<\/body\s*>/gi) || []).length !== 1) throw Error('Exactly one HTML body closing tag is required');
  new Function(runtime); // Syntax-only validation. Runtime is NOT executed in the build runner.
  if (/<\/script/i.test(runtime)) throw Error('Inline runtime contains an HTML script terminator');
  return html.replace(/<\/body\s*>/i,
    '<script id="' + MARKER + '">\n' + runtime + '\n</script>\n</body>');
}

export function patchPostLinkManifest(xml) {
  if (typeof xml !== 'string' || !xml.includes('<manifest')) throw Error('Missing Android manifest');
  if (xml.includes('TRAYDAQ_POST_DEEP_LINK_2026')) throw Error('Android link intent filter already injected');
  const match = /<activity\b[^>]*android:name=["'](?:\.MainActivity|com\.sellerflow\.app\.MainActivity)["'][^>]*>/i.exec(xml);
  if (!match) throw Error('Unable to locate Traydaq Android MainActivity');
  const end = xml.indexOf('</activity>', match.index + match[0].length);
  if (end < 0 || xml.slice(match.index + match[0].length, end).includes('<activity')) {
    throw Error('MainActivity closing tag is missing or ambiguous');
  }
  const filter = [
    '            <!-- TRAYDAQ_POST_DEEP_LINK_2026: links are scoped to a valid post ID. -->',
    '            <intent-filter>',
    '                <action android:name="android.intent.action.VIEW" />',
    '                <category android:name="android.intent.category.DEFAULT" />',
    '                <category android:name="android.intent.category.BROWSABLE" />',
    '                <data android:scheme="traydaq" android:host="post" android:pathPrefix="/" />',
    '            </intent-filter>\n'
  ].join('\n');
  return xml.slice(0, end) + filter + xml.slice(end);
}

export function patchPostLinkActivity(java) {
  if (typeof java !== 'string' || !/class\s+MainActivity\b/.test(java)) throw Error('Missing native MainActivity');
  if (java.includes('TRAYDAQ_POST_DEEP_LINK_2026')) throw Error('Native deep-link bridge already installed');
  const anchor = '                // Native Android Google Sign-In bridge.';
  if (!java.includes(anchor) || !java.includes('webView.addJavascriptInterface(')) {
    throw Error('Expected Android WebView bridge anchor is missing');
  }
  const binding = [
    '                // TRAYDAQ_POST_DEEP_LINK_2026: expose only the validated launch post ID.',
    '                webView.addJavascriptInterface(new Object() {',
    '                    @android.webkit.JavascriptInterface public String currentPostId() {',
    '                        return tdCurrentPostId(MainActivity.this.getIntent());',
    '                    }',
    '                }, "TraydaqPostLinks");',
    '',
    anchor
  ].join('\n');
  java = java.replace(anchor, binding);
  const methods = [
    '    // Prevent untrusted incoming URLs from being interpreted as JavaScript.',
    '    private String tdCurrentPostId(android.content.Intent intent) {',
    '        if (intent == null || !android.content.Intent.ACTION_VIEW.equals(intent.getAction())) return "";',
    '        android.net.Uri uri = intent.getData();',
    '        if (uri == null || !"traydaq".equalsIgnoreCase(uri.getScheme()) ||',
    '                !"post".equalsIgnoreCase(uri.getHost())) return "";',
    '        String postId = uri.getLastPathSegment();',
    '        return postId != null && postId.matches("[A-Za-z0-9_-]{1,128}") ? postId : "";',
    '    }',
    '    private void tdDispatchPostLink(android.content.Intent intent) {',
    '        String id = tdCurrentPostId(intent);',
    '        if (id.isEmpty()) return;',
    '        try {',
    '            if (getBridge() == null || getBridge().getWebView() == null) return;',
    '            android.webkit.WebView view = getBridge().getWebView();',
    '            String js = "window.dispatchEvent(new CustomEvent(\'traydaq-post-link\',{detail:{postId:" +',
    '                org.json.JSONObject.quote(id) + "}}));";',
    '            view.post(() -> view.evaluateJavascript(js, null));',
    '        } catch (Throwable ignored) {}',
    '    }',
  ].join('\n');
  const existing = /(?:public|protected)\s+void\s+onNewIntent\s*\(\s*(?:android\.content\.)?Intent\s+([A-Za-z_]\w*)\s*\)\s*\{/.exec(java);
  if (existing) {
    // Respect existing plugin handlers; run after Capacitor handles the intent.
    const start = existing.index + existing[0].length;
    const rest = java.slice(start);
    const superCall = new RegExp('super\\.onNewIntent\\(\\s*' + existing[1] + '\\s*\\)\\s*;');
    const call = superCall.exec(rest);
    if (!call) throw Error('Existing onNewIntent does not call the Activity superclass');
    const at = start + call.index + call[0].length;
    java = java.slice(0, at) +
      '\n        setIntent(' + existing[1] + ');\n        tdDispatchPostLink(' + existing[1] + ');' + java.slice(at);
    const last = java.lastIndexOf('}');
    return java.slice(0, last) + '\n' + methods + '\n' + java.slice(last);
  }
  const nativeReceiver = [
    '    @Override',
    '    protected void onNewIntent(android.content.Intent intent) {',
    '        super.onNewIntent(intent);',
    '        setIntent(intent);',
    '        tdDispatchPostLink(intent);',
    '    }',
    ''
  ].join('\n');
  const final = java.lastIndexOf('}');
  if (final < 0) throw Error('Invalid Java class');
  return java.slice(0, final) + '\n' + nativeReceiver + methods + '\n' + java.slice(final);
}

export function main(root = '.', runtimeFile, phase = 'html') {
  const base = path.resolve(root);
  if (phase === 'html') {
    if (!runtimeFile) throw Error('Runtime path is required');
    const htmlFile = path.join(base, 'index.html');
    const patched = patchPostLinkHtml(fs.readFileSync(htmlFile, 'utf8'),
      fs.readFileSync(path.resolve(runtimeFile), 'utf8'));
    fs.writeFileSync(htmlFile, patched);
    console.log('PASS: all supported post-sharing actions now use the TRAYDAQ share page URL.');
  } else if (phase === 'native') {
    const manifestFile = path.join(base, 'android/app/src/main/AndroidManifest.xml');
    const javaFile = path.join(base, 'android/app/src/main/java/com/sellerflow/app/MainActivity.java');
    const manifest = patchPostLinkManifest(fs.readFileSync(manifestFile, 'utf8'));
    const activity = patchPostLinkActivity(fs.readFileSync(javaFile, 'utf8'));
    // Do not write anything if either source failed preflight validation.
    fs.writeFileSync(manifestFile, manifest);
    fs.writeFileSync(javaFile, activity);
    console.log('PASS: Android can receive traydaq://post/<id> links for cold and warm launches.');
  } else throw Error('Unknown deep-link patch phase: ' + phase);
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main(process.argv[2] || '.', process.argv[3], process.argv[4] || 'html');
}
