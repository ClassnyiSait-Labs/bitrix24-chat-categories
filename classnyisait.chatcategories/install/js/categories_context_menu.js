/**
 * custom.chatcategories — context menu patch for RecentMenu
 *
 * Adds "Категории" item to the right-click context menu on chats.
 * Clicking opens a centered modal with category checkboxes.
 *
 * Data is read from window.__chatCatState (populated by categories_core.js).
 */
(function () {
	'use strict';

	var ACTION_PREFIX = 'classnyisait:chatcategories.Controller.Category.';

	function log(msg) {
		if (window.LB_DEBUG) { try { console.log(msg); } catch (e) {} }
	}

	// =========================================================
	// Shared state helpers — read/write window.__chatCatState
	// =========================================================

	function getState() {
		return window.__chatCatState || null;
	}

	function isDialogInCategory(categoryId, dialogId) {
		var state = getState();
		if (!state || !state.categoryChats) return false;
		var list = state.categoryChats[categoryId];
		if (!Array.isArray(list)) return false;
		var did = String(dialogId);
		return list.indexOf(did) !== -1 || list.indexOf(dialogId) !== -1;
	}

	function toggleChat(categoryId, dialogId, callback) {
		var isIn = isDialogInCategory(categoryId, dialogId);
		var action = isIn ? 'removeChat' : 'addChat';

		BX.ajax.runAction(ACTION_PREFIX + action, {
			data: { categoryId: categoryId, dialogId: String(dialogId) }
		}).then(function () {
			var state = getState();
			if (state) {
				if (!state.categoryChats) state.categoryChats = {};
				var list = state.categoryChats[categoryId] || [];
				var did = String(dialogId);
				if (isIn) {
					state.categoryChats[categoryId] = list.filter(function (d) { return String(d) !== did; });
				} else {
					list.push(did);
					state.categoryChats[categoryId] = list;
				}
			}
			if (window.__chatCatRefresh) window.__chatCatRefresh();
			if (callback) callback();
		}).catch(function (err) {
			log('[ChatCat] toggleChat error:', err);
		});
	}

	// =========================================================
	// Ensure category chats are loaded for all categories
	// =========================================================

	var _chatsLoadPromise = null;

	function ensureAllChatsLoaded() {
		var state = getState();
		if (!state || !state.loaded) return Promise.reject('state not ready');
		if (_chatsLoadPromise) return _chatsLoadPromise;

		var missing = state.categories.filter(function (cat) {
			return !state.categoryChats.hasOwnProperty(cat.id);
		});

		if (missing.length === 0) return Promise.resolve();

		log('[ChatCat] loading chats for ' + missing.length + ' categories');
		_chatsLoadPromise = Promise.all(missing.map(function (cat) {
			return BX.ajax.runAction(ACTION_PREFIX + 'getChats', {
				data: { categoryId: cat.id }
			}).then(function (resp) {
				state.categoryChats[cat.id] = resp.data.dialogIds || [];
			});
		})).then(function () {
			_chatsLoadPromise = null;
		}).catch(function (err) {
			_chatsLoadPromise = null;
			log('[ChatCat] ensureAllChatsLoaded error:', err);
		});

		return _chatsLoadPromise;
	}

	// =========================================================
	// Category popup — centered modal with checkboxes
	// =========================================================

	function showCategoryPopup(dialogId) {
		log('[ChatCat] showCategoryPopup, dialogId=' + dialogId);
		var popupId = 'custom-cat-assign-popup';

		var existing = document.getElementById(popupId);
		if (existing) existing.remove();

		var state = getState();
		var categories = (state && state.categories) || [];

		// Overlay
		var overlay = document.createElement('div');
		overlay.id = popupId;
		overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);z-index:10000;display:flex;align-items:center;justify-content:center;';

		// Modal box
		var box = document.createElement('div');
		box.style.cssText = 'background:#fff;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.15);padding:12px 0;min-width:220px;max-width:320px;';

		var titleEl = document.createElement('div');
		titleEl.style.cssText = 'padding:8px 16px 10px;font-size:14px;font-weight:600;border-bottom:1px solid #eee;margin-bottom:4px;';
		titleEl.textContent = 'Категории';
		box.appendChild(titleEl);

		var itemsContainer = document.createElement('div');
		box.appendChild(itemsContainer);

		function renderItems() {
			itemsContainer.innerHTML = '';

			if (categories.length === 0) {
				var empty = document.createElement('div');
				empty.style.cssText = 'padding:12px 16px;color:#999;font-size:13px;';
				empty.textContent = (!state || !state.loaded) ? 'Загрузка...' : 'Нет категорий';
				itemsContainer.appendChild(empty);
				return;
			}

			categories.forEach(function (cat) {
				var isIn = isDialogInCategory(cat.id, dialogId);

				var row = document.createElement('div');
				row.style.cssText = 'padding:8px 16px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px;';
				row.addEventListener('mouseenter', function () { row.style.background = '#f5f5f5'; });
				row.addEventListener('mouseleave', function () { row.style.background = ''; });

				var check = document.createElement('span');
				check.style.cssText = 'width:18px;height:18px;text-align:center;line-height:18px;color:#3bc8f5;font-weight:bold;border:1px solid #ccc;border-radius:3px;font-size:12px;';
				check.textContent = isIn ? '\u2713' : '';

				var name = document.createElement('span');
				name.textContent = cat.name;

				row.appendChild(check);
				row.appendChild(name);

				row.addEventListener('click', function (e) {
					e.stopPropagation();
					toggleChat(cat.id, dialogId, renderItems);
				});

				itemsContainer.appendChild(row);
			});
		}

		// Render immediately with whatever data we have, then load missing chats
		renderItems();

		if (state && state.loaded) {
			ensureAllChatsLoaded().then(function () {
				renderItems(); // re-render with full chat data
			});
		}

		overlay.appendChild(box);
		document.body.appendChild(overlay);
		log('[ChatCat] overlay appended');

		overlay.addEventListener('click', function (e) {
			if (e.target === overlay) overlay.remove();
		});
		var escHandler = function (e) {
			if (e.key === 'Escape' || e.keyCode === 27) {
				overlay.remove();
				document.removeEventListener('keydown', escHandler);
			}
		};
		document.addEventListener('keydown', escHandler);
	}

	// =========================================================
	// Patch RecentMenu.getMenuOptions (NOT getMenuItems —
	// because MainMenu in sidebar overrides getMenuItems
	// without calling super, so getMenuItems patch is bypassed)
	// =========================================================

	function getAllRecentMenuClasses() {
		var classes = [];
		try {
			var c = BX.Messenger.v2.Lib.RecentMenu;
			if (c) classes.push(c);
		} catch (e) {}
		try {
			var c = BX.Messenger.v2.Lib.Menu.RecentMenu;
			if (c && classes.indexOf(c) === -1) classes.push(c);
		} catch (e) {}
		try {
			var c = BX.Messenger.Embedding.LibLegacy.RecentMenu;
			if (c && classes.indexOf(c) === -1) classes.push(c);
		} catch (e) {}
		return classes;
	}

	function applyPatch(RecentMenuClass) {
		if (!RecentMenuClass || RecentMenuClass.__chatCatContextPatched) return;
		RecentMenuClass.__chatCatContextPatched = true;

		var BaseProto = Object.getPrototypeOf(RecentMenuClass.prototype);
		var origGetMenuOptions = BaseProto && BaseProto.getMenuOptions;

		if (!origGetMenuOptions) {
			log('[ChatCat] no getMenuOptions on base prototype, skip');
			return;
		}

		RecentMenuClass.prototype.getMenuOptions = function () {
			var opts = origGetMenuOptions.call(this);
			var dialogId = this.context ? this.context.dialogId : null;

			log('[ChatCat] getMenuOptions, dialogId=' + dialogId);
			if (!dialogId) return opts;

			var self = this;
			var handler = function () {
				log('[ChatCat] "Категории" clicked, dialogId=' + dialogId);
				if (self.menuInstance) {
					try { self.menuInstance.close(); } catch (e) {}
				}
				setTimeout(function () {
					showCategoryPopup(dialogId);
				}, 0);
			};

			opts.items = opts.items || [];
			opts.items.push({
				text: 'Категории',
				title: 'Категории',
				onclick: handler,
				onClick: handler
			});

			return opts;
		};

		log('[ChatCat] Patched: ' + (RecentMenuClass.name || 'RecentMenu'));
	}

	function patchAllRecentMenus() {
		var classes = getAllRecentMenuClasses();
		classes.forEach(applyPatch);
		return classes.length > 0;
	}

	// Property traps for lazy-loaded classes
	function setupTraps() {
		try {
			var ns = BX.Messenger && BX.Messenger.v2;
			if (ns) {
				if (!ns.Lib) ns.Lib = {};
				setupSingleTrap(ns.Lib, 'RecentMenu');
				if (!ns.Lib.Menu) ns.Lib.Menu = {};
				setupSingleTrap(ns.Lib.Menu, 'RecentMenu');
			}
		} catch (e) {}

		try {
			var emb = BX.Messenger && BX.Messenger.Embedding;
			if (emb) {
				if (!emb.LibLegacy) emb.LibLegacy = {};
				setupSingleTrap(emb.LibLegacy, 'RecentMenu');
			}
		} catch (e) {}
	}

	function setupSingleTrap(obj, prop) {
		if (obj[prop]) {
			applyPatch(obj[prop]);
			return;
		}
		var current = obj[prop];
		try {
			Object.defineProperty(obj, prop, {
				get: function () { return current; },
				set: function (val) {
					current = val;
					if (val) setTimeout(function () { applyPatch(val); }, 0);
				},
				configurable: true,
				enumerable: true
			});
		} catch (e) {}
	}

	// =========================================================
	// Init
	// =========================================================

	function init() {
		patchAllRecentMenus();
		setupTraps();

		var attempts = 0;
		var maxAttempts = 120;
		var intervalId = setInterval(function () {
			attempts++;
			patchAllRecentMenus();
			if (attempts > maxAttempts) {
				clearInterval(intervalId);
			}
		}, 500);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
