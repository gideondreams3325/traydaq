import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  const first=source.indexOf(before);
  if(first<0||source.indexOf(before,first+before.length)!==-1)
    throw Error('Traydaq reviews patch: changed anchor: '+label);
  return source.slice(0,first)+after+source.slice(first+before.length);
}

// Keep the web and Android API paths in sync with the same managed online backend.
export function patchFeedbackClient(source) {
  source=replaceOnce(source,
    "    const isDiscussion = /^(?:post|event)\\//.test(path) && /\\/comments(?:\\/|$)|\\/pin$/.test(path) ||\n      /^post-counts(?:\\?|$)/.test(path);",
    "    const isDiscussion = (/^(?:post|event)\\//.test(path) && /\\/comments(?:\\/|$)|\\/pin$/.test(path)) ||\n      /^post-counts(?:\\?|$)/.test(path) ||\n      /^(?:vacancy|entrepreneur)\\/[A-Za-z0-9_-]{1,160}\\/reviews$/.test(path);",
    'send vacancy and entrepreneur reviews to managed Supabase endpoint');
  source=replaceOnce(source,
    "      } catch (error) { body.textContent = error.message; }",
    `      } catch (error) {
        if (!overlay.isConnected) return;
        footer.replaceChildren();
        body.innerHTML = '<div class="text-center py-7"><p role="alert" class="text-sm text-gray-700 mb-4">'
          + escapeText(error.message || 'Unable to load reviews.') + '</p>'
          + '<button type="button" data-sf-reviews-retry class="px-5 py-2.5 bg-amber-400 text-black font-bold rounded-xl">Retry</button></div>';
        body.querySelector('[data-sf-reviews-retry]')?.addEventListener('click', refresh, { once:true });
      }`,
    'visible retry control on failed reviews');
  return source;
}

// This function is injected into the existing server-authenticated Supabase
// feedback module. It does not use client Firebase rules or localStorage.
async function handleJobReviews(request, adminDb, verifyFirebaseUser, origin, kind, id) {
  if(!adminDb || typeof adminDb.readPath!=='function' || typeof adminDb.setPath!=='function')
    return fail('Reviews service is temporarily unavailable. Please retry.',503,origin);
  if(!['GET','POST'].includes(request.method))
    return fail('Unsupported review action.',405,origin);
  const listing=await adminDb.readPath('jobs/'+id);
  if(blocked(listing))return fail('This listing is unavailable.',404,origin);
  const isEntrepreneur=String(listing.listingType||'vacancy').toLowerCase()==='entrepreneur';
  if((kind==='entrepreneur')!==isEntrepreneur)
    return fail('Listing type does not match.',404,origin);
  const ownerId=String(listing.creatorId||listing.organizerId||listing.employerId||
    listing.ownerId||listing.posterId||listing.userId||listing.sellerId||'');
  const path='communityFeedback/'+kind+'/'+id+'/reviews';
  if(request.method==='GET'){
    const raw=(await adminDb.readPath(path))||{};
    const reviews=Object.values(raw).filter(r=>r&&typeof r==='object'&&!r.hidden&&
      Number.isInteger(Number(r.rating))&&Number(r.rating)>=1&&Number(r.rating)<=5)
      .sort((a,b)=>(Number(b.updatedAt)||0)-(Number(a.updatedAt)||0));
    const average=reviews.length?Math.round(reviews.reduce((sum,r)=>sum+Number(r.rating),0)/reviews.length*10)/10:0;
    return reply({success:true,count:reviews.length,average,reviews:reviews.slice(0,100),ownerId},200,origin);
  }
  if(typeof verifyFirebaseUser!=='function')
    return fail('Sign-in verification unavailable.',503,origin);
  const user=await identity(request,verifyFirebaseUser,adminDb,origin);
  if(user.error)return user.error;
  if(ownerId===user.uid)return fail('You cannot review your own listing.',403,origin);
  const agreement=await adminDb.readPath('legalAcceptances/'+user.uid+'/version');
  if(agreement!=='sellerflow_terms_2026-10-08_v1')
    return fail('Accept the latest community terms before posting.',403,origin);
  if(Number(request.headers.get('content-length')||0)>5000)
    return fail('Review is too large.',413,origin);
  let body;
  try{body=await request.json();}catch{return fail('Invalid review details.',400,origin);}
  if(!body||typeof body!=='object'||Array.isArray(body))
    return fail('Invalid review details.',400,origin);
  const rating=Number(body.rating),reviewText=typeof body.text==='string'?body.text.trim():'';
  if(!Number.isInteger(rating)||rating<1||rating>5||reviewText.length<5||reviewText.length>800)
    return fail('Choose 1–5 stars and write 5–800 characters about your experience.',400,origin);
  const safety=classifyCommunityText(reviewText);
  if(safety.decision!=='allow'){
    await adminDb.pushPath('communityModeration',{source:'automated',kind,targetId:id,
      type:'review',authorId:user.uid,authorName:user.name,text:reviewText,rating,
      status:safety.decision==='block'?'removed':'review',
      reason:safety.reason,category:safety.category,createdAt:Date.now()});
    return fail(safety.decision==='block'?
      'Review removed automatically for abusive language.':'Review held for safety review.',422,origin);
  }
  const existing=await adminDb.readPath(path+'/'+user.uid);
  if(existing?.hidden===true)
    return fail('This review was removed by moderation and cannot be republished.',403,origin);
  const now=Date.now();
  await adminDb.setPath(path+'/'+user.uid,{reviewerId:user.uid,reviewerName:user.name,
    rating,text:reviewText,createdAt:Number(existing?.createdAt)||now,updatedAt:now,
    hidden:false});
  return reply({success:true,updated:!!existing},200,origin);
}

export function patchFeedbackEdge(source) {
  source=replaceOnce(source,
    'export async function handleCommunityFeedbackRequest(request,{adminDb,verifyFirebaseUser,origin=\'\'}={}){',
    handleJobReviews.toString()+'\nexport async function handleCommunityFeedbackRequest(request,{adminDb,verifyFirebaseUser,origin=\'\'}={}){',
    'secure edge reviews handler');
  source=replaceOnce(source,
    " const relative=path.slice(prefix.length);\n const countOnly=relative==='post-counts';",
    ` const relative=path.slice(prefix.length);
 const reviewMatch=/^(vacancy|entrepreneur)\\/([A-Za-z0-9_-]{1,160})\\/reviews$/.exec(relative);
 if(reviewMatch){
   try{return await handleJobReviews(request,adminDb,verifyFirebaseUser,origin,reviewMatch[1],reviewMatch[2]);}
   catch(error){
     console.warn('Reviews API failure:',String(error?.message||'unknown'));
     return fail('Unable to load reviews right now. Please retry.',503,origin);
   }
 }
 const countOnly=relative==='post-counts';`,
    'edge review route dispatch');
  return source;
}

export function main(root='.') {
  for(const [path,patch] of [
    ['community-feedback.js',patchFeedbackClient],
    ['supabase/functions/sellerflow-api/community-feedback.mjs',patchFeedbackEdge]
  ]){
    const file=root.replace(/\\/$/,'')+'/'+path;
    const source=fs.readFileSync(file,'utf8');
    const revised=patch(source);
    if(revised===source)throw Error('Traydaq reviews patch made no change to '+path);
    fs.writeFileSync(file,revised);
    console.log('PASS: online reviews repaired in '+path);
  }
}
if(process.argv[1]&&import.meta.url==='file://'+process.argv[1])
  main(process.argv[2]||'.');
