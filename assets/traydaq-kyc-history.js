// Injected into the private app's existing admin IIFE by the PUBLIC APK builder.
// Only signed-in, email-verified official owners may remove a verification dossier.
// Security rules remain the server-side authority; no browser-only "admin" flag is trusted.
const tdKycIdentityFields = [
  'idNumber','idNumberMasked','documentNumber','documentNumberMasked',
  'ghanaCardNumber','ghanaCardMasked','ghanaCardNum','ghanaCardPin',
  'ghanaCardLegalName','ghanaCardName','ghanaCardDob',
  'ghanaCardFrontPath','ghanaCardBackPath','documentFrontPath','documentBackPath',
  'idFrontPath','idBackPath','frontPath','backPath',
  'hasGhanaCardFront','hasGhanaCardBack',
  'selfiePath','selfieStoragePath','selfie_storage_path','selfieUrl',
  'selfieFullStoragePath','fullPersonStoragePath','fullPersonPath',
  'fullBody1StoragePath','fullBody2StoragePath','fullBody3StoragePath','fullBodyPhotos',
  'accountVerifiedName','accountVerificationStatus','verificationStatus',
  'verificationSubmittedAt','verificationReviewedAt','verificationReviewedBy',
  'reviewedAt','reviewedBy','livenessResult','livenessStatus',
  'verificationNotes','verificationDocuments','verificationImages'
];
function tdKycDeleteStatus(message, isError) {
  const label = $('tdKycDeleteStatus');
  if(label) {
    label.textContent=message;
    label.className='text-xs font-semibold rounded-xl px-3 py-2 border ' +
      (isError ? 'bg-red-50 text-red-800 border-red-200' : 'bg-emerald-50 text-emerald-900 border-emerald-200');
    label.hidden=false;
  }
}
async function tdKycOwnerSession() {
  const signedIn=auth && auth.currentUser;
  if(!signedIn || typeof signedIn.getIdTokenResult!=='function') throw Error('Sign in with the official Traydaq owner account.');
  const claims=(await signedIn.getIdTokenResult(true)).claims||{};
  if(claims.email_verified!==true ||
     String(claims.email||'').toLowerCase()!=='gideondreams3325@gmail.com' ||
     String(claims.user_id||claims.sub||signedIn.uid)!==signedIn.uid)
    throw Error('Deleting identity dossiers is restricted to the verified official Traydaq owner account.');
  return signedIn;
}
async function tdKycLegacyCleanup(uid, removedAt) {
  // The RTDB vault is authoritative, but remove legacy Firestore shadow records too
  // so older client versions cannot make deleted IDs reappear.
  if(typeof firebase==='undefined' || typeof firebase.firestore!=='function')
    return 'Firestore shadow unavailable';
  const store=firebase.firestore(), field=firebase.firestore.FieldValue.delete();
  const batch=store.batch();
  batch.delete(store.doc('buyerKycRecords/'+uid));
  batch.delete(store.doc('identityVerifications/'+uid));
  const [userSnap, profileSnap, storeSnap]=await Promise.all([
    store.doc('users/'+uid).get(),store.doc('publicProfiles/'+uid).get(),
    store.doc('stores/'+uid).get()
  ]);
  if(userSnap.exists) {
    const clear={kycDeletedAt:removedAt,verified:false,accountVerified:false};
    tdKycIdentityFields.forEach(name=>{clear[name]=field;});
    batch.update(userSnap.ref,clear);
  }
  if(profileSnap.exists) {
    const clear={verified:false,accountVerified:false,accountVerificationStatus:field,verificationStatus:field};
    batch.update(profileSnap.ref,clear);
  }
  if(storeSnap.exists) {
    const clear={ghanaCardNumber:field,ghanaCardFrontPath:field,ghanaCardBackPath:field,ghanaCardName:field,ghanaCardDob:field};
    batch.update(storeSnap.ref,clear);
  }
  await batch.commit();
  return 'completed';
}
async function tdKycDeleteDossier(uid, allRecords, button) {
  if(!/^[A-Za-z0-9_-]{6,128}$/.test(String(uid||''))) {
    tdKycDeleteStatus('Invalid verification record identifier.',true);return;
  }
  const dossier=allRecords.find(r=>String(r.uid||r.id)===uid);
  if(!dossier) { tdKycDeleteStatus('This record is no longer in the current list. Refresh first.',true);return; }
  const previousDisabled=button.disabled;
  button.disabled=true;
  try {
    const session=await tdKycOwnerSession();
    if(uid===session.uid) throw Error('The official owner identity cannot be deleted from this hub.');
    const reason=await customPrompt({
      title:'Remove ID verification record',
      message:'Why should this ID dossier be deleted? The user account and posts will remain. Keep the reason factual; never enter a full ID number.',
      placeholder:'Example: duplicate or incorrect ID submission',
      confirmText:'Review deletion',cancelText:'Cancel'
    });
    if(reason===null) return;
    const cleanReason=String(reason).trim();
    if(cleanReason.length<5 || cleanReason.length>240) throw Error('Enter a reason between 5 and 240 characters.');
    const confirmed=await customConfirm({
      title:'Delete selected ID dossier?',
      message:'Selected account: '+String(dossier.name||dossier.fullName||'Applicant')+
        ' ('+uid+'). The ID records and user verification references will be removed. The user account will not be deleted.',
      warningText:'This action is difficult to undo. Private uploaded image objects may require separate storage cleanup.',
      confirmText:'Delete ID record',cancelText:'Keep record',type:'danger',icon:'🗑️',tag:'Security Team'
    });
    if(!confirmed) return;
    // Verify the signed-in owner token a second time immediately before writing.
    await tdKycOwnerSession();
    const rtdb=getDatabase();
    if(!rtdb || typeof rtdb.ref!=='function') throw Error('Verification database is offline. Nothing was deleted.');
    const userSnapshot=await rtdb.ref('users/'+uid).once('value');
    if(!userSnapshot.exists()) throw Error('The registered user could not be found. Refresh the vault.');
    const profileSnapshot=await rtdb.ref('publicProfiles/'+uid).once('value');
    const storeSnapshot=await rtdb.ref('stores/'+uid).once('value');
    const logRef=rtdb.ref('securityReviews').push();
    if(!logRef.key) throw Error('Could not prepare the deletion audit record.');
    const removedAt=Date.now(), changes={};
    changes['buyerKycRecords/'+uid]=null;
    changes['identityVerifications/'+uid]=null;
    tdKycIdentityFields.forEach(key=>{changes['users/'+uid+'/'+key]=null;});
    changes['users/'+uid+'/verified']=false;
    changes['users/'+uid+'/accountVerified']=false;
    changes['users/'+uid+'/kycDeletedAt']=removedAt;
    if(profileSnapshot.exists()) {
      changes['publicProfiles/'+uid+'/verified']=false;
      changes['publicProfiles/'+uid+'/accountVerified']=false;
      changes['publicProfiles/'+uid+'/verificationStatus']=null;
      changes['publicProfiles/'+uid+'/accountVerificationStatus']=null;
    }
    if(storeSnapshot.exists()) {
      ['ghanaCardNumber','ghanaCardFrontPath','ghanaCardBackPath','ghanaCardName','ghanaCardDob']
        .forEach(key=>{changes['stores/'+uid+'/'+key]=null;});
    }
    changes['securityReviews/'+logRef.key]={
      action:'verification_dossier_deleted',targetId:uid,actorUid:session.uid,
      deletedAt:removedAt,reason:cleanReason,legacyCleanup:'pending',
      note:'Verification metadata removed; private storage objects not automatically purged'
    };
    tdKycDeleteStatus('Deleting this identity dossier securely…',false);
    // Multi-path RTDB update: metadata deletion and audit entry succeed or fail together.
    await rtdb.ref().update(changes);
    const [kycCheck,identityCheck]=await Promise.all([
      rtdb.ref('buyerKycRecords/'+uid).once('value'),
      rtdb.ref('identityVerifications/'+uid).once('value')
    ]);
    if(kycCheck.exists() || identityCheck.exists())
      throw Error('The database did not confirm deletion. Refresh the hub and verify the record before retrying.');
    let legacyStatus='completed';
    try {
      legacyStatus=await tdKycLegacyCleanup(uid,removedAt);
    } catch(err) {
      legacyStatus='manual_cleanup_required';
      console.warn('Traydaq legacy KYC mirror needs cleanup:',err && err.code ? err.code : 'unavailable');
    }
    try{await logRef.update({legacyCleanup:legacyStatus});}catch(_){}
    allRecords.splice(allRecords.findIndex(r=>String(r.uid||r.id)===uid),1);
    if(legacyStatus==='completed') {
      tdKycDeleteStatus('ID record removed. The user account remains. Deletion logged under History.',false);
      toast('ID dossier removed; account preserved.','success');
    } else {
      tdKycDeleteStatus('Main vault ID removed. Legacy Firestore cleanup needs administrator review; check deletion history.',true);
      toast('Primary ID removed; old copy needs review.','info');
    }
    if(typeof renderAdmin==='function') renderAdmin();
  } catch(err) {
    tdKycDeleteStatus(errMsg(err),true);
    toast('ID deletion stopped: '+errMsg(err),'error');
  } finally {
    button.disabled=previousDisabled;
  }
}
async function tdKycShowHistory(button) {
  button.disabled=true;
  try {
    await tdKycOwnerSession();
    const rtdb=getDatabase();
    if(!rtdb || typeof rtdb.ref!=='function') throw Error('Security audit database is offline.');
    const snap=await rtdb.ref('securityReviews').orderByChild('action')
      .equalTo('verification_dossier_deleted').limitToLast(100).once('value');
    const events=[];
    snap.forEach(entry=>{
      const event=entry.val()||{};
      if(event.action==='verification_dossier_deleted' && typeof event.targetId==='string') events.push(event);
    });
    events.sort((a,b)=>Number(b.deletedAt||0)-Number(a.deletedAt||0));
    const rows=events.length ? events.map(event=>
      '<div class="rounded-xl border border-gray-200 bg-white p-3 text-xs break-words">'+
      '<div class="font-bold text-gray-900">Deleted ID record: '+esc(event.targetId)+'</div>'+
      '<div class="text-gray-600 mt-1">'+esc(new Date(Number(event.deletedAt||0)).toLocaleString())+
      ' · Actor UID: '+esc(event.actorUid||'unknown')+'</div>'+
      '<div class="text-gray-700 mt-1">Reason: '+esc(event.reason||'Not specified')+'</div>'+
      '<div class="text-gray-600 mt-1">Legacy cleanup: '+esc(event.legacyCleanup||'pending')+'</div>'+
      '</div>'
    ).join('') : '<p class="text-sm text-gray-600">No deleted ID dossiers recorded yet.</p>';
    modal('<section class="space-y-3 max-h-[75vh] overflow-y-auto">'+
      '<div class="flex items-center justify-between gap-3"><h2 class="text-lg font-black text-gray-900">ID Deletion History</h2>'+
      '<button type="button" data-close-modal class="border border-gray-200 bg-white text-gray-800 px-3 py-2 rounded-xl">Close</button></div>'+
      '<p class="text-xs text-gray-600">Owner-only activity log. Full ID numbers and document images are never copied into this history.</p>'+
      rows+'</section>');
  } catch(err) {
    tdKycDeleteStatus('Unable to load deletion history: '+errMsg(err),true);
  } finally { button.disabled=false; }
}
function tdKycHistoryBind(allRecords) {
  const workspace=$('adminWorkspace');
  if(!workspace) return;
  workspace.addEventListener('click',event=>{
    const button=event.target.closest('[data-td-delete-dossier]');
    if(button){tdKycDeleteDossier(button.dataset.tdDeleteDossier,allRecords,button);return;}
    const history=event.target.closest('#tdKycHistoryBtn');
    if(history) tdKycShowHistory(history);
  });
}
