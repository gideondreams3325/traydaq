import fs from 'node:fs';

export const COMMENT_LIKES_RULES = {
  '$postId': {
    '.read': true,
    '$commentId': {
      '$uid': {
        '.write': "auth != null && auth.uid === $uid && root.child('posts').child($postId).exists() && !root.child('deletedPosts').child($postId).exists() && (!newData.exists() || newData.val() === true || newData.val() === false)",
        '.validate': "newData.val() === true || newData.val() === false"
      }
    }
  }
};

// Adds ONLY the isolated /commentLikes path. Existing RTDB permissions
// are preserved exactly, including private identity/account records.
export function patchRules(source) {
  const rules = typeof source === 'string' ? JSON.parse(source) : structuredClone(source);
  if (!rules || !rules.rules || typeof rules.rules !== 'object' || Array.isArray(rules.rules))
    throw Error('TRAYDAQ comment likes: malformed RTDB security rules.');
  if (Object.prototype.hasOwnProperty.call(rules.rules, 'commentLikes')) {
    if (JSON.stringify(rules.rules.commentLikes) !== JSON.stringify(COMMENT_LIKES_RULES))
      throw Error('TRAYDAQ comment likes: existing rules differ; manual reconciliation required.');
    return rules; // exact idempotence
  }
  rules.rules.commentLikes = COMMENT_LIKES_RULES;
  return rules;
}

if (process.argv[1] && import.meta.url === 'file://' + process.argv[1]) {
  const input = process.argv[2], output = process.argv[3];
  if (!input || !output) throw Error('Usage: patch-private-comment-like-rules.mjs input.json output.json');
  const source = fs.readFileSync(input, 'utf8');
  const changed = patchRules(source);
  fs.writeFileSync(output, JSON.stringify(changed,null,2)+'\n', {mode:0o600});
  console.log('PASS: isolated, UID-owned comment like permission staged; no other rules modified.');
}