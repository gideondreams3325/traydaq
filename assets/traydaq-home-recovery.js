/* TRAYDAQ Android Home feed recovery. No account/media data is read or sent. */
(function tdInstallHomeRecovery(){
  'use strict';
  if(window.__tdHomeRecoveryInstalled)return;
  window.__tdHomeRecoveryInstalled=true;
  var WAIT_MS=11000, firstEmptyAt=0, lastFeed=null, recovery=null;
  function visible(element){
    if(!element||!element.isConnected||element.closest('[hidden]'))return false;
    var rect=element.getBoundingClientRect();
    var style=window.getComputedStyle(element);
    return rect.width>120&&rect.height>100&&style.display!=='none'&&style.visibility!=='hidden';
  }
  function homeTabSelected(){
    var selectors='nav button, nav a, [role="navigation"] button, [role="navigation"] a, #bottomNav button, .bottom-nav button, .nav-item';
    var items=document.querySelectorAll(selectors);
    for(var i=0;i<items.length;i++){
      var item=items[i],txt=(item.textContent||'').trim();
      if(!/^Home$/i.test(txt))continue;
      if(item.matches('.active,.selected,.current,[aria-selected="true"],[aria-current="page"]')||
          (item.parentElement&&item.parentElement.matches('.active,.selected,.current')))return true;
    }
    return false;
  }
  function feedReady(feed){
    if(!feed)return false;
    if(feed.querySelector('.reel-card'))return true;
    // Legitimate empty states and messages must not be replaced.
    var text=(feed.textContent||'').replace(/\s+/g,' ').trim();
    return text.length>35&&!feed.querySelector('[data-td-home-recovery]');
  }
  function clear(){
    if(recovery&&recovery.isConnected)recovery.remove();
    recovery=null;
    firstEmptyAt=0;
  }
  function makeButton(label,handler){
    var b=document.createElement('button');
    b.type='button';
    b.textContent=label;
    b.style.cssText='background:#17653c;color:#fff;border:0;border-radius:14px;padding:12px 18px;font-weight:700;min-height:44px;cursor:pointer;';
    b.addEventListener('click',handler);
    return b;
  }
  function show(feed,inline){
    if(recovery&&recovery.isConnected)return;
    var card=document.createElement('section');
    card.id='tdHomeRecovery';
    card.setAttribute('data-td-home-recovery','true');
    card.setAttribute('role','status');
    card.setAttribute('aria-live','polite');
    card.style.cssText='box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;margin:24px auto;padding:24px 20px;max-width:440px;text-align:center;background:#fff;border:1px solid #e0e8e1;border-radius:20px;color:#253b30;box-shadow:0 8px 30px rgba(0,0,0,.06);';
    var header=document.createElement('strong');
    header.textContent='Your Home feed is taking too long to load';
    header.style.cssText='font-size:16px;line-height:1.5;';
    var detail=document.createElement('p');
    detail.textContent='Check your connection or try loading posts again. Your account and posts have not been deleted.';
    detail.style.cssText='font-size:13px;line-height:1.5;margin:0;color:#53655b;';
    var actions=document.createElement('div');
    actions.style.cssText='display:flex;flex-wrap:wrap;justify-content:center;gap:10px;';
    actions.appendChild(makeButton('Retry Home',function(){
      clear();
      firstEmptyAt=Date.now();
      try{
        if(typeof window.navigate==='function'){window.navigate('feed');return;}
      }catch(_){}
      window.location.reload();
    }));
    var reload=makeButton('Reload app',function(){window.location.reload();});
    reload.style.background='#c79e24';
    reload.style.color='#15281c';
    actions.appendChild(reload);
    card.appendChild(header);card.appendChild(detail);card.appendChild(actions);
    if(inline){feed.appendChild(card);}
    else{
      card.style.cssText+='position:fixed;z-index:80;left:12px;right:12px;bottom:85px;margin:0 auto;';
      document.body.appendChild(card);
    }
    recovery=card;
  }
  function inspect(){
    var feed=document.getElementById('reelFeed');
    if(!feed){clear();lastFeed=null;return;}
    if(feed!==lastFeed){clear();lastFeed=feed;}
    var inline=visible(feed);
    // If a routing bug hides the entire main feed, only show a fallback when Home
    // is explicitly selected in the bottom navigation.
    if(!inline&&!homeTabSelected()){clear();return;}
    if(feedReady(feed)){clear();return;}
    if(!firstEmptyAt)firstEmptyAt=Date.now();
    if(Date.now()-firstEmptyAt>=WAIT_MS)show(feed,inline);
  }
  function start(){
    inspect();
    window.setInterval(inspect,1800);
    window.addEventListener('online',inspect);
    window.addEventListener('pageshow',inspect);
    document.addEventListener('visibilitychange',inspect);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();