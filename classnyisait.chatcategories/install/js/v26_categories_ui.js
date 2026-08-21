/**
 * classnyisait.chatcategories — UI для управления кастомными категориями
 * (Bitrix24 v26).
 *
 * Не содержит патчей маршрутизации/фильтрации — это в classnyisait.crmchat/install/js/v26_compat.js.
 * Этот файл отвечает только за:
 *   1. Пункт "+ Категория" в выпадающем меню "Ещё" навигационной панели.
 *   2. Popup создания категории.
 *   3. Пункт "Категории" в контекстном меню чата (RecentMenu в v26).
 *   4. Popup-чекбоксы для добавления/удаления чата из категорий.
 *   5. Right-click на вкладке-категории → меню {Переименовать, Удалить}.
 *   6. Popup переименования.
 *   7. Кнопка "+ Добавить чат" в режиме просмотра категории + popup со списком.
 *
 * Источник данных: window.classnyisaitCategoriesList и window.classnyisaitCategoriesMap
 * (инжектятся серверным Classnyisait\ChatCategories\EventHandler::onProlog).
 *
 * После CRUD-операций делаем location.reload() — это пересобирает navigation menu
 * через PHP-event OnAfterNavigationMenuBuild. Без reload пришлось бы вручную
 * перерисовывать Vue-навигацию и обновлять Vuex.
 */
(function () {
	'use strict';

	var ACTION_PREFIX = 'classnyisait:chatcategories.Controller.Category.';
	var MENU_PREFIX = 'customCat_';

	function log(msg) {
		if (window.LB_DEBUG) { try { console.log('[ChatCat UI] ' + msg); } catch (e) {} }
	}

	function getCategories() {
		return Array.isArray(window.classnyisaitCategoriesList) ? window.classnyisaitCategoriesList : [];
	}

	function getCategoryChats(categoryId) {
		var map = window.classnyisaitCategoriesMap || {};
		return map[String(categoryId)] || [];
	}

	function isDialogInCategory(categoryId, dialogId) {
		var list = getCategoryChats(categoryId);
		var did = String(dialogId);
		for (var i = 0; i < list.length; i++) {
			if (String(list[i]) === did) return true;
		}
		return false;
	}

	function getStore() {
		try { return window.BX.Messenger.v2.Application.Core.getStore(); } catch (e) { return null; }
	}

	function getLayoutManager() {
		try { return window.BX.Messenger.v2.Lib.LayoutManager.getInstance(); } catch (e) { return null; }
	}

	function normalizeCategoryLayoutName(name) {
		if (!name || typeof name !== 'string') return '';
		if (name.toLowerCase().indexOf('customcat_') === 0) {
			return MENU_PREFIX + name.substring(name.indexOf('_') + 1);
		}
		return name;
	}

	function getActiveNavigationLayoutName() {
		var selectors = [
			'#chat-menu .main-buttons-item',
			'#top_menu_id_collaboration .main-buttons-item'
		];
		for (var i = 0; i < selectors.length; i++) {
			var items = document.querySelectorAll(selectors[i]);
			for (var j = 0; j < items.length; j++) {
				var item = items[j];
				var cls = item.className || '';
				if (cls.indexOf('active') !== -1 || cls.indexOf('--active') !== -1) {
					return normalizeCategoryLayoutName(item.dataset && item.dataset.id || '');
				}
			}
		}
		return '';
	}

	function getCurrentLayoutName() {
		var activeName = getActiveNavigationLayoutName();
		if (activeName && activeName.indexOf(MENU_PREFIX) === 0) return activeName;
		try {
			var lm = getLayoutManager();
			var layout = lm && lm.getLayout && lm.getLayout();
			var layoutName = normalizeCategoryLayoutName(layout && layout.name || '');
			if (layoutName) return layoutName;
		} catch (e) {}
		return activeName;
	}
	// =========================================================
	// Базовые popup-helpers (используем BX.PopupWindow если есть, иначе свой overlay)
	// =========================================================

	function buildModalOverlay() {
		var overlay = document.createElement('div');
		overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.3);z-index:10000;display:flex;align-items:center;justify-content:center;';
		var closeOnEsc = function (e) {
			if (e.key === 'Escape' || e.keyCode === 27) {
				overlay.remove();
				document.removeEventListener('keydown', closeOnEsc);
			}
		};
		document.addEventListener('keydown', closeOnEsc);
		overlay.addEventListener('click', function (e) {
			if (e.target === overlay) {
				overlay.remove();
				document.removeEventListener('keydown', closeOnEsc);
			}
		});
		return overlay;
	}

	function buildModalBox(titleText, minWidth) {
		var box = document.createElement('div');
		box.style.cssText = 'background:#fff;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.15);padding:12px 0;min-width:' + (minWidth || 220) + 'px;max-width:360px;';
		if (titleText) {
			var title = document.createElement('div');
			title.style.cssText = 'padding:8px 16px 10px;font-size:14px;font-weight:600;border-bottom:1px solid #eee;margin-bottom:4px;';
			title.textContent = titleText;
			box.appendChild(title);
		}
		return box;
	}

	function makeButton(text, isPrimary) {
		var btn = document.createElement('button');
		btn.textContent = text;
		btn.style.cssText = 'padding:6px 14px;border:none;border-radius:4px;cursor:pointer;font-size:13px;flex:1;'
			+ (isPrimary ? 'background:#3bc8f5;color:#fff;' : 'background:#eee;color:#333;');
		return btn;
	}

	// =========================================================
	// 1. "+ Категория" в выпадающем меню "Ещё" (legacy BX.Main.interfaceButtons)
	// =========================================================

	function hookMoreMenuItems() {
		if (!window.BX || !BX.Main || !BX.Main.interfaceButtons) return false;
		var proto = BX.Main.interfaceButtons.prototype;
		if (!proto || !proto.getMoreMenuItems) return false;
		if (proto.__chatCatCreateHooked) return true;
		proto.__chatCatCreateHooked = true;

		var orig = proto.getMoreMenuItems;
		proto.getMoreMenuItems = function () {
			var result = orig.call(this);
			// Только меню чата (id='chat-menu'); не трогаем глобальный sidebar.
			if (!this.listContainer || this.listContainer.id !== 'chat-menu') return result;

			result.push({
				html: '<span class="main-submenu-item-text">+ Категория</span>',
				className: 'custom-cat-create-menu-item',
				onclick: function () {
					try {
						var manager = BX.Main && BX.Main.interfaceButtonsManager;
						var chatMenu = manager && manager.getById && manager.getById('chat-menu');
						if (chatMenu && chatMenu.closeMoreMenu) chatMenu.closeMoreMenu();
					} catch (e) {}
					showCreateCategoryPopup();
					return false;
				}
			});
			return result;
		};
		log('hookMoreMenuItems applied');
		return true;
	}

	// =========================================================
	// 2. Popup создания категории
	// =========================================================

	function showCreateCategoryPopup() {
		var overlay = buildModalOverlay();
		var box = buildModalBox('Новая категория', 240);

		var input = document.createElement('input');
		input.type = 'text';
		input.placeholder = 'Название категории';
		input.style.cssText = 'width:calc(100% - 32px);margin:0 16px;padding:6px 10px;border:1px solid #c4c7cc;border-radius:4px;font-size:14px;outline:none;box-sizing:border-box;';
		box.appendChild(input);

		var btnRow = document.createElement('div');
		btnRow.style.cssText = 'display:flex;gap:8px;padding:12px 16px 4px;';
		var cancelBtn = makeButton('Отмена', false);
		var saveBtn = makeButton('Создать', true);
		btnRow.appendChild(cancelBtn);
		btnRow.appendChild(saveBtn);
		box.appendChild(btnRow);

		overlay.appendChild(box);
		document.body.appendChild(overlay);
		setTimeout(function () { input.focus(); }, 50);

		var submit = function () {
			var name = (input.value || '').trim();
			if (!name) return;
			BX.ajax.runAction(ACTION_PREFIX + 'add', { data: { name: name } })
				.then(function () { window.location.reload(); })
				.catch(function (err) { log('add error: ' + JSON.stringify(err)); });
		};
		cancelBtn.addEventListener('click', function () { overlay.remove(); });
		saveBtn.addEventListener('click', submit);
		input.addEventListener('keydown', function (e) {
			if (e.key === 'Enter') submit();
			if (e.key === 'Escape') overlay.remove();
		});
	}

	// =========================================================
	// 3. Пункт "Категории" в контекстном меню чата (RecentMenu v26)
	// =========================================================

	function patchRecentMenu() {
		var Lib = window.BX && window.BX.Messenger && window.BX.Messenger.v2 && window.BX.Messenger.v2.Lib;
		var RM = Lib && Lib.RecentMenu;
		if (!RM || !RM.prototype || typeof RM.prototype.getMenuItems !== 'function') return false;
		if (RM.prototype.__chatCatPatched) return true;
		RM.prototype.__chatCatPatched = true;

		var orig = RM.prototype.getMenuItems;
		RM.prototype.getMenuItems = function () {
			var items = orig.call(this) || [];
			var dialogId = this.context && this.context.dialogId;
			if (!dialogId) return items;

			items.push({
				title: 'Категории',
				onClick: function () {
					try { if (this.menuInstance && this.menuInstance.close) this.menuInstance.close(); } catch (e) {}
					setTimeout(function () { showCategoryAssignPopup(dialogId); }, 0);
				}.bind(this)
			});
			return items;
		};
		log('RecentMenu.getMenuItems patched');
		return true;
	}

	// =========================================================
	// 4. Popup присвоения чата категориям (чекбоксы)
	// =========================================================

	function showCategoryAssignPopup(dialogId) {
		var overlay = buildModalOverlay();
		var box = buildModalBox('Категории', 260);
		var itemsContainer = document.createElement('div');
		box.appendChild(itemsContainer);

		function render() {
			itemsContainer.innerHTML = '';
			var cats = getCategories();
			if (cats.length === 0) {
				var empty = document.createElement('div');
				empty.style.cssText = 'padding:12px 16px;color:#999;font-size:13px;';
				empty.textContent = 'Нет категорий';
				itemsContainer.appendChild(empty);
				return;
			}
			cats.forEach(function (cat) {
				var isIn = isDialogInCategory(cat.id, dialogId);
				var row = document.createElement('div');
				row.style.cssText = 'padding:8px 16px;cursor:pointer;font-size:13px;display:flex;align-items:center;gap:8px;';
				row.addEventListener('mouseenter', function () { row.style.background = '#f5f5f5'; });
				row.addEventListener('mouseleave', function () { row.style.background = ''; });

				var check = document.createElement('span');
				check.style.cssText = 'width:18px;height:18px;text-align:center;line-height:18px;color:#3bc8f5;font-weight:bold;border:1px solid #ccc;border-radius:3px;font-size:12px;';
				check.textContent = isIn ? '✓' : '';

				var name = document.createElement('span');
				name.textContent = cat.name;

				row.appendChild(check);
				row.appendChild(name);

				row.addEventListener('click', function (e) {
					e.stopPropagation();
					toggleChatInCategory(cat.id, dialogId, render);
				});
				itemsContainer.appendChild(row);
			});
		}
		render();
		overlay.appendChild(box);
		document.body.appendChild(overlay);
	}

	function toggleChatInCategory(categoryId, dialogId, callback) {
		var isIn = isDialogInCategory(categoryId, dialogId);
		var action = isIn ? 'removeChat' : 'addChat';
		BX.ajax.runAction(ACTION_PREFIX + action, {
			data: { categoryId: categoryId, dialogId: String(dialogId) }
		}).then(function () {
			// Обновляем локальный mapping без reload, чтобы фильтр в текущем
			// просмотре сработал сразу.
			var map = window.classnyisaitCategoriesMap = window.classnyisaitCategoriesMap || {};
			var cid = String(categoryId);
			var did = String(dialogId);
			var list = map[cid] || [];
			if (isIn) {
				map[cid] = list.filter(function (d) { return String(d) !== did; });
			} else {
				if (list.indexOf(did) === -1) list.push(did);
				map[cid] = list;
			}
			// Force re-render списка чатов (если сейчас активна вкладка-категория).
			forceRecentRerender();
			if (callback) callback();
		}).catch(function (err) { log('toggleChat error: ' + JSON.stringify(err)); });
	}

	function forceRecentRerender() {
		// Триггерим Vuex commit чтобы computed preparedItems пересчитался.
		// Если кастомного модуля нет — регистрируем минимальный с version-счётчиком.
		var store = getStore();
		if (!store) return;
		if (!store.state.classnyisaitCategories) {
			try {
				store.registerModule('classnyisaitCategories', {
					namespaced: true,
					state: function () { return { tick: 0 }; },
					mutations: { bump: function (s) { s.tick++; } }
				});
			} catch (e) {}
		}
		try { store.commit('classnyisaitCategories/bump'); } catch (e) {}
	}

	// =========================================================
	// 5. Right-click на вкладке-категории → меню {Переименовать, Удалить}
	// =========================================================

	function injectCategoryContextMenus() {
		var navItems = document.querySelectorAll('#chat-menu .main-buttons-item');
		if (!navItems.length) return;
		navItems.forEach(function (item) {
			var dataId = item.dataset && item.dataset.id;
			if (!dataId) return;
			if (dataId.toLowerCase().indexOf('customcat_') !== 0) return;
			if (item.__chatCatCtxBound) return;
			item.__chatCatCtxBound = true;
			var catIdStr = dataId.replace(/^customcat_/i, '');
			var catId = parseInt(catIdStr, 10);
			if (!catId) return;

			item.addEventListener('contextmenu', function (e) {
				e.preventDefault();
				e.stopPropagation();
				showCategoryItemMenu(item, catId);
			});
		});
	}

	function showCategoryItemMenu(anchor, catId) {
		var popupId = 'custom-cat-ctx-' + catId;
		try {
			var existing = BX.PopupWindowManager && BX.PopupWindowManager.getPopupById(popupId);
			if (existing) existing.close();
		} catch (e) {}

		var menuItems = [
			{
				text: 'Переименовать',
				onclick: function () {
					try { popup.close(); } catch (e) {}
					showRenamePopup(anchor, catId);
				}
			},
			{
				text: 'Удалить',
				onclick: function () {
					try { popup.close(); } catch (e) {}
					if (confirm('Удалить категорию?')) deleteCategory(catId);
				}
			}
		];
		var popup;
		if (BX.PopupMenuWindow) {
			popup = new BX.PopupMenuWindow(popupId, anchor, menuItems, { autoHide: true, closeByEsc: true });
			popup.show();
		} else if (BX.Main && BX.Main.Menu) {
			popup = new BX.Main.Menu({ id: popupId, bindElement: anchor, items: menuItems, autoHide: true, closeByEsc: true });
			popup.show();
		}
	}

	function showRenamePopup(anchor, catId) {
		var current = '';
		var cats = getCategories();
		for (var i = 0; i < cats.length; i++) { if (cats[i].id === catId) { current = cats[i].name; break; } }

		var overlay = buildModalOverlay();
		var box = buildModalBox('Переименовать категорию', 240);
		var input = document.createElement('input');
		input.type = 'text';
		input.value = current;
		input.style.cssText = 'width:calc(100% - 32px);margin:0 16px;padding:6px 10px;border:1px solid #c4c7cc;border-radius:4px;font-size:14px;outline:none;box-sizing:border-box;';
		box.appendChild(input);

		var btnRow = document.createElement('div');
		btnRow.style.cssText = 'display:flex;gap:8px;padding:12px 16px 4px;';
		var cancelBtn = makeButton('Отмена', false);
		var saveBtn = makeButton('Сохранить', true);
		btnRow.appendChild(cancelBtn);
		btnRow.appendChild(saveBtn);
		box.appendChild(btnRow);

		overlay.appendChild(box);
		document.body.appendChild(overlay);
		setTimeout(function () { input.focus(); input.select(); }, 50);

		var submit = function () {
			var name = (input.value || '').trim();
			if (!name) return;
			BX.ajax.runAction(ACTION_PREFIX + 'update', { data: { id: catId, name: name } })
				.then(function () { window.location.reload(); })
				.catch(function (err) { log('rename error: ' + JSON.stringify(err)); });
		};
		cancelBtn.addEventListener('click', function () { overlay.remove(); });
		saveBtn.addEventListener('click', submit);
		input.addEventListener('keydown', function (e) {
			if (e.key === 'Enter') submit();
			if (e.key === 'Escape') overlay.remove();
		});
	}

	function deleteCategory(catId) {
		BX.ajax.runAction(ACTION_PREFIX + 'delete', { data: { id: catId } })
			.then(function () { window.location.reload(); })
			.catch(function (err) { log('delete error: ' + JSON.stringify(err)); });
	}

	// =========================================================
	// 6. Кнопка "+ Добавить чат" в режиме просмотра категории
	// =========================================================

	function isHiddenByOtherCategoryFilter(item) {
		return item.dataset.crmChatHidden === '1' || item.dataset.notifyChatHidden === '1';
	}

	function maintainCategoryFilter() {
		var current = getCurrentLayoutName();
		var isCustomCat = typeof current === 'string' && current.indexOf(MENU_PREFIX) === 0;
		var items = document.querySelectorAll('.bx-im-list-recent-item__wrap[data-id]');

		if (!isCustomCat) {
			items.forEach(function (item) {
				if (item.dataset.chatCatHidden === '1') {
					delete item.dataset.chatCatHidden;
					item.style.display = isHiddenByOtherCategoryFilter(item) ? 'none' : '';
				}
			});
			return;
		}

		var catId = current.substring(MENU_PREFIX.length);
		var allowed = getCategoryChats(catId).map(String);
		items.forEach(function (item) {
			var visible = allowed.indexOf(String(item.dataset.id)) !== -1;
			item.style.display = visible ? '' : 'none';
			if (visible) {
				delete item.dataset.chatCatHidden;
			} else {
				item.dataset.chatCatHidden = '1';
			}
		});
	}
	function maintainAddChatButton() {
		var current = getCurrentLayoutName();
		var isCustomCat = typeof current === 'string' && current.indexOf(MENU_PREFIX) === 0;
		var existing = document.querySelector('.custom-cat-add-chat-btn');

		if (!isCustomCat) {
			if (existing) existing.remove();
			return;
		}
		if (existing) return;

		var recentList = document.querySelector('.bx-im-recent-list__scope, .bx-im-list-container-recent__scope');
		if (!recentList) return;

		var catId = parseInt(current.substring(MENU_PREFIX.length), 10);
		if (!catId) return;

		var btn = document.createElement('div');
		btn.className = 'custom-cat-add-chat-btn';
		btn.style.cssText = 'padding:8px 16px;cursor:pointer;color:#3bc8f5;font-size:13px;display:flex;align-items:center;gap:6px;border-bottom:1px solid #e6e7e8;';
		btn.innerHTML = '<span style="font-size:16px;line-height:1;">+</span><span>Добавить чат</span>';
		btn.addEventListener('click', function (e) {
			e.stopPropagation();
			showAddChatToCategoryPopup(catId);
		});
		recentList.parentNode.insertBefore(btn, recentList);
	}

	function showAddChatToCategoryPopup(catId) {
		var store = getStore();
		if (!store) return;

		var overlay = buildModalOverlay();
		var box = buildModalBox('Добавить чат в категорию', 320);
		box.style.maxWidth = '420px';

		var search = document.createElement('input');
		search.type = 'text';
		search.placeholder = 'Поиск...';
		search.style.cssText = 'width:calc(100% - 32px);margin:0 16px 8px;padding:6px 10px;border:1px solid #c4c7cc;border-radius:4px;font-size:13px;outline:none;box-sizing:border-box;';
		box.appendChild(search);

		var listEl = document.createElement('div');
		listEl.style.cssText = 'max-height:360px;overflow:auto;';
		box.appendChild(listEl);

		var pending = {}; // dialogId → desiredState (true=add, false=remove)

		function getDialogTitle(dialogId) {
			var chat = store.getters['chats/get'](dialogId);
			return chat && (chat.name || chat.title) || dialogId;
		}

		function buildItems() {
			var collection = store.state.recent && store.state.recent.collection ? store.state.recent.collection : {};
			var items = [];
			Object.keys(collection).forEach(function (dialogId) {
				items.push({
					dialogId: dialogId,
					title: getDialogTitle(dialogId),
					inCategory: isDialogInCategory(catId, dialogId),
				});
			});
			items.sort(function (a, b) { return a.title.localeCompare(b.title); });
			return items;
		}

		function render() {
			var query = (search.value || '').trim().toLowerCase();
			listEl.innerHTML = '';
			var items = buildItems();
			items.forEach(function (item) {
				if (query && item.title.toLowerCase().indexOf(query) === -1) return;
				var row = document.createElement('div');
				row.style.cssText = 'padding:6px 16px;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:13px;';
				row.addEventListener('mouseenter', function () { row.style.background = '#f5f5f5'; });
				row.addEventListener('mouseleave', function () { row.style.background = ''; });

				var desired = pending.hasOwnProperty(item.dialogId) ? pending[item.dialogId] : item.inCategory;
				var check = document.createElement('span');
				check.style.cssText = 'width:18px;height:18px;text-align:center;line-height:18px;color:#3bc8f5;font-weight:bold;border:1px solid #ccc;border-radius:3px;font-size:12px;';
				check.textContent = desired ? '✓' : '';

				var name = document.createElement('span');
				name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
				name.textContent = item.title;

				row.appendChild(check);
				row.appendChild(name);
				row.addEventListener('click', function () {
					var newDesired = !desired;
					if (newDesired === item.inCategory) {
						delete pending[item.dialogId];
					} else {
						pending[item.dialogId] = newDesired;
					}
					render();
				});
				listEl.appendChild(row);
			});
		}

		var btnRow = document.createElement('div');
		btnRow.style.cssText = 'display:flex;gap:8px;padding:8px 16px 4px;border-top:1px solid #eee;margin-top:6px;';
		var cancelBtn = makeButton('Отмена', false);
		var applyBtn = makeButton('Применить', true);
		btnRow.appendChild(cancelBtn);
		btnRow.appendChild(applyBtn);
		box.appendChild(btnRow);

		overlay.appendChild(box);
		document.body.appendChild(overlay);
		render();
		search.addEventListener('input', render);

		cancelBtn.addEventListener('click', function () { overlay.remove(); });
		applyBtn.addEventListener('click', function () {
			var ops = Object.keys(pending).map(function (dialogId) {
				return BX.ajax.runAction(ACTION_PREFIX + (pending[dialogId] ? 'addChat' : 'removeChat'),
					{ data: { categoryId: catId, dialogId: dialogId } });
			});
			Promise.all(ops).then(function () {
				// Обновим локальный mapping
				var map = window.classnyisaitCategoriesMap = window.classnyisaitCategoriesMap || {};
				var cid = String(catId);
				var list = map[cid] || [];
				Object.keys(pending).forEach(function (dialogId) {
					var did = String(dialogId);
					if (pending[dialogId]) {
						if (list.indexOf(did) === -1) list.push(did);
					} else {
						list = list.filter(function (d) { return String(d) !== did; });
					}
				});
				map[cid] = list;
				forceRecentRerender();
				overlay.remove();
			}).catch(function (err) { log('apply error: ' + JSON.stringify(err)); });
		});
	}

	// =========================================================
	// Init: poll готовности и DOM-наблюдатели
	// =========================================================

	var done = { more: false, recentMenu: false };

	function tryPatch() {
		if (!done.more)       done.more       = hookMoreMenuItems();
		if (!done.recentMenu) done.recentMenu = patchRecentMenu();
	}

	function start() {
		tryPatch();
		injectCategoryContextMenus();
		maintainAddChatButton();
		maintainCategoryFilter();

		// Poll до 30 сек для всех патчей
		var attempts = 0;
		var pollId = setInterval(function () {
			attempts++;
			tryPatch();
			injectCategoryContextMenus();
			maintainAddChatButton();
			maintainCategoryFilter();
			if (attempts > 600 || (done.more && done.recentMenu)) {
				clearInterval(pollId);
			}
		}, 50);

		// MutationObserver на body — для отслеживания появления/перерисовки навигации
		var obs = new MutationObserver(function () {
			injectCategoryContextMenus();
			maintainAddChatButton();
			maintainCategoryFilter();
		});
		obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-id'] });
		try {
			document.addEventListener('click', function () {
				setTimeout(maintainCategoryFilter, 0);
				setTimeout(maintainCategoryFilter, 150);
			}, true);
		} catch (e) {}

	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', start);
	} else {
		start();
	}
})();
