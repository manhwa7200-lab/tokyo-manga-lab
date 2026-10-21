// Routes look like  #library  or  #settings/appearance  (route + optional sub-page).
const ALLOWED_ROUTES = new Set(['home', 'discover', 'library', 'downloads', 'profile', 'settings']);

export function parseRoute(hash) {
  const [path] = String(hash || '#home').replace(/^#/, '').split('?');
  const [route = '', param = ''] = path.split('/');
  if (!ALLOWED_ROUTES.has(route)) return { route: 'home', param: '' };
  return { route, param: /^[a-z0-9-]{1,40}$/.test(param) ? param : '' };
}

export function getCurrentRoute() { return parseRoute(window.location.hash).route; }
export function getRouteParam() { return parseRoute(window.location.hash).param; }

export function bindNavigation(onNavigate) {
  document.querySelectorAll('[data-nav]').forEach(link => {
    link.addEventListener('click', () => {
      const route = link.dataset.nav;
      if (route) onNavigate(route);
    });
  });
  window.addEventListener('hashchange', () => onNavigate(getCurrentRoute()));
}

// Settings lives inside Profile, so the Profile tab stays lit while you are in Settings.
const PARENT_TAB = { settings: 'profile' };

export function updateNavigation(route) {
  const tab = PARENT_TAB[route] || route;
  document.querySelectorAll('[data-nav]').forEach(link => {
    const active = link.dataset.nav === route || (link.closest('.mobile-nav') && link.dataset.nav === tab);
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
