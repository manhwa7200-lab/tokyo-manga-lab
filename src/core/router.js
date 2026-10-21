const ALLOWED_ROUTES = new Set(['home', 'discover', 'library', 'downloads', 'profile', 'settings']);

export function getCurrentRoute() {
  const route = String(window.location.hash || '#home').slice(1).split('?')[0];
  return ALLOWED_ROUTES.has(route) ? route : 'home';
}

export function bindNavigation(onNavigate) {
  document.querySelectorAll('[data-nav]').forEach(link => {
    link.addEventListener('click', () => {
      const route = link.dataset.nav;
      if (route) onNavigate(route);
    });
  });
  window.addEventListener('hashchange', () => onNavigate(getCurrentRoute()));
}

export function updateNavigation(route) {
  document.querySelectorAll('[data-nav]').forEach(link => {
    const active = link.dataset.nav === route;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
