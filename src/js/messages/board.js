export class MessageBoard {
  constructor({ list, badge, toggle }) {
    this.list = list;
    this.badge = badge;
    this.toggle = toggle;
    this.labels = {};
    this.items = [];
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
      }
    }
    for (const item of [...this.items].reverse()) {
      const li = document.createElement('li');
      li.className = 'mb-3';
      const p = document.createElement('p');
      p.className = item.status === 'error' ? 'mb-1 text-danger' : 'mb-1 text-success';
      p.textContent =
        item.status === 'error'
          ? `${item.url}: ${item.reason}`
          : String(item.url);
      li.appendChild(p);
      if (item.retry) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-outline-primary';
        btn.textContent = this.labels.retry || 'Retry';
        btn.addEventListener('click', item.retry);
        li.appendChild(btn);
      }
      this.list.appendChild(li);
    }
  }
}
