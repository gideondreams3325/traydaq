// Android-friendly picker controls for Traydaq's vacancy and service form.
// Installed inside the Jobs & Events closure by the public APK builder.
function tdInstallEasyJobSelects(modal) {
  const fields = Array.from(modal.querySelectorAll('#postJobForm select'));
  const controls = [];
  let active = null;

  function closePicker(restoreFocus = true) {
    if (!active) return;
    const { overlay, trigger } = active;
    active = null;
    document.removeEventListener('keydown', handleKey, true);
    overlay.remove();
    if (restoreFocus && trigger.isConnected) {
      try { trigger.focus({ preventScroll: true }); } catch (_) { trigger.focus(); }
    }
  }

  function handleKey(event) {
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePicker();
    } else if (event.key === 'Tab') {
      const focusable = Array.from(active.overlay.querySelectorAll('button:not([disabled])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function getLabel(select) {
    const label = select.closest('.td-job-picker-holder')?.parentElement?.querySelector('label');
    return (label?.textContent || select.name || 'Choose an option').replace(/\s*\*\s*$/, '').trim();
  }

  function refresh() {
    for (const { select, button, value } of controls) {
      const chosen = select.options[select.selectedIndex];
      const isPlaceholder = !select.value || !chosen || chosen.disabled;
      value.textContent = chosen?.textContent?.trim() || 'Choose an option';
      value.classList.toggle('td-job-picker-placeholder', isPlaceholder);
      button.disabled = select.disabled;
      button.setAttribute('aria-label', getLabel(select) + ': ' + value.textContent);
      button.setAttribute('aria-required', String(Boolean(select.required)));
    }
  }

  function openPicker(select, trigger) {
    if (!modal.isConnected || select.disabled) return;
    closePicker(false);
    const options = Array.from(select.options).filter(option => !option.disabled && option.value !== '');
    if (!options.length) return;

    const overlay = document.createElement('div');
    overlay.className = 'td-job-picker-overlay';
    const sheet = document.createElement('section');
    sheet.className = 'td-job-picker-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');

    const heading = document.createElement('h3');
    heading.className = 'td-job-picker-heading';
    heading.textContent = getLabel(select);
    heading.id = 'tdJobPickerHeading';
    sheet.setAttribute('aria-labelledby', heading.id);

    const header = document.createElement('div');
    header.className = 'td-job-picker-header';
    const headerText = document.createElement('div');
    const hint = document.createElement('p');
    hint.className = 'td-job-picker-hint';
    hint.textContent = 'Tap anywhere on an option to select it';
    headerText.append(heading, hint);

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'td-job-picker-close';
    dismiss.textContent = '✕';
    dismiss.setAttribute('aria-label', 'Close options');
    dismiss.addEventListener('click', () => closePicker());
    header.append(headerText, dismiss);

    const list = document.createElement('div');
    list.className = 'td-job-picker-list';
    const optionButtons = [];

    for (const option of options) {
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'td-job-picker-option';
      const selected = select.value === option.value;
      choice.classList.toggle('is-selected', selected);
      choice.setAttribute('aria-pressed', String(selected));
      const text = document.createElement('span');
      text.textContent = option.textContent.trim();
      const indicator = document.createElement('span');
      indicator.className = 'td-job-picker-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      indicator.textContent = selected ? '✓' : '';
      choice.append(text, indicator);
      choice.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        select.value = option.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        refresh();
        closePicker();
      });
      list.appendChild(choice);
      optionButtons.push(choice);
    }

    sheet.append(header, list);
    overlay.appendChild(sheet);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closePicker();
    });
    document.body.appendChild(overlay);
    active = { overlay, trigger };
    document.addEventListener('keydown', handleKey, true);
    const selectedIndex = options.findIndex(option => option.value === select.value);
    const focusChoice = optionButtons[Math.max(selectedIndex, 0)];
    try { focusChoice.focus({ preventScroll: true }); } catch (_) { focusChoice.focus(); }
  }

  for (const select of fields) {
    if (!select.id) continue;
    const holder = document.createElement('div');
    holder.className = 'td-job-picker-holder';
    select.parentNode.insertBefore(holder, select);
    holder.appendChild(select);
    select.classList.add('td-job-native-select');
    select.tabIndex = -1;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'td-job-picker-trigger';
    button.setAttribute('aria-haspopup', 'dialog');
    const value = document.createElement('span');
    value.className = 'td-job-picker-current';
    const chevron = document.createElement('span');
    chevron.className = 'td-job-picker-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '⌄';
    button.append(value, chevron);
    holder.appendChild(button);
    controls.push({ select, button, value });

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPicker(select, button);
    });
    select.addEventListener('change', refresh);
    select.addEventListener('invalid', (event) => {
      event.preventDefault();
      openPicker(select, button);
    });
    const label = holder.parentElement?.querySelector('label');
    if (label) {
      label.classList.add('td-job-picker-label');
      label.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openPicker(select, button);
      });
    }
  }
  refresh();
  return refresh;
}
