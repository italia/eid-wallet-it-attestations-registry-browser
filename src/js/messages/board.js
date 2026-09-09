export class MessageBoard {
  constructor({ list, badge, toggle }) {
    this.list = list;
    this.badge = badge;
    this.toggle = toggle;
    this.labels = {};
    this.items = [];
  }

  clear() {
    this.items = [];
    this.render();
  }

  setLabels(labels) {
    this.labels = labels || {};
    this.render();
  }

  ok({ url }) {
    this.items.push({ status: 'ok', url, reason: null });
    this.render();
  }

  info(text) {
    this.items.push({ status: 'ok', url: text, reason: null });
    this.render();
  }

  error({ url, reason, retry }) {
    this.items.push({ status: 'error', url, reason, retry });
    this.render();
  }

  setHttpCalls(calls, { retry } = {}) {
    this.items = (calls || []).map((call) => ({
      kind: 'http',
      status: call.ok ? 'ok' : 'error',
      method: call.method || 'GET',
      endpoint: call.endpoint || call.requestUrl || '',
      requestUrl: call.requestUrl || '',
      httpStatus: call.status,
      durationMs: call.durationMs,
      applicationType: call.applicationType || call.contentType || '',
      reason: call.error || null,
      retry: call.ok ? null : retry,
    }));
    this.render();
  }

  render() {
    if (!this.list) return;
    this.list.replaceChildren();
    const errors = this.items.filter((i) => i.status === 'error');
    if (this.badge) {
      if (errors.length) {
        this.badge.textContent = String(errors.length);
        this.badge.classList.remove('d-none');
        this.badge.setAttribute('aria-hidden', 'false');
        this.toggle?.setAttribute('aria-label', `${this.labels.open || ''} (${errors.length})`);
      } else {
        this.badge.classList.add('d-none');
        this.badge.setAttribute('aria-hidden', 'true');
        if (this.labels.open) this.toggle?.setAttribute('aria-label', this.labels.open);
      }
    }
    for (const item of this.items) {
      this.list.appendChild(this.renderItem(item));
    }
  }

  renderItem(item) {
    const li = document.createElement('li');
    li.className = `board-call mb-3 ${item.status === 'error' ? 'board-call-error' : 'board-call-ok'}`;
    if (item.kind === 'http') {
      const endpoint = document.createElement('p');
      endpoint.className = 'board-call-endpoint mb-1';
      endpoint.textContent = `${item.method} ${item.endpoint}`;
      const meta = document.createElement('p');
      meta.className = 'board-call-meta small mb-0';
      const parts = [
        `${this.labels.httpStatus || 'HTTP'} ${item.httpStatus ?? '—'}`,
        item.durationMs != null ? (this.labels.duration || '{{ms}} ms').replace('{{ms}}', String(item.durationMs)) : null,
        item.applicationType || null,
      ].filter(Boolean);
      meta.textContent = parts.join(' · ');
      li.append(endpoint, meta);
      if (item.reason) {
        const reason = document.createElement('p');
        reason.className = 'small text-danger mb-0 mt-1';
        reason.textContent = item.reason;
        li.appendChild(reason);
      }
    } else {
      const p = document.createElement('p');
      p.className = item.status === 'error' ? 'mb-1 text-danger' : 'mb-1 text-success';
      p.textContent =
        item.status === 'error' ? `${item.url}: ${item.reason}` : String(item.url);
      li.appendChild(p);
    }
    if (item.retry) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm btn-outline-primary mt-2';
      btn.textContent = this.labels.retry || 'Retry';
      btn.addEventListener('click', item.retry);
      li.appendChild(btn);
    }
    return li;
  }
}
