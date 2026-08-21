/**
 * custom.chatcategories — core runtime patches
 *
 * Patches:
 * 1. Messenger component — listComponent/contentComponent for customCat_* layouts
 * 2. LayoutManager — isValidLayout, isChatLayout (accept customCat_*)
 * 3. NavigationManager — open() handler for customCat_*
 * 4. RecentListContainer — onChatClick preserves customCat_* layout
 * 5. RecentItem — isChatSelected for customCat_* layout
 * 6. Menu active state fix
 * 7. LegacyRecentService — getCollection filters by category dialogIds
 * 8. UI: "+" button for creating categories, context menu on category items
 * 9. "Add chat" button inside category view
 */
(function () {
	'use strict';

	var MENU_PREFIX = 'customCat_';
	var ACTION_PREFIX = 'classnyisait:chatcategories.Controller.Category.';

	function isCustomCatLayout(name) {
		return typeof name === 'string' && name.indexOf(MENU_PREFIX) === 0;
	}

	function getCategoryIdFromLayout(name) {
		if (!isCustomCatLayout(name)) return null;
		return parseInt(name.substring(MENU_PREFIX.length), 10) || null;
	}

	function log(msg) {
		if (window.LB_DEBUG) { try { console.log('[ChatCat] ' + msg); } catch (e) {} }
	}

	// =========================================================
	// State: categories cache
	// =========================================================

	var categoriesState = {
		categories: [],       // [{id, name, sort}]
		categoryChats: {},    // {categoryId: [dialogId, ...]}
		loaded: false,
		loading: false
	};

	// Expose state for cross-script sync (context menu updates this)
	window.__chatCatState = categoriesState;

	// Vuex module for reactivity: increment version to force getCollection re-evaluation
	var vuexModuleRegistered = false;

	function registerVuexModule() {
		if (vuexModuleRegistered) return;
		var store = getStore();
		if (!store) return;
		vuexModuleRegistered = true;

		store.registerModule('chatCategories', {
			namespaced: true,
			state: function () { return { version: 0 }; },
			mutations: {
				increment: function (state) { state.version++; }
			}
		});
		log('Vuex module chatCategories registered');
	}

	// Call from outside to force list refresh
	window.__chatCatRefresh = function () {
		var store = getStore();
		if (store && store.state.chatCategories) {
			store.commit('chatCategories/increment');
		}
	};

	function loadCategories() {
		if (categoriesState.loading) return Promise.resolve();
		categoriesState.loading = true;

		return BX.ajax.runAction(ACTION_PREFIX + 'list')
			.then(function (response) {
				categoriesState.categories = response.data.categories || [];

				// Update STANDARD_SORTS from server-detected mobile preset
				var mobileSorts = response.data.mobileSorts;
				if (mobileSorts && typeof mobileSorts === 'object' && Object.keys(mobileSorts).length > 0) {
					STANDARD_SORTS = mobileSorts;
					log('Mobile sorts loaded from server: ' + JSON.stringify(STANDARD_SORTS));
				}

				categoriesState.loaded = true;
				categoriesState.loading = false;
				log('Loaded ' + categoriesState.categories.length + ' categories');

				// Proactively load all category chat lists for initial badge computation.
				// Runs in parallel; badge updates as each category resolves.
				Promise.all(
					(categoriesState.categories || []).map(function (cat) {
						return loadCategoryChats(cat.id).then(function () {
							updateCategoryBadge(cat.id);
						});
					})
				).catch(function () {});

				return categoriesState.categories;
			})
			.catch(function (error) {
				log('Load categories error: ' + JSON.stringify(error));
				categoriesState.loading = false;
			});
	}

	function loadCategoryChats(categoryId) {
		return BX.ajax.runAction(ACTION_PREFIX + 'getChats', {
			data: { categoryId: categoryId }
		}).then(function (response) {
			categoriesState.categoryChats[categoryId] = response.data.dialogIds || [];
			log('Category ' + categoryId + ': ' + categoriesState.categoryChats[categoryId].length + ' chats');
			return categoriesState.categoryChats[categoryId];
		}).catch(function (error) {
			log('Load chats error: ' + JSON.stringify(error));
			return [];
		});
	}

	// =========================================================
	// 1. Patch Messenger component — listComponent/contentComponent
	// =========================================================

	function patchMessengerComponent() {
		ensureNamespace('BX.Messenger.v2.Component');

		var patched = false;
		var ns = BX.Messenger.v2.Component;

		// Capture the existing descriptor (may be dealchat's trap)
		var prevDescriptor = Object.getOwnPropertyDescriptor(ns, 'Messenger');
		var prevSetter = prevDescriptor && prevDescriptor.set;
		var origMessenger = ns.Messenger; // read via existing getter if any

		Object.defineProperty(ns, 'Messenger', {
			get: function () { return origMessenger; },
			set: function (val) {
				origMessenger = val;
				// Chain: call previous setter first (dealchat's trap)
				if (prevSetter) {
					prevSetter(val);
				}
				// Then apply our patch
				if (val && val.computed && !patched) {
					patched = true;
					applyMessengerPatch(val);
				}
			},
			configurable: true,
			enumerable: true
		});

		if (origMessenger && origMessenger.computed && !patched) {
			patched = true;
			applyMessengerPatch(origMessenger);
		}
	}

	function applyMessengerPatch(comp) {
		var origList = comp.computed.listComponent;
		var origContent = comp.computed.contentComponent;

		// Create a proxy that overrides layoutName for the original function
		function withChatLayout(self) {
			return new Proxy(self, {
				get: function (target, prop) {
					if (prop === 'layoutName') return 'chat';
					return target[prop];
				}
			});
		}

		comp.computed.listComponent = function () {
			if (isCustomCatLayout(this.layoutName)) {
				try {
					return origList.call(withChatLayout(this));
				} catch (e) {
					return null;
				}
			}
			return origList.call(this);
		};

		comp.computed.contentComponent = function () {
			if (isCustomCatLayout(this.layoutName)) {
				try {
					return origContent.call(withChatLayout(this));
				} catch (e) {
					return null;
				}
			}
			return origContent.call(this);
		};

		log('Messenger component patched');
	}

	// =========================================================
	// 2. Patch RecentListContainer — preserve customCat_* on click
	// =========================================================

	function patchRecentListContainer() {
		ensureNamespace('BX.Messenger.v2.Component.List');

		var patched = false;
		var ns = BX.Messenger.v2.Component.List;
		var prevDescriptor = Object.getOwnPropertyDescriptor(ns, 'RecentListContainer');
		var prevSetter = prevDescriptor && prevDescriptor.set;
		var origComp = ns.RecentListContainer;

		Object.defineProperty(ns, 'RecentListContainer', {
			get: function () { return origComp; },
			set: function (val) {
				origComp = val;
				if (prevSetter) prevSetter(val);
				if (val && val.methods && !patched) {
					patched = true;
					applyRecentContainerPatch(val);
				}
			},
			configurable: true,
			enumerable: true
		});

		if (origComp && origComp.methods && !patched) {
			patched = true;
			applyRecentContainerPatch(origComp);
		}
	}

	function applyRecentContainerPatch(comp) {
		var origOnChatClick = comp.methods.onChatClick;

		comp.methods.onChatClick = function (dialogId) {
			var currentLayout = this.$store.state.application.layout.name;
			if (isCustomCatLayout(currentLayout)) {
				this.$emit('selectEntity', {
					layoutName: currentLayout,
					entityId: dialogId
				});
				return;
			}
			return origOnChatClick.call(this, dialogId);
		};

		log('RecentListContainer patched');
	}

	// =========================================================
	// 3. Patch RecentItem — isChatSelected
	// =========================================================

	function patchRecentItem() {
		ensureNamespace('BX.Messenger.v2.Component.List');

		var patched = false;
		var ns = BX.Messenger.v2.Component.List;
		var prevDescriptor = Object.getOwnPropertyDescriptor(ns, 'RecentItem');
		var prevSetter = prevDescriptor && prevDescriptor.set;
		var origComp = ns.RecentItem;

		Object.defineProperty(ns, 'RecentItem', {
			get: function () { return origComp; },
			set: function (val) {
				origComp = val;
				if (prevSetter) prevSetter(val);
				if (val && val.computed && val.computed.isChatSelected && !patched) {
					patched = true;
					applyRecentItemPatch(val);
				}
			},
			configurable: true,
			enumerable: true
		});

		if (origComp && origComp.computed && origComp.computed.isChatSelected && !patched) {
			patched = true;
			applyRecentItemPatch(origComp);
		}
	}

	function applyRecentItemPatch(comp) {
		var origIsChatSelected = comp.computed.isChatSelected;

		comp.computed.isChatSelected = function () {
			if (this.layout && isCustomCatLayout(this.layout.name)) {
				return this.layout.entityId === this.recentItem.dialogId;
			}
			return origIsChatSelected.call(this);
		};

		log('RecentItem patched');
	}

	// =========================================================
	// 4. Patch LayoutManager — isValidLayout, isChatLayout
	// =========================================================

	function patchLayoutManager() {
		var lib = getLib();
		if (!lib || !lib.LayoutManager) return false;

		var proto = lib.LayoutManager.prototype;

		if (proto.__chatCatPatched) return true;
		proto.__chatCatPatched = true;

		var origIsValid = proto.isValidLayout;
		proto.isValidLayout = function (name) {
			if (isCustomCatLayout(name)) return true;
			return origIsValid.call(this, name);
		};

		var origIsChatLayout = proto.isChatLayout;
		proto.isChatLayout = function (name) {
			if (isCustomCatLayout(name)) return true;
			return origIsChatLayout.call(this, name);
		};

		// Patch setLayout: for customCat layouts, bypass dealchat's CRM redirect
		// by dispatching directly to Vuex store (skipping all monkey-patches)
		var patchedSetLayout = proto.setLayout;
		proto.setLayout = function (payload) {
			if (payload && isCustomCatLayout(payload.name)) {
				log('setLayout bypass for ' + payload.name);
				// Save last opened element (original setLayout does this but we bypass it)
				if (payload.entityId && typeof this.setLastOpenedElement === 'function') {
					this.setLastOpenedElement(payload.name, payload.entityId);
				}
				var store = getStore();
				if (store) {
					return store.dispatch('application/setLayout', payload);
				}
			}
			return patchedSetLayout.call(this, payload);
		};

		log('LayoutManager patched');
		return true;
	}

	// =========================================================
	// 5. Patch NavigationManager.open — handle customCat_* click
	// =========================================================

	function patchNavigationManager() {
		var lib = getLib();
		if (!lib || !lib.NavigationManager) return false;

		var nm = lib.NavigationManager;
		if (nm.__chatCatPatched) return true;
		nm.__chatCatPatched = true;

		var origOpen = nm.open.bind(nm);
		nm.open = function (payload) {
			if (payload && isCustomCatLayout(payload.id)) {
				log('NavigationManager.open intercepted for ' + payload.id);
				patchLayoutManager();
				var lm = getLayoutManager();
				if (lm) {
					var entityId = payload.entityId || '';
					// Restore last opened chat if no specific entity requested
					if (!entityId && typeof lm.getLastOpenedElement === 'function') {
						entityId = lm.getLastOpenedElement(payload.id) || '';
					}
					lm.setLayout({ name: payload.id, entityId: entityId });
				}
				return;
			}
			return origOpen(payload);
		};

		log('NavigationManager patched');
		return true;
	}

	// =========================================================
	// 6. Menu active state fix
	// =========================================================

	function initMenuFix() {
		try {
			var EventEmitter = BX.Event && BX.Event.EventEmitter;
			if (!EventEmitter) return false;

			EventEmitter.subscribe('IM.Layout:onLayoutChange', function (event) {
				var data = event.getData();
				if (!data || !data.to) return;

				var toName = data.to.name;
				var fromName = data.from ? data.from.name : '';

				if (isCustomCatLayout(toName)) {
					setTimeout(function () {
						var chatMenu = getChatMenu();
						if (chatMenu) chatMenu.setActive(toName);
					}, 0);
				}

				if (isCustomCatLayout(fromName)) {
					setTimeout(function () {
						var chatMenu = getChatMenu();
						if (chatMenu) chatMenu.unsetActive(fromName);
					}, 0);
				}
			});

			log('Menu active state fix initialized');
			return true;
		} catch (e) {
			return false;
		}
	}

	// =========================================================
	// 7. Patch LegacyRecentService — getCollection & loadNextPage
	// =========================================================

	function patchLegacyRecentService() {
		var Service = window.BX
			&& BX.Messenger
			&& BX.Messenger.v2
			&& BX.Messenger.v2.Service;

		if (!Service || !Service.LegacyRecentService) return false;

		var LRS = Service.LegacyRecentService;
		if (LRS.__chatCatPatched) return true;
		LRS.__chatCatPatched = true;

		var originalGetCollection = LRS.prototype.getCollection;

		LRS.prototype.getCollection = function () {
			var layout = getCurrentLayoutName();
			if (isCustomCatLayout(layout)) {
				var catId = getCategoryIdFromLayout(layout);
				var store = getStore();
				// Read version counter to create Vue reactive dependency
				var _v = store && store.state.chatCategories ? store.state.chatCategories.version : 0;
				if (store && catId && categoriesState.categoryChats[catId]) {
					var dialogIds = categoriesState.categoryChats[catId];
					var collection = store.state.recent.collection;
					var result = [];
					dialogIds.forEach(function (dialogId) {
						if (collection[dialogId]) {
							result.push(collection[dialogId]);
						}
					});
					return result;
				}
				return [];
			}
			return originalGetCollection.call(this);
		};

		log('LegacyRecentService patched');
		return true;
	}

	// =========================================================
	// 8. Layout change watcher — load category chats
	// =========================================================

	function watchLayout() {
		var store = getStore();
		if (!store) return false;

		// Watch layout.name only (not deep) so that autoSelectFirstChat updating entityId
		// does not re-trigger this watcher and cause a duplicate getChats request.
		store.watch(
			function () {
				return store.state.application && store.state.application.layout
					&& store.state.application.layout.name;
			},
			function (newName) {
				if (!isCustomCatLayout(newName)) return;

				var catId = getCategoryIdFromLayout(newName);
				if (!catId) return;

				loadCategoryChats(catId).then(function (dialogIds) {
					var layout = store.state.application && store.state.application.layout;
					if (layout && !layout.entityId && dialogIds.length > 0) {
						autoSelectFirstChat(catId);
					}
					updateCategoryBadge(catId);
				});
			}
		);

		log('Layout watcher initialized');
		return true;
	}

	function autoSelectFirstChat(categoryId) {
		var store = getStore();
		if (!store) return;

		var dialogIds = categoriesState.categoryChats[categoryId] || [];
		if (dialogIds.length === 0) return;

		// Find first dialog that exists in recent
		var collection = store.state.recent.collection;
		var firstDialogId = null;
		for (var i = 0; i < dialogIds.length; i++) {
			if (collection[dialogIds[i]]) {
				firstDialogId = dialogIds[i];
				break;
			}
		}

		if (!firstDialogId) firstDialogId = dialogIds[0];

		var lm = getLayoutManager();
		if (lm) {
			log('autoSelect: ' + firstDialogId);
			lm.setLayout({ name: MENU_PREFIX + categoryId, entityId: firstDialogId });
		}
	}

	// =========================================================
	// 9. UI: "+" button for creating categories
	// =========================================================

	function initCreateCategoryButton() {
		var menuContainer = document.getElementById('chat-menu');
		if (!menuContainer) return false;

		// Watch for navigation menu render to re-inject context menus on category items
		var observer = new MutationObserver(function () {
			injectCategoryContextMenus();
		});

		observer.observe(menuContainer, { childList: true, subtree: true });
		injectCategoryContextMenus();

		return true;
	}

	// =========================================================
	// 9b. "+ Категория" as a context menu item (like "Настроить меню")
	// =========================================================

	function hookMoreMenuItems() {
		if (!window.BX || !BX.Main || !BX.Main.interfaceButtons) return false;
		var proto = BX.Main.interfaceButtons.prototype;
		if (!proto || !proto.getMoreMenuItems) return false;
		if (proto.__chatCatPlusMenuHooked) return true;
		proto.__chatCatPlusMenuHooked = true;

		var orig = proto.getMoreMenuItems;
		proto.getMoreMenuItems = function () {
			var result = orig.call(this);

			// Only patch the chat-menu instance
			if (!this.listContainer || this.listContainer.id !== 'chat-menu') {
				return result;
			}

			result.push({
				html: '<span class="main-submenu-item-text">+ Категория</span>',
				className: 'custom-cat-create-menu-item',
				onclick: function (e) {
					try {
						var chatMenu = getChatMenu();
						if (chatMenu && chatMenu.closeMoreMenu) chatMenu.closeMoreMenu();
					} catch (err) {}
					var anchor = document.getElementById('chat-menu') || document.body;
					showCreateCategoryPopup(anchor);
					return false;
				}
			});

			return result;
		};

		log('hookMoreMenuItems applied');
		return true;
	}

	function showCreateCategoryPopup(anchorElement) {
		var popupId = 'custom-cat-create-popup';

		if (BX.PopupWindowManager && BX.PopupWindowManager.getPopupById(popupId)) {
			BX.PopupWindowManager.getPopupById(popupId).close();
		}

		var input = document.createElement('input');
		input.type = 'text';
		input.placeholder = 'Название категории';
		input.style.cssText = 'width: 200px; padding: 6px 10px; border: 1px solid #c4c7cc; border-radius: 4px; font-size: 14px; outline: none;';

		var wrapper = document.createElement('div');
		wrapper.style.cssText = 'padding: 10px; display: flex; flex-direction: column; gap: 8px;';

		var btnRow = document.createElement('div');
		btnRow.style.cssText = 'display: flex; gap: 6px; justify-content: space-between; margin-top: 10px;';

		var cancelBtn = document.createElement('button');
		cancelBtn.textContent = 'Отмена';
		cancelBtn.style.cssText = 'padding: 4px 14px; background: rgb(238, 238, 238); color: rgb(51, 51, 51); border: none; border-radius: 4px; cursor: pointer; font-size: 13px; width: 100%;';

		var saveBtn = document.createElement('button');
		saveBtn.textContent = 'Создать';
		saveBtn.style.cssText = 'padding: 4px 14px; background: rgb(59, 200, 245); color: rgb(255, 255, 255); border: none; border-radius: 4px; cursor: pointer; font-size: 13px; width: 100%;';

		btnRow.appendChild(cancelBtn);
		btnRow.appendChild(saveBtn);
		wrapper.appendChild(input);
		wrapper.appendChild(btnRow);

		var popup = new BX.PopupWindow(popupId, null, {
			content: wrapper,
			autoHide: true,
			closeByEsc: true,
			angle: false,
		});

		cancelBtn.addEventListener('click', function () { popup.close(); });
		saveBtn.addEventListener('click', function () { createCategory(input.value, popup); });
		input.addEventListener('keydown', function (e) {
			if (e.key === 'Enter') createCategory(input.value, popup);
			if (e.key === 'Escape') popup.close();
		});

		popup.show();
		var popupEl = popup.popupContainer;
		if (popupEl) {
			popupEl.style.position = 'fixed';
			popupEl.style.left = '50%';
			popupEl.style.top = '50%';
			popupEl.style.transform = 'translate(-50%, -50%)';
			popupEl.style.margin = '0';
		}
		setTimeout(function () { input.focus(); }, 100);
	}

	function createCategory(name, popup) {
		name = (name || '').trim();
		if (!name) return;

		BX.ajax.runAction(ACTION_PREFIX + 'add', {
			data: { name: name }
		}).then(function (response) {
			log('Category created: ' + response.data.id);
			popup.close();
			categoriesState.categories.push(response.data);
			// Reload page to get new navigation menu item
			reloadNavigation();
		}).catch(function (error) {
			log('Create error: ' + JSON.stringify(error));
		});
	}

	// =========================================================
	// 10. Context menu on category navigation items
	// =========================================================

	function injectCategoryContextMenus() {
		var navItems = document.querySelectorAll('#chat-menu .main-buttons-item');
		if (!navItems) return;

		navItems.forEach(function (item) {
			// data-id is lowercased by Bitrix (customcat_1 instead of customCat_1)
			var dataId = item.dataset ? item.dataset.id : null;
			if (!dataId) return;
			// Match both lowercase "customcat_" and original "customCat_"
			if (dataId.indexOf('customcat_') !== 0 && dataId.indexOf('customCat_') !== 0) return;
			if (item.__chatCatContextMenu) return;
			item.__chatCatContextMenu = true;

			// Extract category ID from the data-id (could be lowercase)
			var catIdStr = dataId.replace(/^customcat_/i, '');
			var layoutId = MENU_PREFIX + catIdStr;

			item.addEventListener('contextmenu', function (e) {
				e.preventDefault();
				e.stopPropagation();
				showCategoryContextMenu(item, layoutId, e);
			});
		});
	}

	function showCategoryContextMenu(element, layoutId, event) {
		var catId = getCategoryIdFromLayout(layoutId);
		if (!catId) return;

		var popupId = 'custom-cat-ctx-' + catId;

		// Close existing popup
		try {
			var existing = BX.PopupWindowManager.getPopupById(popupId);
			if (existing) existing.close();
		} catch (e) {}

		var menuItems = [
			{
				text: 'Переименовать',
				onclick: function () {
					try { popup.close(); } catch(e) { popup.popupWindow.close(); }
					showRenameCategoryPopup(element, catId);
				}
			},
			{
				text: 'Удалить',
				onclick: function () {
					try { popup.close(); } catch(e) { popup.popupWindow.close(); }
					if (confirm('Удалить категорию?')) {
						deleteCategory(catId);
					}
				}
			}
		];

		// Try BX.Main.Menu first, fallback to BX.PopupMenuWindow
		if (BX.Main && BX.Main.Menu) {
			var popup = new BX.Main.Menu({
				id: popupId,
				bindElement: element,
				items: menuItems,
				autoHide: true,
				closeByEsc: true,
			});
			popup.show();
		} else if (BX.PopupMenuWindow) {
			var popup = new BX.PopupMenuWindow(popupId, element, menuItems, {
				autoHide: true,
				closeByEsc: true,
			});
			popup.show();
		}
	}

	function showRenameCategoryPopup(anchorElement, categoryId) {
		var cat = categoriesState.categories.find(function (c) { return c.id === categoryId; });
		var currentName = cat ? cat.name : '';

		var popupId = 'custom-cat-rename-' + categoryId;
		if (BX.PopupWindowManager && BX.PopupWindowManager.getPopupById(popupId)) {
			BX.PopupWindowManager.getPopupById(popupId).close();
		}

		var input = document.createElement('input');
		input.type = 'text';
		input.value = currentName;
		input.style.cssText = 'width: 200px; padding: 6px 10px; border: 1px solid #c4c7cc; border-radius: 4px; font-size: 14px; outline: none;';

		var wrapper = document.createElement('div');
		wrapper.style.cssText = 'padding: 10px; display: flex; flex-direction: column; gap: 8px;';

		var btnRow = document.createElement('div');
		btnRow.style.cssText = 'display: flex; gap: 6px; justify-content: space-between; margin-top: 10px;';

		var cancelBtn = document.createElement('button');
		cancelBtn.textContent = 'Отмена';
		cancelBtn.style.cssText = 'padding: 4px 14px; background: rgb(238, 238, 238); color: rgb(51, 51, 51); border: none; border-radius: 4px; cursor: pointer; font-size: 13px; width: 100%;';

		var saveBtn = document.createElement('button');
		saveBtn.textContent = 'Сохранить';
		saveBtn.style.cssText = 'padding: 4px 14px; background: rgb(59, 200, 245); color: rgb(255, 255, 255); border: none; border-radius: 4px; cursor: pointer; font-size: 13px; width: 100%;';

		btnRow.appendChild(cancelBtn);
		btnRow.appendChild(saveBtn);
		wrapper.appendChild(input);
		wrapper.appendChild(btnRow);

		var popup = new BX.PopupWindow(popupId, anchorElement, {
			content: wrapper,
			autoHide: true,
			closeByEsc: true,
			offsetTop: 5,
			angle: true,
		});

		cancelBtn.addEventListener('click', function () { popup.close(); });
		saveBtn.addEventListener('click', function () { renameCategory(categoryId, input.value, popup); });
		input.addEventListener('keydown', function (e) {
			if (e.key === 'Enter') renameCategory(categoryId, input.value, popup);
			if (e.key === 'Escape') popup.close();
		});

		popup.show();
		setTimeout(function () { input.focus(); input.select(); }, 100);
	}

	function renameCategory(categoryId, name, popup) {
		name = (name || '').trim();
		if (!name) return;

		BX.ajax.runAction(ACTION_PREFIX + 'update', {
			data: { id: categoryId, name: name }
		}).then(function () {
			log('Category renamed: ' + categoryId);
			popup.close();
			var cat = categoriesState.categories.find(function (c) { return c.id === categoryId; });
			if (cat) cat.name = name;
			reloadNavigation();
		}).catch(function (error) {
			log('Rename error: ' + JSON.stringify(error));
		});
	}

	function deleteCategory(categoryId) {
		BX.ajax.runAction(ACTION_PREFIX + 'delete', {
			data: { id: categoryId }
		}).then(function () {
			log('Category deleted: ' + categoryId);
			categoriesState.categories = categoriesState.categories.filter(function (c) {
				return c.id !== categoryId;
			});
			delete categoriesState.categoryChats[categoryId];

			// If currently viewing deleted category, switch to chat
			var currentLayout = getCurrentLayoutName();
			if (currentLayout === MENU_PREFIX + categoryId) {
				var lm = getLayoutManager();
				if (lm) lm.setLayout({ name: 'chat', entityId: '' });
			}
			reloadNavigation();
		}).catch(function (error) {
			log('Delete error: ' + JSON.stringify(error));
		});
	}

	// =========================================================
	// 11. "Add chat" button inside category view
	// =========================================================

	function injectAddChatButton() {
		var currentLayout = getCurrentLayoutName();
		if (!isCustomCatLayout(currentLayout)) {
			removeAddChatButton();
			return;
		}

		if (document.querySelector('.custom-cat-add-chat-btn')) return;

		// Insert before the recent list
		var recentList = document.querySelector('.bx-im-recent-list__scope');
		if (!recentList) return;

		var btn = document.createElement('div');
		btn.className = 'custom-cat-add-chat-btn';
		btn.style.cssText = 'padding: 8px 16px; cursor: pointer; color: #3bc8f5; font-size: 13px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #e6e7e8;';
		btn.innerHTML = '<span style="font-size: 16px; line-height: 1;">+</span><span>Добавить чат</span>';
		btn.addEventListener('click', function (e) {
			e.stopPropagation();
			showAddChatPopup(btn, getCategoryIdFromLayout(currentLayout));
		});

		recentList.parentNode.insertBefore(btn, recentList);
	}

	function removeAddChatButton() {
		var btn = document.querySelector('.custom-cat-add-chat-btn');
		if (btn) btn.remove();
	}

	function showAddChatPopup(anchorElement, categoryId) {
		if (!categoryId) return;

		var popupId = 'custom-cat-add-chat-popup';
		if (BX.PopupWindowManager && BX.PopupWindowManager.getPopupById(popupId)) {
			BX.PopupWindowManager.getPopupById(popupId).close();
		}

		var store = getStore();
		if (!store) return;

		var collection = store.state.recent.collection;
		var existingDialogIds = categoriesState.categoryChats[categoryId] || [];

		// Pending changes: track toggled state without saving
		var pendingState = {}; // {dialogId: true/false} — only changed items

		// Build list of available chats
		var chatItems = [];
		Object.keys(collection).forEach(function (dialogId) {
			var dialog = store.getters['chats/get'](dialogId, true);
			var title = dialog ? dialog.name : dialogId;
			var isAdded = existingDialogIds.indexOf(dialogId) !== -1;

			chatItems.push({
				dialogId: dialogId,
				title: title,
				originalState: isAdded,
				isAdded: isAdded
			});
		});

		// Sort: added first, then alphabetically
		chatItems.sort(function (a, b) {
			if (a.isAdded !== b.isAdded) return a.isAdded ? -1 : 1;
			return a.title.localeCompare(b.title);
		});

		// --- Header with title and close button ---
		var header = document.createElement('div');
		header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 10px 14px 6px; border-bottom: 1px solid #e6e7e8;';

		var headerTitle = document.createElement('span');
		headerTitle.textContent = 'Добавить чаты';
		headerTitle.style.cssText = 'font-size: 14px; font-weight: 600; color: #333;';

		var closeBtn = document.createElement('span');
		closeBtn.innerHTML = '&times;';
		closeBtn.style.cssText = 'font-size: 20px; color: #999; cursor: pointer; line-height: 1; padding: 0 2px;';
		closeBtn.title = 'Закрыть';

		header.appendChild(headerTitle);
		header.appendChild(closeBtn);

		// --- Search input ---
		var searchInput = document.createElement('input');
		searchInput.type = 'text';
		searchInput.placeholder = 'Поиск чата...';
		searchInput.style.cssText = 'width: calc(100% - 28px); padding: 6px 10px; margin: 8px 14px 4px; border: 1px solid #c4c7cc; border-radius: 4px; font-size: 13px; outline: none; box-sizing: border-box;';

		// --- Chat list ---
		var listContainer = document.createElement('div');
		listContainer.style.cssText = 'max-height: 260px; overflow-y: auto;';

		function renderList(filter) {
			listContainer.innerHTML = '';
			var filtered = chatItems.filter(function (item) {
				if (!filter) return true;
				return item.title.toLowerCase().indexOf(filter.toLowerCase()) !== -1;
			});

			filtered.forEach(function (item) {
				var row = document.createElement('div');
				row.style.cssText = 'padding: 7px 14px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 8px;';
				row.addEventListener('mouseenter', function () { row.style.background = '#f5f7f8'; });
				row.addEventListener('mouseleave', function () { row.style.background = ''; });

				var checkbox = document.createElement('span');
				checkbox.style.cssText = 'width: 16px; height: 16px; border: 2px solid ' + (item.isAdded ? '#3bc8f5' : '#c4c7cc') + '; border-radius: 3px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 11px; color: #fff; background: ' + (item.isAdded ? '#3bc8f5' : '#fff') + ';';
				checkbox.textContent = item.isAdded ? '\u2713' : '';

				var nameSpan = document.createElement('span');
				nameSpan.textContent = item.title;
				nameSpan.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;';

				row.appendChild(checkbox);
				row.appendChild(nameSpan);

				row.addEventListener('click', function () {
					item.isAdded = !item.isAdded;
					checkbox.style.borderColor = item.isAdded ? '#3bc8f5' : '#c4c7cc';
					checkbox.style.background = item.isAdded ? '#3bc8f5' : '#fff';
					checkbox.textContent = item.isAdded ? '\u2713' : '';

					// Track change
					if (item.isAdded !== item.originalState) {
						pendingState[item.dialogId] = item.isAdded;
					} else {
						delete pendingState[item.dialogId];
					}
				});

				listContainer.appendChild(row);
			});
		}

		searchInput.addEventListener('input', function () {
			renderList(searchInput.value);
		});

		// --- Footer with Apply button ---
		var footer = document.createElement('div');
		footer.style.cssText = 'display: flex; justify-content: flex-end; gap: 6px; padding: 8px 14px; border-top: 1px solid #e6e7e8;';

		var cancelBtn = document.createElement('button');
		cancelBtn.textContent = 'Отмена';
		cancelBtn.style.cssText = 'padding: 6px 16px; background: #f0f0f0; color: #333; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;';

		var applyBtn = document.createElement('button');
		applyBtn.textContent = 'Применить';
		applyBtn.style.cssText = 'padding: 6px 16px; background: #3bc8f5; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;';

		footer.appendChild(cancelBtn);
		footer.appendChild(applyBtn);

		// --- Assemble popup ---
		var wrapper = document.createElement('div');
		wrapper.style.cssText = 'min-width: 280px;';
		wrapper.appendChild(header);
		wrapper.appendChild(searchInput);
		wrapper.appendChild(listContainer);
		wrapper.appendChild(footer);

		renderList('');

		var popup = new BX.PopupWindow(popupId, anchorElement, {
			content: wrapper,
			autoHide: false,
			closeByEsc: true,
			offsetTop: 5,
			angle: true,
			width: 320,
		});

		// --- Event handlers ---
		closeBtn.addEventListener('click', function () { popup.close(); });
		cancelBtn.addEventListener('click', function () { popup.close(); });

		applyBtn.addEventListener('click', function () {
			var dialogIds = Object.keys(pendingState);
			if (dialogIds.length === 0) {
				popup.close();
				return;
			}

			applyBtn.disabled = true;
			applyBtn.textContent = 'Сохранение...';
			applyBtn.style.opacity = '0.6';

			var promises = [];
			dialogIds.forEach(function (dialogId) {
				if (pendingState[dialogId]) {
					promises.push(
						BX.ajax.runAction(ACTION_PREFIX + 'addChat', {
							data: { categoryId: categoryId, dialogId: dialogId }
						})
					);
				} else {
					promises.push(
						BX.ajax.runAction(ACTION_PREFIX + 'removeChat', {
							data: { categoryId: categoryId, dialogId: dialogId }
						})
					);
				}
			});

			Promise.all(promises).then(function () {
				// Update local cache
				var updated = existingDialogIds.slice();
				dialogIds.forEach(function (dialogId) {
					var idx = updated.indexOf(dialogId);
					if (pendingState[dialogId] && idx === -1) {
						updated.push(dialogId);
					} else if (!pendingState[dialogId] && idx !== -1) {
						updated.splice(idx, 1);
					}
				});
				categoriesState.categoryChats[categoryId] = updated;
				log('Applied ' + dialogIds.length + ' changes to category ' + categoryId);
				if (window.__chatCatRefresh) window.__chatCatRefresh();
				popup.close();
			}).catch(function (error) {
				log('Apply error: ' + JSON.stringify(error));
				applyBtn.disabled = false;
				applyBtn.textContent = 'Применить';
				applyBtn.style.opacity = '1';
			});
		});

		popup.show();
		setTimeout(function () { searchInput.focus(); }, 100);
	}

	// =========================================================
	// 12. Sort sync: web menu → DB
	// =========================================================

	// Fallback sort values (default mobile preset). Overwritten at runtime
	// by server-detected mobile preset from listAction → mobileSorts.
	var STANDARD_SORTS = {
		'chat': 100, 'taskstask': 200, 'copilot': 300,
		'collab': 400, 'channel': 500,
		'openlines': 600, 'openlinesv2': 700,
		'notification': 800, 'call': 900, 'market': 1000, 'settings': 1100
	};


	function hookSaveSettings() {
		// BX.Main.interfaceButtons constructor returns a public API object
		// with .bind()-ed copies of methods. Internal code calls this.saveSettings()
		// on the PRIVATE instance via prototype — so we must patch the PROTOTYPE.
		if (!window.BX || !BX.Main || !BX.Main.interfaceButtons) return false;
		var proto = BX.Main.interfaceButtons.prototype;
		if (!proto || !proto.saveSettings) return false;
		if (proto.__chatCatSortHooked) return true;
		proto.__chatCatSortHooked = true;

		var origSaveSettings = proto.saveSettings;
		proto.saveSettings = function () {
			origSaveSettings.call(this);
			// Only intercept chat-menu instance
			if (this.listContainer && this.listContainer.id === 'chat-menu') {
				try {
					syncCategorySortToDb(this);
				} catch (e) {
					log('syncCategorySortToDb error: ' + e.message);
				}
			}
		};
		log('saveSettings hooked on prototype');
		return true;
	}

	function syncCategorySortToDb(chatMenu) {
		var settings = chatMenu.getCurrentSettings();
		if (!settings) return;

		// Collect items sorted by their current position in the menu
		var items = [];
		Object.keys(settings).forEach(function (key) {
			var suffix = key.replace(/^chat-menu_/, '');
			items.push({ suffix: suffix, posIndex: settings[key].sort || 0 });
		});
		items.sort(function (a, b) { return a.posIndex - b.posIndex; });

		log('Menu order: ' + items.map(function (it) { return it.suffix + '(' + it.posIndex + ')'; }).join(', '));

		// Assign sequential SORT = (position + 1) * 100 to every tab.
		// Server maps web keys to mobile tab IDs and saves per-user.
		var allSorts = {};
		items.forEach(function (item, idx) {
			allSorts[item.suffix] = (idx + 1) * 100;
		});

		BX.ajax.runAction(ACTION_PREFIX + 'saveAllTabSorts', {
			data: { sorts: allSorts }
		}).then(function () {
			log('All tab sorts saved: ' + JSON.stringify(allSorts));
		}).catch(function (error) {
			log('saveAllTabSorts error: ' + JSON.stringify(error));
		});
	}

	// =========================================================
	// Helpers
	// =========================================================

	function ensureNamespace(path) {
		var parts = path.split('.');
		var obj = window;
		for (var i = 0; i < parts.length; i++) {
			obj[parts[i]] = obj[parts[i]] || {};
			obj = obj[parts[i]];
		}
		return obj;
	}

	function getLib() {
		try { return BX.Messenger.v2.Lib; } catch (e) { return null; }
	}

	function getStore() {
		try {
			var core = BX.Messenger.v2.Application.Core;
			return core && typeof core.getStore === 'function' ? core.getStore() : null;
		} catch (e) { return null; }
	}

	function getLayoutManager() {
		try {
			var lm = BX.Messenger.v2.Lib.LayoutManager.getInstance();
			return lm && typeof lm.setLayout === 'function' ? lm : null;
		} catch (e) { return null; }
	}

	function getCurrentLayoutName() {
		var store = getStore();
		if (!store) return '';
		var layout = store.state.application && store.state.application.layout;
		return layout ? layout.name : '';
	}

	function getChatMenu() {
		try {
			var manager = BX.Main.interfaceButtonsManager;
			return manager ? manager.getById('chat-menu') : null;
		} catch (e) { return null; }
	}

	function reloadNavigation() {
		// Force messenger to rebuild navigation menu
		try {
			var lib = getLib();
			if (lib && lib.NavigationManager && lib.NavigationManager.rebuild) {
				lib.NavigationManager.rebuild();
				return;
			}
		} catch (e) {}

		// Fallback: reload page
		window.location.reload();
	}

	// =========================================================
	// Badge counters for customCat_* navigation menu items
	// =========================================================

	/**
	 * Returns all available navigation menu instances (chat-menu + collaboration sidebar).
	 */
	function getChatMenus() {
		var menus = [];
		try {
			var manager = window.BX && BX.Main && BX.Main.interfaceButtonsManager;
			if (manager) {
				var m1 = manager.getById('chat-menu');
				var m2 = manager.getById('top_menu_id_collaboration');
				if (m1) { menus.push(m1); }
				if (m2) { menus.push(m2); }
			}
		} catch (e) {}
		return menus;
	}

	/**
	 * Recomputes unread count for a single category and updates its badge.
	 *
	 * Primary source: chats.collection[dialogId].counter
	 *   Updated by MessagePullHandler.#updateDialog on every PULL message event.
	 *   Works even before the user visits the category tab.
	 * Fallback: recent.collection[dialogId].unread (boolean → +1)
	 */
	function updateCategoryBadge(categoryId) {
		var store = getStore();
		if (!store) { return; }
		var menus = getChatMenus();
		if (menus.length === 0) { return; }

		var dialogIds = categoriesState.categoryChats[categoryId] || [];
		var totalCount = 0;
		var chatsColl = store.state.chats && store.state.chats.collection;
		var recentColl = store.state.recent && store.state.recent.collection;

		dialogIds.forEach(function (dialogId) {
			var chat = chatsColl && chatsColl[dialogId];
			if (chat && chat.counter > 0) {
				totalCount += chat.counter;
			} else if (recentColl && recentColl[dialogId] && recentColl[dialogId].unread) {
				totalCount += 1;
			}
		});

		menus.forEach(function (menu) {
			menu.updateCounter(MENU_PREFIX + categoryId, totalCount);
		});
		log('Badge cat ' + categoryId + ': ' + totalCount);
	}

	function updateAllCategoryBadges() {
		categoriesState.categories.forEach(function (cat) {
			updateCategoryBadge(cat.id);
		});
	}

	/**
	 * Sets up Vuex watchers that keep category badges in sync.
	 *
	 * Trigger 1 (primary): chats.collection counter — fires on every PULL message via
	 *   MessagePullHandler.#setMessageChat + #updateDialog. Works for ALL chat types
	 *   including regular, sonetGroup, calendar, crm, etc.
	 * Trigger 2 (backup): recent.collection.unread — for manually-marked-as-unread items.
	 * Trigger 3 (backup): IM.Counters:onUpdate event.
	 *
	 * Note: categoriesState.categoryChats is non-reactive plain JS, so the watch getter
	 * re-reads it on every run. New chats added to a category become visible to the
	 * watcher after the next chats.collection change triggers a re-run.
	 */
	function watchForBadgeUpdates(store) {
		// Trigger 1: chats.collection counter changes (primary)
		try {
			store.watch(
				function (storeState) {
					var chatsColl = storeState.chats && storeState.chats.collection;
					if (!chatsColl) { return 0; }
					var total = 0;
					Object.keys(categoriesState.categoryChats).forEach(function (catId) {
						var dialogIds = categoriesState.categoryChats[catId] || [];
						dialogIds.forEach(function (dialogId) {
							var chat = chatsColl[dialogId];
							if (chat && chat.counter > 0) {
								total += chat.counter;
							}
						});
					});
					return total;
				},
				function () { updateAllCategoryBadges(); }
			);
		} catch (e) {}

		// Trigger 2: recent.collection.unread backup
		try {
			store.watch(
				function (storeState) {
					var recentColl = storeState.recent && storeState.recent.collection;
					if (!recentColl) { return 0; }
					var count = 0;
					Object.keys(categoriesState.categoryChats).forEach(function (catId) {
						var dialogIds = categoriesState.categoryChats[catId] || [];
						dialogIds.forEach(function (dialogId) {
							var item = recentColl[dialogId];
							if (item && item.unread) { count++; }
						});
					});
					return count;
				},
				function () { updateAllCategoryBadges(); }
			);
		} catch (e) {}

		// Trigger 3: IM.Counters:onUpdate backup
		try {
			var EventEmitter = window.BX && BX.Event && BX.Event.EventEmitter;
			if (EventEmitter) {
				EventEmitter.subscribe('IM.Counters:onUpdate', function () {
					setTimeout(updateAllCategoryBadges, 0);
				});
			}
		} catch (e) {}
	}

	// =========================================================
	// Init
	// =========================================================

	// Phase 1: Set up property traps IMMEDIATELY (before bundles load)
	patchMessengerComponent();
	patchRecentListContainer();
	patchRecentItem();

	// Phase 2: Wait for runtime objects, then patch
	function initRuntimePatches() {
		var done = {
			lm: false, nm: false, menu: false,
			service: false, watcher: false,
			categories: false, uiBtn: false, vuex: false,
			sortHook: false, plusMenu: false, badge: false
		};

		var attempts = 0;
		var maxAttempts = 200; // 60 seconds at 300ms interval

		var intervalId = setInterval(function () {
			attempts++;
			if (attempts > maxAttempts) {
				clearInterval(intervalId);
				log('Gave up waiting for runtime objects after ' + maxAttempts + ' attempts');
				return;
			}
			if (!done.lm) done.lm = patchLayoutManager();
			if (!done.nm) done.nm = patchNavigationManager();
			if (!done.menu) done.menu = initMenuFix();
			if (!done.service) done.service = patchLegacyRecentService();

			if (!done.vuex) {
				var store = getStore();
				if (store) {
					registerVuexModule();
					done.vuex = true;
				}
			}

			if (!done.watcher) {
				var store = getStore();
				if (store) done.watcher = watchLayout();
			}

			if (!done.categories && typeof BX !== 'undefined' && BX.ajax) {
				done.categories = true;
				loadCategories();
			}

			if (!done.uiBtn) done.uiBtn = initCreateCategoryButton();
			if (!done.sortHook) done.sortHook = hookSaveSettings();
			if (!done.plusMenu) done.plusMenu = hookMoreMenuItems();

			if (!done.badge && done.vuex) {
				var store = getStore();
				if (store) {
					watchForBadgeUpdates(store);
					updateAllCategoryBadges();
					done.badge = true;
				}
			}

			if (done.lm && done.nm && done.menu && done.service && done.watcher && done.categories && done.uiBtn && done.vuex && done.sortHook && done.plusMenu && done.badge) {
				clearInterval(intervalId);
				log('All runtime patches applied');
			}
		}, 300);

		// Also watch for layout changes to inject "Add chat" button
		var addChatInterval = setInterval(function () {
			var store = getStore();
			if (!store) return;

			clearInterval(addChatInterval);
			store.watch(
				function () { return store.state.application && store.state.application.layout; },
				function () { setTimeout(injectAddChatButton, 200); },
				{ deep: true }
			);
		}, 500);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', function () {
			initRuntimePatches();
		});
	} else {
		initRuntimePatches();
	}
})();
