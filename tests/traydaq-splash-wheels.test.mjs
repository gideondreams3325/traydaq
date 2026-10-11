import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {SPLASH_MARKER, patchLaunchStyle, installSpinningSplash,
  CART_VECTOR, CART_ANIMATED_VECTOR, WHEEL_ANIMATOR}
  from '../scripts/patch-private-splash-wheels.mjs';

const base='<resources><style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen"><item name="postSplashScreenTheme">@style/CustomTheme</item><item name="windowSplashScreenAnimatedIcon">@drawable/old</item></style></resources>';

test('Android launch remains white and keeps post-launch theme',()=>{
  const xml=patchLaunchStyle(base);
  assert.match(xml, /postSplashScreenTheme">@style\/CustomTheme/);
  assert.doesNotMatch(xml, /@drawable\/old/);
  assert.match(xml, /@drawable\/traydaq_splash_animated/);
  assert.match(xml, /#FFFFFF/);
  assert.doesNotMatch(xml, /traydaq_splash_transparent/);
  assert.equal(patchLaunchStyle(xml),xml);
});

test('Android 12 values-v31 can be added safely',()=>{
  const xml=patchLaunchStyle('<resources></resources>');
  assert.match(xml,/parent="Theme.SplashScreen"/);
  assert.match(xml,/postSplashScreenTheme">@style\/AppTheme.NoActionBar/);
  assert.throws(()=>patchLaunchStyle('<broken/>'),/invalid Android resources/);
  assert.throws(()=>patchLaunchStyle('<resources><style name="AppTheme.NoActionBarLaunch" parent="Other"></style></resources>'),/Theme.SplashScreen/);
});

test('both animated wheels rotate fast with an infinite linear animator',()=>{
  for (const name of ['tdWheelRear','tdWheelFront']) {
    assert.ok(CART_VECTOR.includes('android:name="'+name+'"'));
    assert.ok(CART_ANIMATED_VECTOR.includes('android:name="'+name+'"'));
  }
  assert.match(WHEEL_ANIMATOR,/android:duration="300"/);
  assert.match(WHEEL_ANIMATOR,/android:repeatCount="infinite"/);
  assert.match(WHEEL_ANIMATOR,/@android:interpolator\/linear/);
  assert.ok(CART_VECTOR.includes(SPLASH_MARKER));
});

test('installer patches only native Android resources and is repeatable',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'td-splash-'));
  try {
    const app=path.join(root,'android/app/src/main');
    fs.mkdirSync(path.join(app,'res/values-v31'),{recursive:true});
    fs.mkdirSync(path.join(app,'res/values'),{recursive:true});
    fs.writeFileSync(path.join(app,'AndroidManifest.xml'),'<activity android:theme="@style/AppTheme.NoActionBarLaunch"/>');
    fs.writeFileSync(path.join(app,'res/values/styles.xml'),'<resources><style name="AppTheme.NoActionBar"/></resources>');
    fs.writeFileSync(path.join(app,'res/values-v31/styles.xml'),base);
    fs.mkdirSync(path.join(app,'res/drawable'),{recursive:true});
    fs.writeFileSync(path.join(app,'res/drawable/traydaq_splash_transparent.xml'),'old transparent icon');
    installSpinningSplash(root);
    assert.equal(fs.existsSync(path.join(app,'res/drawable/traydaq_splash_transparent.xml')),false);
    const theme=fs.readFileSync(path.join(app,'res/values-v31/styles.xml'),'utf8');
    assert.match(theme,/@style\/CustomTheme/);
    assert.match(theme,/@drawable\/traydaq_splash_animated/);
    assert.match(fs.readFileSync(path.join(app,'res/values-night-v31/styles.xml'),'utf8'),/#FFFFFF/);
    for(const file of ['drawable/traydaq_splash_cart_vector.xml',
      'drawable/traydaq_splash_animated.xml','animator/traydaq_splash_wheel_spin.xml']) {
      assert.ok(fs.statSync(path.join(app,'res',file)).size>100);
    }
    installSpinningSplash(root);
    assert.equal(fs.readFileSync(path.join(app,'res/values-v31/styles.xml'),'utf8'),theme);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('missing manifest splash theme fails closed',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'td-splash-'));
  try {
    const app=path.join(root,'android/app/src/main');
    fs.mkdirSync(path.join(app,'res/values'),{recursive:true});
    fs.writeFileSync(path.join(app,'AndroidManifest.xml'),'<manifest/>');
    fs.writeFileSync(path.join(app,'res/values/styles.xml'),'<resources><style name="AppTheme.NoActionBar"/></resources>');
    assert.throws(()=>installSpinningSplash(root),/launch theme is not used/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
