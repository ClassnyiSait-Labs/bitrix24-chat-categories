/**
 * Jest unit tests for classnyisait.chatcategories JS helpers.
 *
 * Covers:
 *   - Layout name parsing (isCustomCatLayout, getCategoryIdFromLayout)
 *   - Batch chat grouping (listAction logic)
 *   - Limit guards (MAX_ORDER_SIZE)
 *   - Tab sort key mapping (saveAllTabSorts logic)
 *   - Custom category key parsing
 *   - Menu item ID generation
 *
 * Run: npx jest test/categories.test.js
 */

// ─── Helpers extracted for testing ───────────────────────────────────────────

const MENU_PREFIX = 'customCat_';

function isCustomCatLayout(name) {
    return typeof name === 'string' && name.indexOf(MENU_PREFIX) === 0;
}

function getCategoryIdFromLayout(name) {
    if (!isCustomCatLayout(name)) return null;
    const num = parseInt(name.substring(MENU_PREFIX.length), 10);
    return isNaN(num) ? null : num;
}

// ─── Tests: isCustomCatLayout ──────────────────────────────────────────────

describe('isCustomCatLayout', () => {
    test('returns true for customCat_1', () => {
        expect(isCustomCatLayout('customCat_1')).toBe(true);
    });

    test('returns true for customCat_999', () => {
        expect(isCustomCatLayout('customCat_999')).toBe(true);
    });

    test('returns true for customCat_0 (CRM)', () => {
        expect(isCustomCatLayout('customCat_0')).toBe(true);
    });

    test('returns true for customCat_-1 (Events)', () => {
        expect(isCustomCatLayout('customCat_-1')).toBe(true);
    });

    test('returns false for standard "chat" layout', () => {
        expect(isCustomCatLayout('chat')).toBe(false);
    });

    test('returns false for empty string', () => {
        expect(isCustomCatLayout('')).toBe(false);
    });

    test('returns false for non-string input', () => {
        expect(isCustomCatLayout(null)).toBe(false);
        expect(isCustomCatLayout(undefined)).toBe(false);
        expect(isCustomCatLayout(123)).toBe(false);
    });

    test('returns false for partial prefix without underscore', () => {
        expect(isCustomCatLayout('customCat')).toBe(false);
    });

    test('returns false for similar but wrong prefix', () => {
        expect(isCustomCatLayout('customCategory_1')).toBe(false);
    });
});

// ─── Tests: getCategoryIdFromLayout ────────────────────────────────────────

describe('getCategoryIdFromLayout', () => {
    test('extracts id 1 from customCat_1', () => {
        expect(getCategoryIdFromLayout('customCat_1')).toBe(1);
    });

    test('extracts id 42 from customCat_42', () => {
        expect(getCategoryIdFromLayout('customCat_42')).toBe(42);
    });

    test('extracts id 0 from customCat_0', () => {
        expect(getCategoryIdFromLayout('customCat_0')).toBe(0);
    });

    test('extracts id -1 from customCat_-1', () => {
        expect(getCategoryIdFromLayout('customCat_-1')).toBe(-1);
    });

    test('returns null for non-category layout', () => {
        expect(getCategoryIdFromLayout('chat')).toBeNull();
    });

    test('returns null for customCat_ with no id', () => {
        expect(getCategoryIdFromLayout('customCat_')).toBeNull();
    });

    test('returns null for customCat_ with non-numeric suffix', () => {
        expect(getCategoryIdFromLayout('customCat_abc')).toBeNull();
    });

    test('returns null for null input', () => {
        expect(getCategoryIdFromLayout(null)).toBeNull();
    });

    test('returns null for undefined', () => {
        expect(getCategoryIdFromLayout(undefined)).toBeNull();
    });
});

// ─── Tests: Batch chat grouping ────────────────────────────────────────────

describe('Batch chat grouping (listAction logic)', () => {
    function groupChatsByCategory(chatRows) {
        const chatsByCategory = {};
        chatRows.forEach(row => {
            const catId = parseInt(row.CATEGORY_ID, 10);
            if (!chatsByCategory[catId]) chatsByCategory[catId] = [];
            chatsByCategory[catId].push(row.DIALOG_ID);
        });
        return chatsByCategory;
    }

    test('groups dialog IDs by category ID', () => {
        const chatRows = [
            { CATEGORY_ID: '1', DIALOG_ID: 'chat1' },
            { CATEGORY_ID: '1', DIALOG_ID: 'chat2' },
            { CATEGORY_ID: '2', DIALOG_ID: 'chat3' },
        ];

        const result = groupChatsByCategory(chatRows);

        expect(result[1]).toHaveLength(2);
        expect(result[2]).toHaveLength(1);
        expect(result[1]).toContain('chat1');
        expect(result[2]).toContain('chat3');
    });

    test('returns empty object for empty input', () => {
        expect(groupChatsByCategory([])).toEqual({});
    });

    test('handles single category with many chats', () => {
        const chatRows = Array.from({ length: 10 }, (_, i) => ({
            CATEGORY_ID: '5',
            DIALOG_ID: `chat${i}`,
        }));

        const result = groupChatsByCategory(chatRows);
        expect(result[5]).toHaveLength(10);
    });

    test('returns empty array for category with no chats', () => {
        const chatsByCategory = {};
        const dialogIds = chatsByCategory[99] ?? [];
        expect(dialogIds).toEqual([]);
    });

    test('preserves order within category', () => {
        const chatRows = [
            { CATEGORY_ID: '1', DIALOG_ID: 'chat_a' },
            { CATEGORY_ID: '1', DIALOG_ID: 'chat_b' },
            { CATEGORY_ID: '1', DIALOG_ID: 'chat_c' },
        ];

        const result = groupChatsByCategory(chatRows);
        expect(result[1]).toEqual(['chat_a', 'chat_b', 'chat_c']);
    });
});

// ─── Tests: MAX_ORDER_SIZE guard ───────────────────────────────────────────

describe('MAX_ORDER_SIZE guard', () => {
    const MAX_ORDER_SIZE = 100;

    test('array of 100 items is within limit', () => {
        const order = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, sort: (i + 1) * 100 }));
        expect(order.length > MAX_ORDER_SIZE).toBe(false);
    });

    test('array of 101 items exceeds limit', () => {
        const order = Array.from({ length: 101 }, (_, i) => ({ id: i + 1, sort: (i + 1) * 100 }));
        expect(order.length > MAX_ORDER_SIZE).toBe(true);
    });

    test('empty array is within limit', () => {
        expect([].length > MAX_ORDER_SIZE).toBe(false);
    });
});

// ─── Tests: Tab sort key mapping (saveAllTabSorts logic) ───────────────────

describe('saveAllTabSorts key mapping', () => {
    const standardMap = {
        chat: 'chats',
        taskstask: 'task',
        copilot: 'copilot',
        channel: 'channel',
        collab: 'collab',
        openlines: 'openlines',
        openlinesv2: 'openlines',
    };
    const systemTabs = ['crmdeal', 'notifychat', 'taskchat'];

    function classifyKey(webKey) {
        webKey = webKey.toLowerCase();
        if (standardMap[webKey]) return { type: 'standard', mobileId: standardMap[webKey] };
        if (systemTabs.includes(webKey)) return { type: 'system', code: webKey };
        const match = webKey.match(/^customcat_(\d+)$/);
        if (match && parseInt(match[1], 10) > 0) return { type: 'custom', catId: parseInt(match[1], 10) };
        return { type: 'unknown' };
    }

    test('classifies standard tabs correctly', () => {
        expect(classifyKey('chat')).toEqual({ type: 'standard', mobileId: 'chats' });
        expect(classifyKey('taskstask')).toEqual({ type: 'standard', mobileId: 'task' });
        expect(classifyKey('copilot')).toEqual({ type: 'standard', mobileId: 'copilot' });
    });

    test('classifies system tabs correctly', () => {
        expect(classifyKey('crmdeal')).toEqual({ type: 'system', code: 'crmdeal' });
        expect(classifyKey('notifychat')).toEqual({ type: 'system', code: 'notifychat' });
        expect(classifyKey('taskchat')).toEqual({ type: 'system', code: 'taskchat' });
    });

    test('classifies custom category tabs correctly', () => {
        expect(classifyKey('customcat_5')).toEqual({ type: 'custom', catId: 5 });
        expect(classifyKey('customcat_42')).toEqual({ type: 'custom', catId: 42 });
    });

    test('ignores customcat_0 (system, not user-defined)', () => {
        expect(classifyKey('customcat_0')).toEqual({ type: 'unknown' });
    });

    test('ignores unknown keys', () => {
        expect(classifyKey('randomtab')).toEqual({ type: 'unknown' });
    });

    test('handles case-insensitive keys', () => {
        expect(classifyKey('CHAT')).toEqual({ type: 'standard', mobileId: 'chats' });
        expect(classifyKey('Copilot')).toEqual({ type: 'standard', mobileId: 'copilot' });
        expect(classifyKey('CRMDEAL')).toEqual({ type: 'system', code: 'crmdeal' });
    });

    test('openlines and openlinesv2 both map to openlines', () => {
        expect(classifyKey('openlines').mobileId).toBe('openlines');
        expect(classifyKey('openlinesv2').mobileId).toBe('openlines');
    });

    test('openlines dedup keeps smaller sort', () => {
        const sorts = { openlines: 300, openlinesv2: 600 };
        const standardSorts = {};

        Object.entries(sorts).forEach(([key, sort]) => {
            const mobileId = standardMap[key];
            if (!standardSorts[mobileId] || sort < standardSorts[mobileId]) {
                standardSorts[mobileId] = sort;
            }
        });

        expect(standardSorts.openlines).toBe(300);
    });
});

// ─── Tests: Menu item ID generation ────────────────────────────────────────

describe('Menu item ID generation', () => {
    test('generates correct ID for category', () => {
        const catId = 5;
        expect(`customCat_${catId}`).toBe('customCat_5');
    });

    test('generates IDs for multiple categories preserving order', () => {
        const categories = [
            { ID: '1', NAME: 'Cat A', SORT: 500 },
            { ID: '2', NAME: 'Cat B', SORT: 600 },
        ];

        const ids = categories.map(cat => `customCat_${cat.ID}`);
        expect(ids).toEqual(['customCat_1', 'customCat_2']);
    });

    test('roundtrip: generate → parse', () => {
        const catId = 42;
        const menuId = `customCat_${catId}`;
        const parsed = getCategoryIdFromLayout(menuId);
        expect(parsed).toBe(catId);
    });
});

// ─── Tests: Mobile standard sort presets ───────────────────────────────────

describe('Mobile standard sort presets', () => {
    function computeSorts(tabs) {
        const sorts = {};
        tabs.forEach((tab, i) => {
            sorts[tab] = (i + 1) * 100;
        });
        return sorts;
    }

    test('default preset assigns correct sorts', () => {
        const sorts = computeSorts(['chat', 'taskstask', 'copilot', 'channel', 'collab', 'openlines']);
        expect(sorts.chat).toBe(100);
        expect(sorts.taskstask).toBe(200);
        expect(sorts.openlines).toBe(600);
    });

    test('CRM operator preset assigns openlines first', () => {
        const sorts = computeSorts(['openlines', 'chat', 'taskstask', 'copilot', 'channel', 'collab']);
        expect(sorts.openlines).toBe(100);
        expect(sorts.chat).toBe(200);
    });

    test('regular operator preset assigns chat first', () => {
        const sorts = computeSorts(['chat', 'openlines', 'taskstask', 'copilot', 'channel', 'collab']);
        expect(sorts.chat).toBe(100);
        expect(sorts.openlines).toBe(200);
    });

    test('extra web-only sorts do not override existing', () => {
        const sorts = computeSorts(['chat', 'taskstask', 'copilot', 'channel', 'collab', 'openlines']);
        const extras = { openlinesv2: 700, notification: 800, call: 900, market: 1000, settings: 1100 };

        Object.entries(extras).forEach(([key, val]) => {
            if (!sorts[key]) sorts[key] = val;
        });

        expect(sorts.openlinesv2).toBe(700);
        expect(sorts.notification).toBe(800);
        expect(sorts.settings).toBe(1100);
    });
});
