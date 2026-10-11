/* Shared modal runtime for TRAYDAQ: used by the app's existing async dialogs.
   No native alert()/confirm()/prompt() interception (synchronous browser APIs cannot safely become async). */
(function(){
  'use strict';
  if (window.tdShowDecision) return;
  var pending = Promise.resolve();
  var svgPaths = {
    verify: '<path d="M12 2.7 14.5 4l2.8-.1 1.1 2.5 2.4 1.5-.4 2.8L21 13l-2 2-.4 2.8-2.7.8L14.5 21 12 19.7 9.5 21l-1.4-2.4-2.7-.8L5 15l-2-2 .6-2.3-.4-2.8 2.4-1.5 1.1-2.5 2.8.1Z"/><path d="m8.3 12.5 2.4 2.3 5-5.4"/>',
    danger: '<path d="M12 3 2.7 19.3a1 1 0 0 0 .9 1.5h16.8a1 1 0 0 0 .9-1.5L12 3Z"/><path d="M12 9v4.5M12 17.3h.01"/>',
    warning: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5M12 16.5h.01"/>',
    success: '<path d="M20 6 9 17l-5-5"/><circle cx="12" cy="12" r="9.2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.7h.01"/>'
  };
  function node(tag, cls, text){
    var n=document.createElement(tag);
    if(cls) n.className=cls;
    if(text!==undefined && text!==null) n.textContent=String(text);
    return n;
  }
  function button(label,primary,kind){
    var b=node('button','td-decision-button',label);
    b.type='button';
    if(primary)b.dataset.primary='true';
    if(kind)b.dataset.kind=kind;
    return b;
  }
  function icon(kind){
    var box=node('div','td-decision-emblem');
    box.dataset.kind=kind;
    var markup=svgPaths[kind]||svgPaths.info;
    box.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+markup+'</svg>';
    return box;
  }
  function show(raw, requestedMode){
    return new Promise(function(resolve){
      var opts=typeof raw==='string'?{message:raw}:(raw&&typeof raw==='object'?raw:{});
      var mode=requestedMode||opts.mode||'confirm';
      var danger=['danger','error','destructive'].indexOf(String(opts.type||'').toLowerCase())>=0;
      var warning=String(opts.type||'').toLowerCase()==='warning';
      var verify=opts.intent==='verify'||opts.type==='verify'||opts.type==='verification';
      var kind=verify?'verify':danger?'danger':warning?'warning':mode==='alert'?'info':'success';
      var overlay=node('div');
      overlay.id='tdDecisionLayer';
      overlay.setAttribute('role','presentation');
      var card=node('section','td-decision-card');
      card.setAttribute('role',mode==='alert'?'alertdialog':'dialog');
      card.setAttribute('aria-modal','true');
      var headingId='tdDecisionHeading';
      card.setAttribute('aria-labelledby',headingId);
      var close=node('button','td-decision-close','×');
      close.type='button';
      close.setAttribute('aria-label','Cancel and close confirmation');
      card.appendChild(close);
      card.appendChild(icon(kind));
      card.appendChild(node('div','td-decision-tag',opts.tag||'TRAYDAQ · Confirmation'));
      var title=node('h2','td-decision-title',opts.title||(mode==='prompt'?'Provide details':mode==='alert'?'Notification':'Confirm action'));
      title.id=headingId;
      card.appendChild(title);
      if(opts.message)card.appendChild(node('p','td-decision-message',opts.message));
      if(opts.account&&typeof opts.account==='object'){
        var a=opts.account;
        var name=String(a.name||a.username||'TRAYDAQ account');
        var acct=node('div','td-decision-account');
        var av=node('div','td-decision-avatar',name.trim().split(/\s+/).slice(0,2).map(function(x){return x[0]||'';}).join('').toUpperCase());
        var avatarSrc=String(a.avatar||'');
        if(/^https?:\/\//i.test(avatarSrc)){
          var img=document.createElement('img');
          img.src=avatarSrc;
          img.alt='';
          img.loading='eager';
          img.addEventListener('error',function(){img.remove();});
          av.textContent='';
          av.appendChild(img);
        }
        acct.appendChild(av);
        var accountInfo=node('div','td-decision-account-copy');
        accountInfo.appendChild(node('div','td-decision-account-name',name));
        if(a.email) accountInfo.appendChild(node('div','td-decision-account-meta',a.email));
        if(a.username&&a.username!==name) accountInfo.appendChild(node('div','td-decision-account-meta','@'+String(a.username).replace(/^@/,'')));
        if(a.uid) accountInfo.appendChild(node('div','td-decision-account-meta',a.uid));
        acct.appendChild(accountInfo);
        card.appendChild(acct);
      }
      var details=Array.isArray(opts.whatHappensNext)?opts.whatHappensNext.filter(Boolean).slice(0,5):[];
      if(details.length||opts.warningText){
        var explainer=node('section','td-decision-explainer');
        explainer.dataset.kind=danger?'danger':'normal';
        explainer.appendChild(node('div','td-decision-explainer-title',opts.explanationTitle||(details.length?'What happens next':'Important to know')));
        var ul=node('ul');
        details.forEach(function(entry){
          var li=node('li',null,entry);
          ul.appendChild(li);
        });
        if(opts.warningText)ul.appendChild(node('li',null,opts.warningText));
        explainer.appendChild(ul);
        card.appendChild(explainer);
      }
      var input=null,error=null;
      if(mode==='prompt'){
        var field=node('div','td-decision-field');
        var label=node('label',null,opts.inputLabel||'Your response');
        label.htmlFor='tdDecisionInput';
        field.appendChild(label);
        input=node(opts.multiline?'textarea':'input','td-decision-input');
        input.id='tdDecisionInput';
        if(!opts.multiline)input.type='text';
        else input.rows=3;
        input.value=String(opts.defaultValue??'');
        input.placeholder=String(opts.placeholder||'Type here…');
        input.autocomplete='off';
        field.appendChild(input);
        error=node('div','td-decision-error');
        error.setAttribute('role','status');
        field.appendChild(error);
        if(Array.isArray(opts.chips)&&opts.chips.length){
          var chips=node('div','td-decision-chips');
          opts.chips.slice(0,8).forEach(function(value){
            var c=node('button','td-decision-chip',value);
            c.type='button';
            c.addEventListener('click',function(){input.value=String(value);input.focus();});
            chips.appendChild(c);
          });
          field.appendChild(chips);
        }
        card.appendChild(field);
      }
      var actions=node('div','td-decision-actions');
      var cancel=button(opts.cancelText||'Cancel',false,kind);
      var okay=button(opts.confirmText||(mode==='prompt'?'Submit':mode==='alert'?'Understood':'Confirm'),true,kind);
      if(mode!=='alert')actions.appendChild(cancel);
      actions.appendChild(okay);
      card.appendChild(actions);
      overlay.appendChild(card);
      var active=document.activeElement;
      var scrollBefore=document.body.style.overflow;
      var settled=false;
      function finish(value){
        if(settled)return;
        settled=true;
        document.removeEventListener('keydown',onKey,true);
        overlay.remove();
        document.body.style.overflow=scrollBefore;
        if(active&&typeof active.focus==='function'&&active.isConnected)try{active.focus();}catch(_){}
        resolve(value);
      }
      function dismiss(){finish(mode==='prompt'?null:mode==='alert'?undefined:false);}
      function accept(){
        if(mode==='prompt'){
          var val=input.value.trim();
          var min=Number.isFinite(+opts.minLength)?+opts.minLength:0;
          var max=Number.isFinite(+opts.maxLength)?+opts.maxLength:Infinity;
          if((opts.required&&!val)||val.length<min||val.length>max){
            error.textContent='Please enter '+(min?min+'–'+(max===Infinity?'more':max):'a valid number of')+' characters.';
            input.focus();
            return;
          }
          finish(val);
        }else finish(mode==='alert'?undefined:true);
      }
      function onKey(ev){
        if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();dismiss();return;}
        if(ev.key==='Enter'&&mode==='prompt'&&!opts.multiline){ev.preventDefault();accept();return;}
        if(ev.key==='Tab'){
          var focusable=Array.from(card.querySelectorAll('button,input,textarea')).filter(function(el){return !el.disabled;});
          if(!focusable.length)return;
          var first=focusable[0],last=focusable[focusable.length-1];
          if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus();}
          else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus();}
        }
      }
      cancel.addEventListener('click',dismiss);
      close.addEventListener('click',dismiss);
      okay.addEventListener('click',accept);
      overlay.addEventListener('click',function(ev){if(ev.target===overlay)dismiss();});
      document.body.appendChild(overlay);
      document.body.style.overflow='hidden';
      document.addEventListener('keydown',onKey,true);
      (input||okay).focus();
    });
  }
  window.tdShowDecision=function(options,mode){
    var p=pending.then(function(){return show(options,mode);});
    pending=p.then(function(){},function(){});
    return p;
  };
})();
