# Smoke test checklist

- Open `index.html` via HTTP (not `file://`).
- Confirm Home and Discover load; search `One Piece`; confirm result titles/covers if the API is reachable.
- Turn off the network and confirm the local library and settings still open; search should show a clear offline message or cached catalogue entries.
- Add a title, set it to Reading, favourite it, create a collection and add the title to it.
- Refresh the browser and confirm the library and settings remain.
- Export a JSON backup, remove a library title, then re-import the backup and confirm records return.
- Check the default adult-content preference is off and enabling it does not add a source.
- Confirm the service worker only caches same-origin app files and does not intercept the Cloudflare Worker or external image requests.
- Test narrow mobile viewport and keyboard focus on controls.
