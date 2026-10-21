import { getCurrentRoute, updateNavigation } from './router.js';

export class AppController {
  constructor({ root, renderers }) {
    this.root = root;
    this.renderers = renderers;
    this.renderSequence = 0;
    this.route = getCurrentRoute();
  }

  async navigate(route = getCurrentRoute()) {
    this.route = route;
    updateNavigation(route);
    const sequence = ++this.renderSequence;
    this.root.setAttribute('aria-busy', 'true');
    try {
      const renderer = this.renderers[route] || this.renderers.home;
      const markup = await renderer();
      if (sequence !== this.renderSequence) return;
      this.root.innerHTML = markup;
      this.root.removeAttribute('aria-busy');
    } catch (error) {
      if (sequence !== this.renderSequence) return;
      this.root.removeAttribute('aria-busy');
      console.error('Screen render failed:', error);
      this.root.innerHTML = '<section class="surface surface-pad"><h2>We hit a snag</h2><p>This screen could not be loaded. Your local library data has not been intentionally removed.</p><button class="button" data-action="retry-screen">Try again</button></section>';
    }
  }

  currentRoute() { return this.route; }
}
