import assert from 'node:assert/strict';
import fs from 'node:fs';
import { patchVacanciesCompact, VACANCIES_COMPACT_ID } from '../scripts/patch-private-vacancies-compact.mjs';

const css = fs.readFileSync(new URL('../assets/traydaq-vacancies-compact.css',import.meta.url),'utf8');
const js = fs.readFileSync(new URL('../assets/traydaq-vacancies-compact.js',import.meta.url),'utf8');
const anchors = ['id="jobsContentArea"','id="jobsListContainer"',
 'id="jobSearchInput"','id="jobCategorySelect"','id="jobRegionSelect"',
 'id="listingTypeFilters"','data-apply-job=','data-contact-entrepreneur=',
 'data-tab="my_applications"','data-tab="employer_desk"'].join('\n');
const html='<html><head></head><body><main id="page"></main></body></html>';
const output=patchVacanciesCompact(html,anchors,css,js);
assert.match(output,/id="tdVacanciesCompact2026Style"/);
assert.match(output,/id="tdVacanciesCompact2026Script"/);
assert.ok(output.includes('panel.appendChild(button)'));
assert.ok(output.includes('filterField(\'Category\',category)'));
assert.ok(output.includes("select.dispatchEvent(new Event('change'"));
assert.ok(output.includes("details.textContent = 'Details'"));
assert.ok(output.includes("contact.textContent = 'Message'"));
assert.ok(output.includes("apply.textContent = 'Apply'"));
assert.ok(output.includes('td-vacancy-card-actions'));
assert.ok(output.includes("existingWrap || select"));
assert.ok(output.includes('MutationObserver'));
assert.ok(output.includes("event.key !== 'Escape'"));
assert.ok(output.includes('min-height:38px!important'));
assert.equal((output.match(/id="tdVacanciesCompact2026Script"/g)||[]).length,1);
const embedded=output.match(/<script id="tdVacanciesCompact2026Script">([\s\S]*?)<\/script>/);
assert.ok(embedded);
new Function(embedded[1]);
assert.throws(()=>patchVacanciesCompact(output,anchors,css,js),/already installed/);
assert.throws(()=>patchVacanciesCompact(html,'',css,js),/changed jobs anchor/);
assert.throws(()=>patchVacanciesCompact(html,anchors,'',js),/incomplete assets/);
console.log('PASS: compact vacancy toolbar, grouped navigation, accessible actions, safe re-entry.');
