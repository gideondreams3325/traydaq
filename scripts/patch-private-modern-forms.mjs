import fs from 'node:fs';
import path from 'node:path';

// Traydaq public-builder-only patch. Never stores or exports private source.
const fail = (message) => { throw new Error('Traydaq modern forms: '+message); };
const one = (str, needle, replacement, label) => {
  const first=str.indexOf(needle);
  if(first<0 || str.indexOf(needle,first+needle.length)!==-1) fail('changed anchor: '+label);
  return str.slice(0,first)+replacement+str.slice(first+needle.length);
};

export function patchModernFormPages(indexHtml, jobsJs, css) {
  if(indexHtml.includes('id="tdModernForms2026"') || jobsJs.includes('td-form-dialog')) {
    fail('already installed; refusing double insertion');
  }
  if(!css.includes('#applyJobModal .td-form-dialog') || !css.includes('font-size: 16px')) {
    fail('form stylesheet is incomplete');
  }
  const headMatches=[...indexHtml.matchAll(/<\/head\s*>/gi)];
  if(headMatches.length!==1) fail('expected one </head> in index.html');
  const style='<style id="tdModernForms2026">\n'+css.replace(/<\/style/gi,'<\\/style')+'\n</style>\n';
  indexHtml=indexHtml.slice(0,headMatches[0].index)+style+indexHtml.slice(headMatches[0].index);

  const fn='async function openApplyJobModal(jobId) {';
  const from=jobsJs.indexOf(fn);
  if(from<0||jobsJs.indexOf(fn,from+fn.length)!==-1) fail('job application function missing');
  const next=jobsJs.indexOf('// Modal: Job Details Viewer',from);
  if(next<0) fail('job application boundary missing');
  let segment=jobsJs.slice(from,next);
  const modalClass="  modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in';";
  segment=one(segment,modalClass,
    "  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in';",
    'modal overlay');
  const htmlStart=segment.indexOf('  modal.innerHTML = \x60');
  const htmlStop=segment.indexOf('  \x60;\n  document.body.appendChild(modal);',htmlStart);
  if(htmlStart<0||htmlStop<0) fail('application HTML template anchors missing');
  const newMarkup = "\n    <div class=\"td-form-dialog\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"tdApplyHeading\" aria-describedby=\"tdApplyCompany\">\n      <header class=\"td-form-top\">\n        <div class=\"td-form-topline\">\n          <span class=\"td-form-eyebrow\">TRAYDAQ · JOB APPLICATION</span>\n          <button id=\"closeApplyModalBtn\" type=\"button\" aria-label=\"Back to job listing\">\n            <span aria-hidden=\"true\">←</span> Back\n          </button>\n        </div>\n        <h3 id=\"tdApplyHeading\" class=\"td-form-title\">Apply for ${_esc(jobData?.title || 'Position')}</h3>\n        <p id=\"tdApplyCompany\" class=\"td-form-subtitle\">at ${_esc(jobData?.companyName || 'Verified Employer')}</p>\n      </header>\n      <form id=\"applyJobForm\" autocomplete=\"on\">\n        <div class=\"td-form-fields\">\n          <div class=\"td-form-field\">\n            <label class=\"td-form-label\" for=\"applicantName\">Full name <span class=\"td-required\" aria-hidden=\"true\">*</span></label>\n            <input class=\"td-form-control\" type=\"text\" id=\"applicantName\" name=\"applicantName\" autocomplete=\"name\" maxlength=\"120\" required value=\"${_esc(getActiveProfile()?.name || getActiveUser()?.displayName || '')}\" />\n          </div>\n          <div class=\"td-form-field\">\n            <label class=\"td-form-label\" for=\"applicantEmail\">Email address <span class=\"td-required\" aria-hidden=\"true\">*</span></label>\n            <input class=\"td-form-control\" type=\"email\" id=\"applicantEmail\" name=\"applicantEmail\" autocomplete=\"email\" inputmode=\"email\" required value=\"${_esc(getActiveUser()?.email || '')}\" />\n          </div>\n          <div class=\"td-form-field\">\n            <label class=\"td-form-label\" for=\"applicantPhone\">WhatsApp phone number <span class=\"td-required\" aria-hidden=\"true\">*</span></label>\n            <input class=\"td-form-control\" type=\"tel\" id=\"applicantPhone\" name=\"applicantPhone\" autocomplete=\"tel\" inputmode=\"tel\" maxlength=\"20\" required placeholder=\"e.g. 024 123 4567\" />\n          </div>\n          <div class=\"td-form-field\">\n            <label class=\"td-form-label\" for=\"applicantCover\">Cover note / introduction</label>\n            <textarea class=\"td-form-control\" id=\"applicantCover\" name=\"applicantCover\" rows=\"4\" maxlength=\"4000\" placeholder=\"Briefly describe your experience and interest in this role\"></textarea>\n            <p class=\"td-form-help\">Optional — help the employer understand your experience.</p>\n          </div>\n          <div class=\"td-form-field\">\n            <label class=\"td-form-label\" for=\"applicantCvFile\">CV / résumé</label>\n            <div class=\"td-form-upload\">\n              <label class=\"td-form-file-trigger\" for=\"applicantCvFile\">↑ Choose file</label>\n              <span class=\"td-form-file-name\" id=\"tdCvName\" aria-live=\"polite\">No file selected</span>\n              <input class=\"td-visually-hidden\" type=\"file\" id=\"applicantCvFile\" name=\"applicantCvFile\" accept=\".pdf,.doc,.docx,image/*\" aria-describedby=\"tdCvHelp tdCvName\" />\n            </div>\n            <p class=\"td-form-help\" id=\"tdCvHelp\">Optional · PDF, Word or image · Maximum 10 MB</p>\n          </div>\n          <div class=\"td-form-safety\">\n            <label for=\"applicantScamAck\">\n              <input type=\"checkbox\" id=\"applicantScamAck\" name=\"applicantScamAck\" required />\n              <span>I understand that I should <strong>never pay money or send MoMo</strong> to apply for this job. I will report requests for payment.</span>\n            </label>\n          </div>\n        </div>\n        <footer class=\"td-form-actions\">\n          <button id=\"submitApplicationBtn\" type=\"submit\" class=\"td-form-submit\">Send Application</button>\n        </footer>\n      </form>\n    </div>\n";
  const newTemplate='  modal.innerHTML = \x60'+newMarkup+'  \x60;\n  document.body.appendChild(modal);';
  segment=segment.slice(0,htmlStart)+newTemplate+
    segment.slice(htmlStop+'  \x60;\n  document.body.appendChild(modal);'.length);

  const close="  modal.querySelector('#closeApplyModalBtn').onclick = () => modal.remove();";
  const fileUi=[
    "  const tdCvInput = modal.querySelector('#applicantCvFile');",
    "  const tdCvName = modal.querySelector('#tdCvName');",
    "  tdCvInput.addEventListener('change', () => {",
    "    const file = tdCvInput.files?.[0];",
    "    if(file && file.size > 10 * 1024 * 1024) {",
    "      tdCvInput.value = '';",
    "      tdCvName.textContent = 'File too large (10 MB maximum).';",
    "      tdCvName.style.color = '#a32222';",
    "      return;",
    "    }",
    "    tdCvName.style.color = '';",
    "    tdCvName.textContent = file ? file.name : 'No file selected';",
    "  });",
    close
  ].join('\n');
  segment=one(segment,close,fileUi,'file picker label');

  const fileRead="        const file = fileInput.files[0];";
  segment=one(segment,fileRead,[
    fileRead,
    "        if(file.size > 10 * 1024 * 1024) throw new Error('CV must be 10 MB or smaller.');",
    "        if(!/\.(pdf|doc|docx)$/i.test(file.name) && !file.type.startsWith('image/')) {",
    "          throw new Error('Upload a PDF, Word document or image.');",
    "        }"
  ].join('\n'),'file format and size validation');
  jobsJs=jobsJs.slice(0,from)+segment+jobsJs.slice(next);

  for(const value of ['id="applyJobForm"','id="applicantEmail"','id="applicantScamAck"',
      'class="td-form-actions"','id="tdCvName"','10 * 1024 * 1024']) {
    if(!jobsJs.includes(value)) fail('required form element lost: '+value);
  }
  return { indexHtml, jobsJs };
}

if(process.argv[1] && import.meta.url==='file://'+process.argv[1]) {
  const root=path.resolve(process.argv[2]||'.');
  const cssPath=process.argv[3];
  if(!cssPath) fail('expected public stylesheet path');
  const htmlFile=path.join(root,'index.html'),jobsFile=path.join(root,'jobs-events.js');
  const originalHtml=fs.readFileSync(htmlFile,'utf8');
  const originalJobs=fs.readFileSync(jobsFile,'utf8');
  const updated=patchModernFormPages(originalHtml,originalJobs,fs.readFileSync(cssPath,'utf8'));
  // Only write after every source anchor and invariant has passed.
  fs.writeFileSync(htmlFile,updated.indexHtml);
  fs.writeFileSync(jobsFile,updated.jobsJs);
  console.log('PASS: shared light-theme forms + responsive job-application modal installed.');
}
