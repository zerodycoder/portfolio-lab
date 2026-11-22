/** Splits an element's text into per-character spans, keeping the full text available to screen readers. */
export function splitChars(el: HTMLElement): HTMLElement[] {
  const text = (el.textContent ?? '').trim();
  el.setAttribute('aria-label', text);
  el.textContent = '';
  return [...text].map((ch) => {
    const span = document.createElement('span');
    span.className = 'char';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = ch === ' ' ? ' ' : ch;
    el.appendChild(span);
    return span;
  });
}

/** Splits text into word spans. Inline elements such as <em> keep their styling via an extra class. */
export function splitWords(el: HTMLElement): HTMLElement[] {
  const words: HTMLElement[] = [];
  const nodes = Array.from(el.childNodes);
  el.textContent = '';
  const push = (text: string, extraClass?: string): void => {
    text
      .split(/\s+/)
      .filter(Boolean)
      .forEach((w) => {
        const span = document.createElement('span');
        span.className = extraClass ? `word ${extraClass}` : 'word';
        span.textContent = w;
        el.appendChild(span);
        el.appendChild(document.createTextNode(' '));
        words.push(span);
      });
  };
  nodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) push(node.textContent ?? '');
    else if (node instanceof HTMLElement) push(node.textContent ?? '', `is-${node.tagName.toLowerCase()}`);
  });
  return words;
}
