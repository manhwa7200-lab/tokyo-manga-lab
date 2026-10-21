# Adding settings, profile sections and planned features

Everything below is data. You do not need to touch the screen code for the common cases.

## Add a setting
1. Add the key and its default to `DEFAULT_SETTINGS` in `src/features/settings/settings-service.js`.
2. Add an item to a sub-category in `src/features/settings/settings-schema.js`:
   - `toggle` (on/off), `select` (with `options: [[value, label], ...]`), `action`, `link`, `info`, or `planned`.
3. Read it in code with `state.settings.yourKey`. If it changes how the app looks, apply it in `applyTheme()` in `src/app.js`.
4. Run `npm test`. A test fails if a key is missing a default, a select default is not one of its options, or an icon name is wrong.

## Add a settings category (class) or sub-category
- Category: a new object in `SETTINGS_CATEGORIES` with `id`, `title`, `icon`, `summary` and `groups`. It gets its own page at `#settings/<id>`.
- Sub-category: a new object in a category's `groups` with `id`, `title` and `items`.
- Set `planned: true` on a category that is not built yet. It shows a "Planned" badge.

## Add a planned feature
Add an entry to `src/features/feature-registry.js` with the screens it belongs to (`profile`, `home`, `discover`, `library`, `downloads`). It shows up under "Planned for this screen" and, for `profile`, under "Coming later". When the feature ships, delete the entry.

## Add a live Profile row
Add a row to a group in `src/features/profile/profile-sections.js` with an `href` such as `#library` or `#settings/appearance`.

## Add an icon
Add a 24x24 stroke path to `src/shared/icons.js`. Use it with `icon('name')`, or `<span data-icon="name"></span>` in `index.html`.

## Add a new screen
Add the route name to `ALLOWED_ROUTES` in `src/core/router.js` and a renderer to the `renderers` object in `src/app.js`.
