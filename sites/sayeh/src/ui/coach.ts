import { $ } from '@portfolio-lab/kit/dom';

/**
 * Contextual hints: a small note at the bottom of the screen that suggests the next thing to try, after a quiet
 * moment, once per visit per hint. Pages schedule hints with a condition (still worth saying?); a route change
 * cancels whatever is pending.
 */
export class Coach {
  private el = $('[data-coach]');
  private timers: number[] = [];
  private hideTimer = 0;
  private said = new Set<string>();

  say(text: string, ms = 5200): void {
    this.el.innerHTML = `<span class="coach__leaf" aria-hidden="true"></span><span>${text}</span>`;
    this.el.classList.add('is-shown');
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hide(), ms);
  }

  hide(): void {
    this.el.classList.remove('is-shown');
  }

  /** Says `text` after `delay` ms if `when()` is still true then, at most once per visit for this key. */
  hint(key: string, text: string, delay: number, when: () => boolean = () => true): void {
    if (this.said.has(key)) return;
    const t = window.setTimeout(() => {
      if (this.said.has(key) || !when()) return;
      this.said.add(key);
      this.say(text);
    }, delay);
    this.timers.push(t);
  }

  /** Forget a hint without saying it (the visitor already did the thing). */
  done(key: string): void {
    this.said.add(key);
  }

  cancel(): void {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    this.hide();
  }
}
