# Changelog

Version numbers follow the Bitrix Marketplace releases of the module.

## [1.0.20] — 2026-08-24

### Changed
- Runtime JS/CSS are published to `/bitrix/js/classnyisait.chatcategories/` and `/bitrix/css/classnyisait.chatcategories/` (InstallFiles + CopyDirFiles on include).
- The browser no longer requests assets from `/bitrix/modules/…` (403 on typical nginx / Bitrix 26.650+).

## [1.0.19] — 2026-08-22

### Changed
- A chat added via “+ Add chat” appears in the category list immediately, without a reload.
- “+ Add chat” button matches the stock Recent style (white background, blue text).

## [1.0.18] — 2026-08-22

### Added
- Stand badge in /online/: first line is the portal version (SM_VERSION), then all installed classnyisait.* modules (id + version).
- Module ships `.settings.php` / `module.settings.php`; creating a category no longer requires a reload.

## [1.0.17] — 2026-08-22

### Changed
- Creating a category in /online/ closes the modal and adds the folder in the sidebar via interfaceButtons.addMenuItem / NavigationManager.open, without location.reload().
- Category folders show again in Bitrix24 v26 messenger (customCat_* via NavigationManager / LayoutManager).
- ACTION_PREFIX is classnyisait:chatcategories.Category.* (not Controller).
- “+ Category” in the chat context menu also works in top_menu_id_collaboration.
- Hotfix: restore module .settings.php (controllers/defaultNamespace).

## [1.0.16] — 2026-08-09

### Added
- Safe uninstall flow: tables and stored categories are dropped only when the administrator
  explicitly chooses to remove the data.

## [1.0.15] — 2026-08-08

### Changed
- Module settings page updates.

## [1.0.14] — 2026-08-08

### Added
- "Support the developer" link.

## [1.0.13] and earlier

Initial Marketplace releases: personal chat categories (up to 50 per user), adding chats from the
context menu, renaming and deleting categories, drag & drop tab ordering.
