"""Runs every browser test against a local copy of the app.

Needs Python Playwright with Chromium:  pip install playwright && playwright install chromium
Run from the repository root:           python3 tests/e2e/run.py

Each *_e2e.py script talks to http://127.0.0.1:8011 and mocks the Worker, AniList and MangaDex, so nothing leaves
your machine. The runner also fails the run if the page reports any Content-Security-Policy violation.
"""
import atexit, glob, os, subprocess, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
PORT = 8011

WRAP = r'''
import sys, runpy, atexit
from playwright.sync_api import BrowserContext
bad = []
orig = BrowserContext.new_page
def new_page(self, *a, **k):
    page = orig(self, *a, **k)
    page.on('console', lambda m: bad.append(m.text[:200]) if ('Content Security Policy' in m.text or 'Refused to' in m.text) else None)
    return page
BrowserContext.new_page = new_page
def report():
    if bad:
        print('CSP VIOLATIONS:', bad)
        import os; os._exit(3)
atexit.register(report)
runpy.run_path(sys.argv[1], run_name='__main__')
'''

def serve():
    server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    atexit.register(server.terminate)
    for _ in range(40):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{PORT}/index.html', timeout=1).read(1)
            return
        except Exception:
            time.sleep(0.25)
    sys.exit('Could not start the local web server.')

def main():
    serve()
    wrapper = os.path.join(HERE, '.wrap.py')
    with open(wrapper, 'w') as handle:
        handle.write(WRAP)
    atexit.register(lambda: os.path.exists(wrapper) and os.remove(wrapper))
    failed = []
    scripts = sorted(glob.glob(os.path.join(HERE, '*_e2e.py')))
    only = sys.argv[1:]
    for script in scripts:
        name = os.path.basename(script)
        if only and not any(part in name for part in only):
            continue
        print(f'== {name}', flush=True)
        result = subprocess.run([sys.executable, wrapper, script], cwd=HERE)
        if result.returncode != 0:
            failed.append(name)
    print()
    print('FAILED: ' + ', '.join(failed) if failed else f'All {len(scripts)} browser suites passed.')
    sys.exit(1 if failed else 0)

if __name__ == '__main__':
    main()
