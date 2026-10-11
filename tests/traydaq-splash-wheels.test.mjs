import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SPLASH_MARKER, patchLaunchStyle, installNoLogoSplash, NO_LOGO_VECTOR}
  from '../scripts/patch-private-splash-wheels.mjs';

const base='<resources><style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen.IconBackground">' +
  '<item name="postSplashScreenTheme">@style/CustomTheme</item>' +
  '<item name="windowSplashScreenAnimatedIcon">@drawable/traydaq_splash_animated</item>' +
  '<item name="windowSplashScreenIconBackgroundColor">#E8AF35</item>' +
  '<item name="windowSplashScreenAnimationDuration">300</item></style></resources>';

test('Native splash no longer displays cart, icon disk, or animated wheels',()=>{
  const xml=patchLaunchStyle(base);
  assert.match(xml, /postSplashScreenTheme">@style\/CustomTheme/);
  assert.match(xml, /parent="Theme.SplashScreen"/);
  assert.doesNotMatch(xml, /traydaq_splash_animated/);
  assert.doesNotMatch(xml, /windowSplashScreenIconBackgroundColor/);
  assert.match(xml, /@drawable\/traydaq_splash_transparent/);
  assert.match(xml, /windowSplashScreenAnimationDuration">0/);
  assert.match(xml, /#FFFFFF/);
  assert.equal(patchLaunchStyle(xml),xml);
});
test('Android 12+ day and night styles can be safely added',()=>{
  const xml=patchLaunchStyle('<resources></resources>');
  assert.match(xml,/parent="Theme.SplashScreen"/);
  assert.match(xml,/postSplashScreenTheme">@style\/AppTheme.NoActionBar/);
  assert.match(NO_LOGO_VECTOR,/fillColor="#00000000"/);
  assert.ok(NO_LOGO_VECTOR.includes(SPLASH_MARKER));
  assert.throws(()=>patchLaunchStyle('<broken/>'),/invalid Android resources/);
  assert.throws(()=>patchLaunchStyle('<resources><style name="AppTheme.NoActionBarLaunch" parent="Other"></style></resources>'),/Theme.SplashScreen/);
});
test('installer removes legacy cart resources, preserving regular Android launcher',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'td-splash-'));
  try {
    const app=path.join(root,'android/app/src/main');
    fs.mkdirSync(path.join(app,'res/values-v31'),{recursive:true});
    fs.mkdirSync(path.join(app,'res/values'),{recursive:true});
    fs.mkdirSync(path.join(app,'res/drawable'),{recursive:true});
    fs.mkdirSync(path.join(app,'res/animator'),{recursive:true});
    fs.writeFileSync(path.join(app,'AndroidManifest.xml'),'<activity android:theme="@style/AppTheme.NoActionBarLaunch"/>');
    fs.writeFileSync(path.join(app,'res/values/styles.xml'),'<resources><style name="AppTheme.NoActionBar"/></resources>');
    fs.writeFileSync(path.join(app,'res/values-v31/styles.xml'),base);
    for(const file of ['drawable/traydaq_splash_cart_vector.xml',
      'drawable/traydaq_splash_animated.xml','animator/traydaq_splash_wheel_spin.xml'])
      fs.writeFileSync(path.join(app,'res',file),'old animated cart');
    installNoLogoSplash(root);
    const theme=fs.readFileSync(path.join(app,'res/values-v31/styles.xml'),'utf8');
    assert.match(theme,/@drawable\/traydaq_splash_transparent/);
    assert.match(fs.readFileSync(path.join(app,'res/values-night-v31/styles.xml'),'utf8'),/@drawable\/traydaq_splash_transparent/);
    assert.match(fs.readFileSync(path.join(app,'res/drawable/traydaq_splash_transparent.xml'),'utf8'),/fillColor="#00000000"/);
    for(const file of ['drawable/traydaq_splash_cart_vector.xml',
      'drawable/traydaq_splash_animated.xml','animator/traydaq_splash_wheel_spin.xml'])
      assert.equal(fs.existsSync(path.join(app,'res',file)),false);
    installNoLogoSplash(root);
    assert.equal(fs.readFileSync(path.join(app,'res/values-v31/styles.xml'),'utf8'),theme);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('installer refuses changed manifest theme',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'td-splash-'));
  try {
    const app=path.join(root,'android/app/src/main');
    fs.mkdirSync(path.join(app,'res/values'),{recursive:true});
    fs.writeFileSync(path.join(app,'AndroidManifest.xml'),'<manifest/>');
    fs.writeFileSync(path.join(app,'res/values/styles.xml'),'<resources><style name="AppTheme.NoActionBar"/></resources>');
    assert.throws(()=>installNoLogoSplash(root),/launch theme is not used/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
