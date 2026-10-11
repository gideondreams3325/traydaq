import fs from 'node:fs';

// This script prepares a *candidate* Firebase RTDB rules file in a PRIVATE build
// checkout. Rules are NOT deployed by the Android APK workflow.
// A human must compare the candidate to LIVE rules before any Firebase deployment.
const ALLOWED_ADMIN = "(auth.token.admin === true || auth.token.isAdmin === true || auth.token.isSecurityTeam === true || auth.token.email === 'gideondreams3325@gmail.com' || auth.token.email === 'seller332532@gmail.com')";
const same = f => "(!newData.child('"+f+"').exists() || newData.child('"+f+"').val() === data.child('"+f+"').val())";
const bool = f => "(!newData.child('"+f+"').exists() || newData.child('"+f+"').val() === data.child('"+f+"').val() || (data.child('"+f+"').exists() === false && newData.child('"+f+"').val() === false))";
const allowInitial = (field, statuses) =>
  "(newData.child('"+field+"').val() === data.child('"+field+"').val() || "+
  "(!data.child('"+field+"').exists() && ("+
  statuses.map(v => "newData.child('"+field+"').val() === '"+v+"'").join(' || ')+
  " || !newData.child('"+field+"').exists())))";
export function patchVerificationRulesText(input){
 const original=JSON.parse(input);
 const rules=original.rules;
 if(!rules||!rules.users?.['$uid']||!rules.publicProfiles?.['$uid']||!rules.identityVerifications?.['$uid']||!rules.buyerKycRecords?.['$uid'])throw Error('Firebase RTDB rule shape changed: abort');
 if(rules.blueBadgeGrants||rules.blueBadgeAudit)throw Error('Blue badge rules already exist or were changed: audit manually');
 const allFields = [
  bool('accountVerified'), allowInitial('accountVerificationStatus',['PENDING','REVIEW','pending','review','none']),
  same('verifiedAt'),same('verifiedBy'),same('verificationConfidence'),
  bool('blueVerified'),bool('blueCheckVerified'),bool('hasBlueCheck'),bool('blueBadgeGranted')
 ];
 const ownerConstraint = extra => '(auth.uid !== $uid || '+ALLOWED_ADMIN+' || ('+extra.join(' && ')+'))';
 for(const path of ['users','publicProfiles']){
  const node=rules[path]['$uid'];
  if(typeof node['.write']!=='string'||!node['.write'].includes('auth.uid === $uid'))throw Error('Owner write rules changed: '+path);
  node['.write']='('+node['.write']+') && '+ownerConstraint(allFields);
 }
 for(const path of ['identityVerifications','buyerKycRecords']){
  const node=rules[path]['$uid'];
  if(typeof node['.write']!=='string'||!node['.write'].includes('auth.uid === $uid'))throw Error('Verification write rules changed: '+path);
  const extra=[bool('accountVerified'),same('verifiedAt'),same('verifiedBy'),bool('blueVerified'),bool('blueCheckVerified'),bool('hasBlueCheck'),bool('blueBadgeGranted'),
    allowInitial('status',['PENDING','pending','REVIEW','review','none'])];
  node['.write']='('+node['.write']+') && '+ownerConstraint(extra);
 }
 rules.blueBadgeGrants={'.read':false,'.write':false};
 rules.blueBadgeAudit={'.read':false,'.write':false};
 return JSON.stringify(original,null,2)+'\n';
}
if(process.argv[1]&&import.meta.url==='file://'+process.argv[1]){
 const filepath=(process.argv[2]||'.').replace(/\/$/,'')+'/database.rules.json';
 const before=fs.readFileSync(filepath,'utf8');
 const after=patchVerificationRulesText(before);
 fs.writeFileSync(filepath,after);
 console.log('PASS: candidate RTDB rules protect blue grants, blue audit and verified identity fields. NOT DEPLOYED.');
}
