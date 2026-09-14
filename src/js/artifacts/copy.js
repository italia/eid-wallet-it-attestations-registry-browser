/** Copy-to-clipboard control for artifact panes (raw, encoded, decoded). */

const COPIED_MS = 2000;

function copyIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon icon-sm');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute(
    'd',
    'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
  );
  svg.appendChild(path);
  return svg;
}

export async function copyToClipboard(text) {
  const value = String(text ?? '');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy failed');
}

function setCopyLabel(btn, text) {
  btn.setAttribute('aria-label', text);
  btn.title = text;
  const hidden = btn.querySelector('.visually-hidden');
  if (hidden) hidden.textContent = text;
}

export function createCopyButton(getText, t) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm btn-outline-primary btn-icon artifact-copy';
  const idle = t('artifacts.copy');
  btn.append(copyIcon(), Object.assign(document.createElement('span'), { className: 'visually-hidden', textContent: idle }));
  setCopyLabel(btn, idle);

  let resetTimer = 0;
  btn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    try {
      await copyToClipboard(typeof getText === 'function' ? getText() : getText);
      btn.classList.add('is-copied');
      setCopyLabel(btn, t('artifacts.copied'));
    } catch {
      btn.classList.remove('is-copied');
      setCopyLabel(btn, t('artifacts.copyFailed'));
    }
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      btn.classList.remove('is-copied');
      setCopyLabel(btn, t('artifacts.copy'));
    }, COPIED_MS);
  });
  return btn;
}

/** Wrap a content node with a top bar and a copy control on the right. */
export function wrapCopyable(contentEl, getText, t, { start } = {}) {
  const view = document.createElement('div');
  view.className = 'artifact-view';
  const bar = document.createElement('div');
  bar.className = 'artifact-view-bar';
  if (start) bar.appendChild(start);
  bar.appendChild(createCopyButton(getText, t));
  view.append(bar, contentEl);
  return view;
}
