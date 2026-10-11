import fs from 'node:fs';

// This patch runs only after the public builder checks out private Traydaq source.
// Never copy private HTML, credentials, messages, or user data into this repository.
function replaceOnce(source, before, after, label) {
  const at = source.indexOf(before);
  if (at < 0 || source.indexOf(before, at + before.length) !== -1) {
    throw new Error('Traydaq Inbox source changed (' + label + '); refusing unsafe change');
  }
  return source.slice(0, at) + after + source.slice(at + before.length);
}
function patchBetween(source, begin, end, transform, label) {
  const a = source.indexOf(begin), b = source.indexOf(end, a + begin.length);
  if (a < 0 || b < a || source.indexOf(begin, a + 1) >= 0) {
    throw new Error('Traydaq Inbox handler changed (' + label + ')');
  }
  return source.slice(0, a) + transform(source.slice(a, b)) + source.slice(b);
}
export function patchInboxChat(source) {
  if (source.includes('TRAYDAQ_INBOX_RTDB_PATH_FIX_V1')) {
    throw new Error('Inbox RTDB fix already applied');
  }

  source = patchBetween(source,
    '  window.saveEditChatMessage = async function(cid, mid) {',
    '  window.deleteChatMessage = async function(cid, mid) {', part => {
      part = replaceOnce(part,
        `      const msgRef = doc(db, 'messages', cid, mid);
      await updateDoc(msgRef, {
        text: clean,
        edited: true,
        editedAt: serverTimestamp()
      });`,
        `      // TRAYDAQ_INBOX_RTDB_PATH_FIX_V1: /messages/{cid}/{mid} is RTDB, not Firestore.
      const rt = getRtdbSafe();
      if (!rt?.ref || !currentUser?.uid) throw Error('Connect to the internet to edit a message.');
      const msgRef = rt.ref('messages/' + cid + '/' + mid);
      const original = (await msgRef.once('value')).val();
      if (!original || original.senderId !== currentUser.uid) {
        throw Error('Only your own messages can be edited.');
      }
      await msgRef.update({ text: clean, edited: true, editedAt: Date.now() });`,
        'edit RTDB message');
      part = replaceOnce(part,
        `        const convoRef = doc(db, 'conversations', cid);
        const cSnap = await getDoc(convoRef);
        if (cSnap.exists() && cSnap.data().lastSenderId === currentUser?.uid) {
          await updateDoc(convoRef, { lastMessage: clean, updatedAt: serverTimestamp() });
        }`,
        `        const convoRef = rt.ref('conversations/' + cid);
        const conversation = (await convoRef.once('value')).val();
        if (conversation?.lastSenderId === currentUser.uid &&
            conversation?.lastMessage === original.text) {
          await convoRef.update({ lastMessage: clean, updatedAt: Date.now() });
        }`,
        'edit conversation preview');
      return part;
    }, 'edit function');

  source = patchBetween(source,
    '  window.deleteChatMessage = async function(cid, mid) {',
    '  window.toggleMessageReaction = async function(cid, mid, emoji) {', part => {
      part = replaceOnce(part,
        `      const msgRef = doc(db, 'messages', cid, mid);
      await deleteDoc(msgRef);`,
        `      const rt = getRtdbSafe();
      if (!rt?.ref || !currentUser?.uid) throw Error('Connect to the internet to delete a message.');
      const msgRef = rt.ref('messages/' + cid + '/' + mid);
      const original = (await msgRef.once('value')).val();
      if (!original || original.senderId !== currentUser.uid) {
        throw Error('Only your own messages can be deleted.');
      }
      await msgRef.remove();`,
        'delete RTDB message');
      part = replaceOnce(part,
        `        const msgsSnap = await getDocs(query(collection(db, 'messages', cid), orderBy('createdAt', 'desc'), limit(1)));
        const convoRef = doc(db, 'conversations', cid);
        if (!msgsSnap.empty) {
          const lData = msgsSnap.docs[0].data();
          await updateDoc(convoRef, { lastMessage: lData.text || '', lastSenderId: lData.senderId || '', updatedAt: lData.createdAt || serverTimestamp() });
        } else {
          await updateDoc(convoRef, { lastMessage: '', updatedAt: serverTimestamp() });
        }`,
        `        const convoRef = rt.ref('conversations/' + cid);
        const convo = (await convoRef.once('value')).val();
        if (convo?.lastMessage === original.text && convo?.lastSenderId === original.senderId) {
          const latestSnap = await rt.ref('messages/' + cid)
            .orderByChild('createdAt').limitToLast(1).once('value');
          const latest = Object.values(latestSnap.val() || {})[0] || null;
          await convoRef.update({
            lastMessage: latest?.text || '',
            lastSenderId: latest?.senderId || '',
            updatedAt: latest?.createdAt || Date.now()
          });
        }`,
        'delete conversation preview');
      return part;
    }, 'delete function');

  source = patchBetween(source,
    '  window.toggleMessageReaction = async function(cid, mid, emoji) {',
    '  window.deleteConversation = async function(cid, e) {', part => {
      part = replaceOnce(part,
        `      const latest=await getDoc(doc(db,'messages',cid,mid));
      const message=snapshotExists(latest)?latest:await getDoc(doc(db,'conversations',cid,'messages',mid));
      if(!snapshotExists(message))return;
      const vote=rt.ref('messageReactions/'+cid+'/'+mid+'/'+actor);
      const stored=(await vote.once('value')).val();
      const legacy=Object.entries(message.data()?.reactions||{}).find(([em,users])=>Array.isArray(users)&&users.includes(actor))?.[0]||'none';`,
        `      const live = (await rt.ref('messages/'+cid+'/'+mid).once('value')).val();
      let message = live;
      if (!message) {
        const old = await getDoc(doc(db,'conversations',cid,'messages',mid));
        message = snapshotExists(old) ? old.data() : null;
      }
      if (!message) return;
      const vote = rt.ref('messageReactions/'+cid+'/'+mid+'/'+actor);
      const stored = (await vote.once('value')).val();
      const legacy = Object.entries(message.reactions||{}).find(([em,users]) =>
        Array.isArray(users) && users.includes(actor))?.[0] || 'none';`,
        'reaction existing message');
      return part;
    }, 'reaction function');

  source = patchBetween(source,
    '     let legacyChatDocs = [];',
    '     // /messages/{cid} is an RTDB collection, not a document.', part => {
      const at = part.indexOf("     const messagesColl = collection(db,'messages',cid);");
      if (at < 0 || part.indexOf("     const messagesColl = collection(db,'messages',cid);", at + 1) >= 0) {
        throw Error('Traydaq Inbox legacy message-loading block changed');
      }
      // Preserve the existing renderer and one historical, valid Firestore subcollection
      // but make the RTDB subscription below authoritative for live messages.
      part = part.slice(0, at) + `     // Legacy Firestore history (if present); new messages are read exclusively from RTDB.
     getDocs(query(collection(db,'conversations',cid,'messages'),limit(300)))
       .then(old => {
         if (window._activeConversationId !== cid) return;
         legacyChatDocs = old?.docs || [];
         sortAndRender(lastModernChatRows);
       })
       .catch(err => console.warn('Historical messages unavailable:', err?.message || err));

`;
      return part;
    }, 'message loading');

  // If a message was migrated from Firestore to RTDB with the same ID, render it once.
  source = replaceOnce(source,
    '       const sorted = [...legacyChatDocs,...rawDocs].sort((a,b) => {',
    `       const byId = new Map();
       for (const row of [...legacyChatDocs, ...rawDocs]) byId.set(row.id, row);
       const sorted = [...byId.values()].sort((a,b) => {`,
    'deduplicate legacy/live history');

  const badRefs = [
    /collection\(db\s*,\s*['"]messages['"]\s*,\s*cid\s*\)/,
    /doc\(db\s*,\s*['"]messages['"]\s*,\s*cid\s*,\s*mid\s*\)/
  ];
  for (const regex of badRefs) if (regex.test(source)) {
    throw Error('Unsafe Firestore messages path remains: ' + regex);
  }
  return source;
}
if (process.argv[1] && import.meta.url === 'file://' + process.argv[1]) {
  const path = (process.argv[2] || '.') + '/index.html';
  const before = fs.readFileSync(path, 'utf8');
  const after = patchInboxChat(before);
  if (before === after) throw Error('Inbox fix made no changes');
  fs.writeFileSync(path, after);
  console.log('PASS: TRAYDAQ Inbox uses RTDB for live chat; valid Firestore only for legacy history.');
}
