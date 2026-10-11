import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Public Android APK builder patch; private source stays in temporary build checkout.
export const SPLASH_MARKER = 'TRAYDAQ_SPLASH_WHEELS_20261011';
export const CART_VECTOR = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="432dp" android:height="432dp"
    android:viewportWidth="432" android:viewportHeight="432">
    <!-- TRAYDAQ_SPLASH_WHEELS_20261011 -->
    <path android:fillColor="#E8AF35" android:pathData="M106,232 L140,232 L149,236 L140,240 L106,240 Z" />
    <path android:fillColor="#E8AF35" android:pathData="M118,246 L146,246 L154,250 L146,254 L118,254 Z" />
    <path android:fillColor="#E8AF35" android:pathData="M143,259 L163,259 L170,263 L163,267 L143,267 Z" />
    <path android:fillColor="#D5A22C" android:pathData="M255,168 L277,155 L277,203 L255,203 Z" />
    <path android:fillColor="#E5B13B" android:pathData="M281,153 L303,140 L303,203 L281,203 Z" />
    <path android:fillColor="#F4C650" android:pathData="M307,138 L328,126 L328,203 L307,203 Z" />
    <path android:fillColor="#0C553E" android:pathData="M132,175 L151,175 C159,175 164,179 168,187 L184,220 C188,229 198,234 210,234 L326,234 L312,255 L205,255 C188,255 178,247 169,232 L151,197 C149,192 147,191 141,191 L132,191 C120,191 120,175 132,175 Z" />
    <path android:fillColor="#086244" android:pathData="M193,203 L214,203 C225,214 231,217 242,217 L329,217 C337,217 341,224 338,232 L332,242 L210,242 C201,242 198,239 193,233 Z" />
    <path android:fillColor="#F1C24E" android:pathData="M174,219 C187,237 196,244 215,244 L311,244 C320,244 328,251 329,259 L321,263 C316,254 310,252 299,252 L216,252 C196,252 186,248 174,227 Z" />
    <group android:name="tdWheelRear" android:pivotX="216" android:pivotY="275">
        <path android:fillColor="#0B543C" android:pathData="M216,254 A21,21 0,1 1,216 296 A21,21 0,1 1,216 254 Z" />
        <path android:fillColor="#E8B440" android:pathData="M216,258 A17,17 0,1 1,216 292 A17,17 0,1 1,216 258 Z" />
        <path android:strokeColor="#07543C" android:strokeWidth="4" android:strokeLineCap="round" android:pathData="M216,260 L216,290 M201,275 L231,275 M205,264 L227,286 M227,264 L205,286" />
        <path android:fillColor="#07543C" android:pathData="M216,267 A8,8 0,1 1,216 283 A8,8 0,1 1,216 267 Z" />
        <path android:fillColor="#F8D06A" android:pathData="M214,256 L219,256 L220,265 L214,265 Z" />
    </group>
    <group android:name="tdWheelFront" android:pivotX="306" android:pivotY="275">
        <path android:fillColor="#0B543C" android:pathData="M306,254 A21,21 0,1 1,306 296 A21,21 0,1 1,306 254 Z" />
        <path android:fillColor="#E8B440" android:pathData="M306,258 A17,17 0,1 1,306 292 A17,17 0,1 1,306 258 Z" />
        <path android:strokeColor="#07543C" android:strokeWidth="4" android:strokeLineCap="round" android:pathData="M306,260 L306,290 M291,275 L321,275 M295,264 L317,286 M317,264 L295,286" />
        <path android:fillColor="#07543C" android:pathData="M306,267 A8,8 0,1 1,306 283 A8,8 0,1 1,306 267 Z" />
        <path android:fillColor="#F8D06A" android:pathData="M304,256 L309,256 L310,265 L304,265 Z" />
    </group>
</vector>
`;

export const WHEEL_ANIMATOR = `<?xml version="1.0" encoding="utf-8"?>
<objectAnimator xmlns:android="http://schemas.android.com/apk/res/android"
    android:propertyName="rotation"
    android:valueFrom="0" android:valueTo="360" android:valueType="floatType"
    android:duration="300" android:repeatCount="infinite"
    android:repeatMode="restart" android:interpolator="@android:interpolator/linear" />
`;

export const CART_ANIMATED_VECTOR = `<?xml version="1.0" encoding="utf-8"?>
<animated-vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:drawable="@drawable/traydaq_splash_cart_vector">
    <target android:name="tdWheelRear" android:animation="@animator/traydaq_splash_wheel_spin" />
    <target android:name="tdWheelFront" android:animation="@animator/traydaq_splash_wheel_spin" />
</animated-vector>
`;

const REQUIRED_ITEMS = {
  windowSplashScreenBackground: '#FFFFFF',
  'android:windowSplashScreenBackground': '#FFFFFF',
  windowSplashScreenAnimatedIcon: '@drawable/traydaq_splash_animated',
  'android:windowSplashScreenAnimatedIcon': '@drawable/traydaq_splash_animated',
  windowSplashScreenAnimationDuration: '300'
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
      'windowSplashScreenIconBackgroundColor','android:windowSplashScreenIconBackgroundColor',
      'windowSplashScreenBrandingImage','android:windowSplashScreenBrandingImage']) {
      const itemRe = new RegExp('\\s*<item\\s+name="' + key + '"\\s*>[\\s\\S]*?<\\/item>', 'g');
      replacement = replacement.replace(itemRe, '');
    }
    // Avoid a colored icon disk behind the animated cart on Android 12+.
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

export function installSpinningSplash(root='.') {
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
  // The previous APK used an invisible launch icon. Ensure the animated cart
  // replaces that drawable rather than leaving conflicting splash resources.
  fs.rmSync(path.join(res,'drawable/traydaq_splash_transparent.xml'),{force:true});
  writeXml(root,'android/app/src/main/res/drawable/traydaq_splash_cart_vector.xml',CART_VECTOR);
  writeXml(root,'android/app/src/main/res/drawable/traydaq_splash_animated.xml',CART_ANIMATED_VECTOR);
  writeXml(root,'android/app/src/main/res/animator/traydaq_splash_wheel_spin.xml',WHEEL_ANIMATOR);
  console.log('PASS: TRAYDAQ Android 12+ splash wheels rotate at 300ms/revolution.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  installSpinningSplash(process.argv[2] || '.');
