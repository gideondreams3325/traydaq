/* Only in the packaged TRAYDAQ Android app. No web deploy or account caching. */
(function tdRegisterPublicMediaCache(){
  'use strict';
  if(!('serviceWorker' in navigator) || !window.isSecureContext) return;
  function register(){
    if(document.visibilityState==='hidden') return;
    const run=()=>navigator.serviceWorker.register('./traydaq-public-media-sw.js',{scope:'./'}).catch(()=>{});
    if('requestIdleCallback' in window) window.requestIdleCallback(run,{timeout:2000});
    else window.setTimeout(run,500);
  }
  if(document.readyState==='complete') register();
  else window.addEventListener('load',register,{once:true});
})();
