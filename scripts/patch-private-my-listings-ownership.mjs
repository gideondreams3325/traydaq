import fs from 'node:fs';
import path from 'node:path';

// Applied to the temporary private checkout by the PUBLIC Traydaq APK builder.
// Only this generic patch is stored in the public repository.
function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) !== -1) {
    throw new Error('Traydaq listing ownership patch: unexpected ' + label);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

// An authenticated Firebase UID is the sole key for "My Listings".
// Never treat 'local_user', a public cached listing, a business name or a
// username as proof that an account owns a vacancy, service or event.
export function tdListingBelongsToSignedInUid(record, uid) {
  const userId = String(uid || '').trim();
  if (!record || typeof record !== 'object' || !record.id ||
      !userId || userId === 'local_user' || userId === 'system_seed') return false;
  const fields = ['creatorId', 'ownerUid', 'ownerId', 'posterId', 'userId',
    'authorId', 'organizerId', 'employerId', 'sellerId', 'postedBy'];
  const ownerId = fields.map(key => String(record[key] || '').trim())
    .find(value => value && value !== 'local_user' && value !== 'system_seed');
  // The first recorded authoritative owner takes precedence. A later field
  // cannot override a different creator's recorded UID.
  return !!ownerId && ownerId === userId;
}

function patchDesk(source, config) {
  const start = source.indexOf(config.start);
  const end = source.indexOf(config.end, start);
  if (start < 0 || end < 0 || end - start > 22000) {
    throw new Error('Traydaq listing ownership patch: ' + config.kind + ' desk boundary changed');
  }
  let desk = source.slice(start, end);
  desk = replaceOnce(desk,
    '  container.innerHTML = `<div class="text-center py-10',
    '  const ownerUid = String(user?.uid || "").trim();\n' +
      '  if (!ownerUid || ownerUid === "local_user") {\n' +
      '    container.textContent = "Sign in again to see your own listings.";\n' +
      '    return;\n' +
      '  }\n' +
      '  container.innerHTML = `<div class="text-center py-10',
    config.kind + ' UID required');

  const rowName = config.kind === 'jobs' ? 'myJobs' : 'myEvents';
  const seenName = config.kind === 'jobs' ? 'seenJobIds' : 'seenEventIds';
  const docCode = '          ' + seenName + '.add(d.id);\n' +
    '          ' + rowName + '.push({ id: d.id, ...d.data() });';
  const newDocCode = '          const row = { ...d.data(), id: d.id };\n' +
    '          if (tdListingBelongsToSignedInUid(row, ownerUid) && !' + seenName + '.has(d.id)) {\n' +
    '            ' + seenName + '.add(d.id);\n' +
    '            ' + rowName + '.push(row);\n' +
    '          }';
  desk = replaceOnce(desk, docCode, newDocCode, config.kind + ' database result filter');

  const localVar = config.kind === 'jobs' ? 'sj' : 'se';
  desk = replaceOnce(desk,
    '        if (' + localVar + ' && ' + localVar + '.id && !' + seenName + '.has(' + localVar + '.id)) {',
    '        if (tdListingBelongsToSignedInUid(' + localVar + ', ownerUid) && !' + seenName + '.has(' + localVar + '.id)) {',
    config.kind + ' saved device records');

  desk = replaceOnce(desk, '        const uId = user.uid || user.id || \'\';',
    '        const uId = ownerUid;', config.kind + ' logged-in ID');
  const oldMatches = config.kind === 'jobs'
    ? "            const matches = !uId || j.creatorId === uId || j.posterId === uId || j.userId === uId || j.employerId === uId || j.creatorId === 'local_user';"
    : "            const matches = !uId || e.creatorId === uId || e.posterId === uId || e.organizerId === uId || e.userId === uId || e.creatorId === 'local_user';";
  const item = config.kind === 'jobs' ? 'j' : 'e';
  desk = replaceOnce(desk, oldMatches,
    '            const matches = tdListingBelongsToSignedInUid(' + item + ', uId);',
    config.kind + ' untrusted API fallback');

  const target = config.kind === 'jobs'
    ? "    const target = _$('jobsContentArea') || container;"
    : "    const target = _$('eventsContentArea') || container;";
  const firstTarget = desk.indexOf(target);
  if (firstTarget < 0) throw new Error('Missing ' + config.kind + ' render target');
  const replacement =
    '    // Account switches and out-of-order asynchronous responses must not\n' +
    '    // put a previous account\'s listings or management buttons on screen.\n' +
    '    if (String(getActiveUser()?.uid || "") !== ownerUid || active' +
      (config.kind === 'jobs' ? "JobsTab !== 'employer_desk'" : "EventsTab !== 'organizer_desk'") + ') return;\n' +
    '    for (let i = ' + rowName + '.length - 1; i >= 0; i--) {\n' +
    '      if (!tdListingBelongsToSignedInUid(' + rowName + '[i], ownerUid)) ' + rowName + '.splice(i, 1);\n' +
    '    }\n' + target,
    config.kind + ' final render verification';
  desk = desk.slice(0, firstTarget) + replacement + desk.slice(firstTarget + target.length);
  return source.slice(0, start) + desk + source.slice(end);
}

export function patchPrivateListingOwnership(source) {
  if (source.includes('tdListingBelongsToSignedInUid')) {
    throw new Error('Traydaq listing ownership patch already applied.');
  }
  const employerAnchor = '// Sub-view: Employer Desk (Manage Posted Jobs & Candidates)';
  source = replaceOnce(source, employerAnchor,
    '// tdOnlyActualListingOwner2026: each account manages only its own listings.\n' +
    tdListingBelongsToSignedInUid.toString() + '\n\n' + employerAnchor,
    'ownership helper insertion');
  source = patchDesk(source, {
    kind: 'jobs',
    start: 'async function renderEmployerDesk(container) {',
    end: '// Modal: Review Candidates for a Job'
  });
  source = patchDesk(source, {
    kind: 'events',
    start: 'async function renderOrganizerDesk(container) {',
    end: '// Modal: Review Registered Attendees for an Event'
  });
  if (!source.includes('tdOnlyActualListingOwner2026') ||
      source.includes("j.creatorId === 'local_user'") ||
      source.includes("e.creatorId === 'local_user'")) {
    throw new Error('Traydaq listing ownership patch left a permissive owner fallback.');
  }
  return source;
}

export function main(root = '.') {
  const file = path.join(path.resolve(root), 'jobs-events.js');
  const original = fs.readFileSync(file, 'utf8');
  const patched = patchPrivateListingOwnership(original);
  new Function(patched);
  fs.writeFileSync(file, patched);
  console.log('PASS: vacancies, entrepreneur services and hosted events require the signed-in listing owner UID.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main(process.argv[2] || '.');
}
