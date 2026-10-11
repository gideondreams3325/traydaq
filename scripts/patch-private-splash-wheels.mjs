import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Public Android APK builder patch; private source stays in temporary build checkout.
export const SPLASH_MARKER = 'TRAYDAQ_NO_LOGO_SPLASH_20261011';
export const NO_LOGO_VECTOR = '<?xml version="1.0" encoding="utf-8"?>\n' +
  '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n' +
  '    android:width="1dp" android:height="1dp"\n' +
  '    android:viewportWidth="1" android:viewportHeight="1">\n' +
  '    <!-- TRAYDAQ_NO_LOGO_SPLASH_20261011 -->\n' +
  '    <path android:fillColor="#00000000" android:pathData="M0,0h1v1h-1z" />\n' +
  '</vector>\n';

const REQUIRED_ITEMS = {
  windowSplashScreenBackground: '#FFFFFF',
  'android:windowSplashScreenBackground': '#FFFFFF',
  windowSplashScreenAnimatedIcon: '@drawable/traydaq_splash_transparent',
  'android:windowSplashScreenAnimatedIcon': '@drawable/traydaq_splash_transparent',
  windowSplashScreenAnimationDuration: '0'
};

export function patchLaunchStyle(xml) {
  if (!xml.includes('<resources') || !xml.includes('</resources>'))
    throw new Error('TRAYDAQ splash: invalid Android resources XML');
  const re = /<style\b[^>]*\bname="AppTheme\.NoActionBarLaunch"[^>]*>[\s\S]*?<\/style>/g;
  const matches = [...xml.matchAll(re)];
  if (matches.length > 1) throw new Error('TRAYDAQ splash: duplicate Android launch styles');
  if (matches.length) {
    let replacement = matches[0][0];
    if (!/\bparent="Theme\.SplashScreen(?:\.IconBackground)?"/.test(replacement))
      throw new Error('TRAYDAQ splash: launch style no longer uses Theme.SplashScreen');
    for (const key of [...Object.keys(REQUIRED_ITEMS),
      'windowSplashScreenIconBackgroundColor', 'android:windowSplashScreenIconBackgroundColor',
      'windowSplashScreenBrandingImage', 'android:windowSplashScreenBrandingImage']) {
      const itemRe = new RegExp('\\s*<item\\s+name="' + key + '"\\s*>[\\s\\S]*?<\\/item>', 'g');
      replacement = replacement.replace(itemRe, '');
    }
    replacement = replacement.replace('parent="Theme.SplashScreen.IconBackground"', 'parent="Theme.SplashScreen"');
    if (!/name="postSplashScreenTheme"/.test(replacement))
      replacement = replacement.replace('</style>', '    <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item></style>');
    const attrs = Object.entries(REQUIRED_ITEMS).map(([key,val]) =>
      '    <item name="' + key + '">' + val + '</item>').join('\n');
    replacement = replacement.replace(/\s*<\/style>$/, '\n' + attrs + '\n</style>');
    return xml.replace(matches[0][0], replacement);
  }
  const replacement = '    <!-- ' + SPLASH_MARKER + ' -->\n' +
    '    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">\n' +
    Object.entries({...REQUIRED_ITEMS, postSplashScreenTheme:'@style/AppTheme.NoActionBar'})
      .map(([key,val]) => '        <item name="' + key + '">' + val + '</item>').join('\n') +
    '\n    </style>\n';
  return xml.replace('</resources>', replacement + '</resources>');
}

function writeXml(root, relative, content) {
  const dest = path.join(root, relative);
  fs.mkdirSync(path.dirname(dest), {recursive:true});
  fs.writeFileSync(dest, content, 'utf8');
}

export function installNoLogoSplash(root='.') {
  root = path.resolve(root);
  const res = path.join(root,'android/app/src/main/res');
  const manifest = path.join(root,'android/app/src/main/AndroidManifest.xml');
  if (!fs.existsSync(manifest) || !fs.readFileSync(manifest,'utf8').includes('AppTheme.NoActionBarLaunch'))
    throw new Error('TRAYDAQ splash: Android launch theme is not used in manifest; refusing ineffective patch');
  const baseStyle = path.join(res,'values/styles.xml');
  if (!fs.existsSync(baseStyle) || !fs.readFileSync(baseStyle,'utf8').includes('name="AppTheme.NoActionBar"'))
    throw new Error('TRAYDAQ splash: missing base Android AppTheme.NoActionBar');
  for (const qualifier of ['values-v31','values-night-v31']) {
    const dir = path.join(res,qualifier);
    const candidates = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter(n => n.endsWith('.xml')).sort() : [];
    const files = candidates.filter(n => fs.readFileSync(path.join(dir,n),'utf8').includes('name="AppTheme.NoActionBarLaunch"'));
    if (files.length > 1) throw new Error('TRAYDAQ splash: multiple launch styles in '+qualifier);
    const dest = path.join(dir,files[0] ?? 'styles.xml');
    const original = fs.existsSync(dest) ? fs.readFileSync(dest,'utf8') :
      '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';
    writeXml(root,path.relative(root,dest),patchLaunchStyle(original));
  }
  writeXml(root,'android/app/src/main/res/drawable/traydaq_splash_transparent.xml',NO_LOGO_VECTOR);
  // Explicitly remove obsolete animation resources previously installed by this builder.
  for (const relative of ['drawable/traydaq_splash_cart_vector.xml',
    'drawable/traydaq_splash_animated.xml','animator/traydaq_splash_wheel_spin.xml']) {
    fs.rmSync(path.join(res,relative),{force:true});
  }
  console.log('PASS: Android 12+ centered cart splash removed; system start remains brief and white.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  installNoLogoSplash(process.argv[2] || '.');
