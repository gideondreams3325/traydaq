// Side-effect-free eligibility validation shared by Edge Function and tests.
export function eligibleVideoPost(post,viewerUid){
  if(!post||typeof post!=='object'||Array.isArray(post)||!viewerUid)return false;
  if(post.deleted||post.isDeleted||post.isPermanentlyDeleted||post.hidden||
     post.safeContent===false||post.liveOnForYou===false)return false;
  const owner=String(post.sellerId||post.authorId||'');
  if(!owner||owner===viewerUid)return false;
  if(['private','followers'].includes(String(post.privacy||'public').toLowerCase()))return false;
  if(['removed','deleted','hidden','violation','rejected','taken_down','pending_review'].includes(
    String(post.status||'').toLowerCase()))return false;
  if(['removed','deleted','hidden','violation','rejected','taken_down','pending_review'].includes(
    String(post.reviewStatus||'').toLowerCase()))return false;
  const media=Array.isArray(post.media)?post.media[0]:post.media;
  return [post.mediaType,post.type,post.postType,post.kind,media?.type,media?.mimeType]
    .some(value=>/video/i.test(String(value||'')))||
    /\.(mp4|webm|mov|m4v|ogv)(?:[?#]|$)/i.test(String(post.mediaUrl||post.videoUrl||''));
}
