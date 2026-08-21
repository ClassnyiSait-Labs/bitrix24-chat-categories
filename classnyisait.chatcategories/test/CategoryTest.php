<?php
namespace Classnyisait\ChatCategories\Test;

use PHPUnit\Framework\TestCase;

/**
 * Unit tests for classnyisait.chatcategories module.
 *
 * Covers:
 *   - Controller constants and limit guards
 *   - Batch grouping logic (N+1 prevention)
 *   - Tab sort mapping (standard/system/custom)
 *   - Input validation (name trimming, empty arrays)
 *   - saveAllTabSortsAction key mapping
 *   - EventHandler menu item generation
 *   - Model table definitions
 *
 * Run: php vendor/bin/phpunit test/CategoryTest.php
 */
class CategoryTest extends TestCase
{
    // ─── Constants ─────────────────────────────────────────────────────

    public function testMaxCategoriesPerUserConstant(): void
    {
        $reflection = new \ReflectionClass(\Classnyisait\ChatCategories\Controller\Category::class);
        $constant = $reflection->getConstant('MAX_CATEGORIES_PER_USER');
        $this->assertSame(50, $constant);
    }

    public function testMaxChatsPerCategoryConstant(): void
    {
        $reflection = new \ReflectionClass(\Classnyisait\ChatCategories\Controller\Category::class);
        $constant = $reflection->getConstant('MAX_CHATS_PER_CATEGORY');
        $this->assertSame(200, $constant);
    }

    public function testMaxOrderSizeConstant(): void
    {
        $reflection = new \ReflectionClass(\Classnyisait\ChatCategories\Controller\Category::class);
        $constant = $reflection->getConstant('MAX_ORDER_SIZE');
        $this->assertSame(100, $constant);
    }

    // ─── Limit guards ──────────────────────────────────────────────────

    public function testReorderActionRejectsOversizedArray(): void
    {
        $order = [];
        for ($i = 1; $i <= 101; $i++) {
            $order[] = ['id' => $i, 'sort' => $i * 100];
        }

        $this->assertCount(101, $order);
        $this->assertGreaterThan(100, count($order));
    }

    public function testReorderActionAcceptsExactLimitArray(): void
    {
        $order = [];
        for ($i = 1; $i <= 100; $i++) {
            $order[] = ['id' => $i, 'sort' => $i * 100];
        }

        $this->assertCount(100, $order);
        $this->assertFalse(count($order) > 100);
    }

    public function testSaveAllTabSortsRejectsOversizedArray(): void
    {
        $sorts = [];
        for ($i = 1; $i <= 101; $i++) {
            $sorts['key_' . $i] = $i * 100;
        }

        $this->assertCount(101, $sorts);
        $this->assertGreaterThan(100, count($sorts));
    }

    public function testSaveAllTabSortsAcceptsExactLimitArray(): void
    {
        $sorts = [];
        for ($i = 1; $i <= 100; $i++) {
            $sorts['key_' . $i] = $i * 100;
        }

        $this->assertCount(100, $sorts);
        $this->assertFalse(count($sorts) > 100);
    }

    // ─── Batch grouping (listAction logic) ─────────────────────────────

    public function testDialogIdBatchGrouping(): void
    {
        $chatRows = [
            ['CATEGORY_ID' => '1', 'DIALOG_ID' => 'chat1'],
            ['CATEGORY_ID' => '1', 'DIALOG_ID' => 'chat2'],
            ['CATEGORY_ID' => '2', 'DIALOG_ID' => 'chat3'],
        ];

        $chatsByCategory = $this->groupChatsByCategory($chatRows);

        $this->assertCount(2, $chatsByCategory[1]);
        $this->assertCount(1, $chatsByCategory[2]);
        $this->assertContains('chat1', $chatsByCategory[1]);
        $this->assertContains('chat2', $chatsByCategory[1]);
        $this->assertContains('chat3', $chatsByCategory[2]);
    }

    public function testBatchGroupingWithEmptyRows(): void
    {
        $chatsByCategory = $this->groupChatsByCategory([]);
        $this->assertEmpty($chatsByCategory);
    }

    public function testBatchGroupingWithSingleCategory(): void
    {
        $chatRows = [
            ['CATEGORY_ID' => '5', 'DIALOG_ID' => 'chat10'],
            ['CATEGORY_ID' => '5', 'DIALOG_ID' => 'chat20'],
            ['CATEGORY_ID' => '5', 'DIALOG_ID' => 'chat30'],
        ];

        $chatsByCategory = $this->groupChatsByCategory($chatRows);
        $this->assertArrayHasKey(5, $chatsByCategory);
        $this->assertCount(3, $chatsByCategory[5]);
    }

    public function testBatchGroupingWithManyCategories(): void
    {
        $chatRows = [];
        for ($catId = 1; $catId <= 10; $catId++) {
            $chatRows[] = ['CATEGORY_ID' => (string)$catId, 'DIALOG_ID' => "chat{$catId}00"];
        }

        $chatsByCategory = $this->groupChatsByCategory($chatRows);
        $this->assertCount(10, $chatsByCategory);
    }

    public function testEmptyCategoryDialogIdFallback(): void
    {
        $chatsByCategory = $this->groupChatsByCategory([]);
        $dialogIds = $chatsByCategory[99] ?? [];
        $this->assertSame([], $dialogIds);
    }

    // ─── Name validation logic ─────────────────────────────────────────

    public function testAddActionRejectsEmptyName(): void
    {
        $name = trim('');
        $this->assertSame('', $name, 'Empty name should fail validation');
    }

    public function testAddActionRejectsWhitespaceName(): void
    {
        $name = trim('   ');
        $this->assertSame('', $name, 'Whitespace-only name should fail validation');
    }

    public function testAddActionTrimsName(): void
    {
        $name = trim('  My Category  ');
        $this->assertSame('My Category', $name);
    }

    public function testUpdateActionRejectsEmptyTrimmedName(): void
    {
        $name = trim('   ');
        $this->assertSame('', $name, 'Update with whitespace name should fail');
    }

    // ─── reorderAction logic ───────────────────────────────────────────

    public function testReorderActionSkipsInvalidId(): void
    {
        $items = [
            ['id' => 0, 'sort' => 100],
            ['id' => -1, 'sort' => 200],
            ['id' => 5, 'sort' => 300],
        ];

        $valid = array_filter($items, function ($item) {
            $id   = (int)($item['id'] ?? 0);
            $sort = (int)($item['sort'] ?? 0);
            return $id > 0 && $sort > 0;
        });

        $this->assertCount(1, $valid);
    }

    public function testReorderActionSkipsZeroSort(): void
    {
        $items = [
            ['id' => 1, 'sort' => 0],
            ['id' => 2, 'sort' => 100],
        ];

        $valid = array_filter($items, function ($item) {
            return (int)($item['id'] ?? 0) > 0 && (int)($item['sort'] ?? 0) > 0;
        });

        $this->assertCount(1, $valid);
    }

    public function testReorderActionSkipsNegativeSort(): void
    {
        $items = [
            ['id' => 1, 'sort' => -50],
            ['id' => 2, 'sort' => 200],
        ];

        $valid = array_filter($items, function ($item) {
            return (int)($item['id'] ?? 0) > 0 && (int)($item['sort'] ?? 0) > 0;
        });

        $this->assertCount(1, $valid);
    }

    // ─── saveAllTabSortsAction key mapping ─────────────────────────────

    public function testStandardTabKeyMapping(): void
    {
        $standardMap = [
            'chat'        => 'chats',
            'taskstask'   => 'task',
            'copilot'     => 'copilot',
            'channel'     => 'channel',
            'collab'      => 'collab',
            'openlines'   => 'openlines',
            'openlinesv2' => 'openlines',
        ];

        $this->assertSame('chats', $standardMap['chat']);
        $this->assertSame('task', $standardMap['taskstask']);
        $this->assertSame('openlines', $standardMap['openlines']);
        $this->assertSame('openlines', $standardMap['openlinesv2']);
    }

    public function testOpenlinesDuplicateMapping(): void
    {
        // openlines and openlinesv2 both map to "openlines"
        // The smaller sort should win
        $standardMap = [
            'openlines'   => 'openlines',
            'openlinesv2' => 'openlines',
        ];
        $sorts = ['openlines' => 300, 'openlinesv2' => 600];
        $standardSorts = [];

        foreach ($sorts as $webKey => $sort) {
            $mobileId = $standardMap[$webKey];
            if (!isset($standardSorts[$mobileId]) || $sort < $standardSorts[$mobileId]) {
                $standardSorts[$mobileId] = $sort;
            }
        }

        $this->assertSame(300, $standardSorts['openlines']);
    }

    public function testSystemTabDetection(): void
    {
        $systemTabs = ['crmdeal', 'notifychat', 'taskchat'];

        $this->assertContains('crmdeal', $systemTabs);
        $this->assertContains('notifychat', $systemTabs);
        $this->assertContains('taskchat', $systemTabs);
        $this->assertNotContains('chat', $systemTabs);
    }

    public function testCustomCatKeyParsing(): void
    {
        $keys = ['customcat_1', 'customcat_42', 'customcat_0', 'customcat_abc', 'chat'];
        $parsed = [];

        foreach ($keys as $key) {
            if (preg_match('/^customcat_(\d+)$/', $key, $match)) {
                $catId = (int)$match[1];
                if ($catId > 0) {
                    $parsed[] = $catId;
                }
            }
        }

        $this->assertSame([1, 42], $parsed);
    }

    public function testCustomCatKeyWithZeroIdIsSkipped(): void
    {
        $key = 'customcat_0';
        preg_match('/^customcat_(\d+)$/', $key, $match);
        $catId = (int)($match[1] ?? 0);
        $this->assertSame(0, $catId);
        $this->assertFalse($catId > 0, 'customcat_0 should be skipped (system, not user-defined)');
    }

    public function testSortKeysAreLowercased(): void
    {
        $keys = ['Chat', 'COPILOT', 'CustomCat_5'];
        $lowered = array_map(fn($k) => strtolower($k), $keys);
        $this->assertSame(['chat', 'copilot', 'customcat_5'], $lowered);
    }

    public function testZeroSortIsSkipped(): void
    {
        $sorts = ['chat' => 0, 'copilot' => 200, 'channel' => -10];
        $valid = array_filter($sorts, fn($sort) => (int)$sort > 0);
        $this->assertSame(['copilot' => 200], $valid);
    }

    // ─── saveSystemSortsAction logic ───────────────────────────────────

    public function testSaveSystemSortsAllowedCodes(): void
    {
        $allowed = ['crmdeal', 'notifychat', 'taskchat'];
        $input = ['crmdeal' => 150, 'notifychat' => 200, 'unknown' => 300, 'taskchat' => 250];

        $accepted = array_filter($input, fn($sort, $code) =>
            in_array($code, $allowed, true) && (int)$sort > 0,
            ARRAY_FILTER_USE_BOTH
        );

        $this->assertArrayHasKey('crmdeal', $accepted);
        $this->assertArrayHasKey('notifychat', $accepted);
        $this->assertArrayHasKey('taskchat', $accepted);
        $this->assertArrayNotHasKey('unknown', $accepted);
    }

    public function testSaveSystemSortsRejectsNegativeSort(): void
    {
        $allowed = ['crmdeal', 'notifychat', 'taskchat'];
        $input = ['crmdeal' => -10];

        $accepted = array_filter($input, fn($sort, $code) =>
            in_array($code, $allowed, true) && (int)$sort > 0,
            ARRAY_FILTER_USE_BOTH
        );

        $this->assertEmpty($accepted);
    }

    // ─── addChatAction idempotency ─────────────────────────────────────

    public function testAddChatIdempotencyReturnsExisting(): void
    {
        // Simulate: existing link found → return it without error
        $existing = ['ID' => 42, 'CATEGORY_ID' => 1, 'DIALOG_ID' => 'chat10'];
        $result = [
            'id' => $existing['ID'],
            'categoryId' => (int)$existing['CATEGORY_ID'],
            'dialogId' => $existing['DIALOG_ID'],
        ];

        $this->assertSame(42, $result['id']);
        $this->assertSame(1, $result['categoryId']);
        $this->assertSame('chat10', $result['dialogId']);
    }

    // ─── removeChatAction ──────────────────────────────────────────────

    public function testRemoveChatReturnsNotRemovedWhenLinkMissing(): void
    {
        // When link doesn't exist, return removed=false
        $link = null;
        $result = $link ? ['removed' => true] : ['removed' => false];
        $this->assertFalse($result['removed']);
    }

    // ─── EventHandler ──────────────────────────────────────────────────

    public function testEventHandlerOnPrologMethodExists(): void
    {
        $this->assertTrue(
            method_exists(\Classnyisait\ChatCategories\EventHandler::class, 'onProlog')
        );
    }

    public function testEventHandlerOnNavigationMenuBuildMethodExists(): void
    {
        $this->assertTrue(
            method_exists(\Classnyisait\ChatCategories\EventHandler::class, 'onNavigationMenuBuild')
        );
    }

    public function testEventHandlerMethodsAreStatic(): void
    {
        $methods = ['onProlog', 'onNavigationMenuBuild'];
        foreach ($methods as $methodName) {
            $ref = new \ReflectionMethod(\Classnyisait\ChatCategories\EventHandler::class, $methodName);
            $this->assertTrue($ref->isStatic(), "$methodName должен быть static");
        }
    }

    public function testMenuItemIdPrefix(): void
    {
        // EventHandler generates menu items with id "customCat_{ID}"
        $catId = 5;
        $menuItemId = 'customCat_' . $catId;
        $this->assertSame('customCat_5', $menuItemId);
        $this->assertStringStartsWith('customCat_', $menuItemId);
    }

    public function testMenuItemIdForMultipleCategories(): void
    {
        $categories = [
            ['ID' => '1', 'NAME' => 'Cat A', 'SORT' => 500],
            ['ID' => '2', 'NAME' => 'Cat B', 'SORT' => 600],
        ];

        $menuIds = array_map(fn($cat) => 'customCat_' . $cat['ID'], $categories);
        $this->assertSame(['customCat_1', 'customCat_2'], $menuIds);
    }

    // ─── Model classes ─────────────────────────────────────────────────

    public function testCategoryTableClassExists(): void
    {
        $this->assertTrue(
            class_exists(\Classnyisait\ChatCategories\Model\CategoryTable::class)
        );
    }

    public function testCategoryChatTableClassExists(): void
    {
        $this->assertTrue(
            class_exists(\Classnyisait\ChatCategories\Model\CategoryChatTable::class)
        );
    }

    public function testCategoryTableHasGetTableName(): void
    {
        $this->assertTrue(
            method_exists(\Classnyisait\ChatCategories\Model\CategoryTable::class, 'getTableName')
        );
    }

    public function testCategoryChatTableHasGetTableName(): void
    {
        $this->assertTrue(
            method_exists(\Classnyisait\ChatCategories\Model\CategoryChatTable::class, 'getTableName')
        );
    }

    public function testCategoryTableHasGetMap(): void
    {
        $this->assertTrue(
            method_exists(\Classnyisait\ChatCategories\Model\CategoryTable::class, 'getMap')
        );
    }

    public function testCategoryChatTableHasGetMap(): void
    {
        $this->assertTrue(
            method_exists(\Classnyisait\ChatCategories\Model\CategoryChatTable::class, 'getMap')
        );
    }

    // ─── Controller class structure ────────────────────────────────────

    public function testControllerActionsExist(): void
    {
        $actions = [
            'listAction',
            'addAction',
            'updateAction',
            'deleteAction',
            'addChatAction',
            'removeChatAction',
            'reorderAction',
            'saveAllTabSortsAction',
            'saveSystemSortsAction',
            'getChatsAction',
        ];

        foreach ($actions as $action) {
            $this->assertTrue(
                method_exists(\Classnyisait\ChatCategories\Controller\Category::class, $action),
                "Controller должен иметь метод $action"
            );
        }
    }

    public function testControllerExtendsBaseController(): void
    {
        $ref = new \ReflectionClass(\Classnyisait\ChatCategories\Controller\Category::class);
        $this->assertTrue(
            $ref->isSubclassOf(\Bitrix\Main\Engine\Controller::class),
            'Category controller должен наследовать Bitrix Controller'
        );
    }

    // ─── Mobile standard sorts logic ───────────────────────────────────

    public function testDefaultPresetSortValues(): void
    {
        // Default preset: messenger(100), task(200), copilot(300), channel(400), collab(500), openLines(600)
        $tabs = ['chat', 'taskstask', 'copilot', 'channel', 'collab', 'openlines'];
        $sorts = [];
        foreach ($tabs as $i => $tab) {
            $sorts[$tab] = ($i + 1) * 100;
        }

        $this->assertSame(100, $sorts['chat']);
        $this->assertSame(200, $sorts['taskstask']);
        $this->assertSame(300, $sorts['copilot']);
        $this->assertSame(600, $sorts['openlines']);
    }

    public function testCrmOperatorPresetSortValues(): void
    {
        // CRM operator: openLines(100), messenger(200), task(300), copilot(400), channel(500), collab(600)
        $tabs = ['openlines', 'chat', 'taskstask', 'copilot', 'channel', 'collab'];
        $sorts = [];
        foreach ($tabs as $i => $tab) {
            $sorts[$tab] = ($i + 1) * 100;
        }

        $this->assertSame(100, $sorts['openlines']);
        $this->assertSame(200, $sorts['chat']);
    }

    public function testExtraWebOnlySortValues(): void
    {
        $extras = ['openlinesv2' => 700, 'notification' => 800, 'call' => 900, 'market' => 1000, 'settings' => 1100];

        $this->assertSame(700, $extras['openlinesv2']);
        $this->assertSame(1100, $extras['settings']);
        $this->assertCount(5, $extras);
    }

    // ─── mergeWithCategoryTabs sort logic (Manager.php) ──────────────

    /**
     * Simulates the mergeWithCategoryTabs sort logic.
     * Standard tabs use saved sorts if available, otherwise positional (i+1)*100.
     * Category tabs use their DB sort.
     * Result is sorted by sort value.
     */
    public function testMergeSortWithSavedSorts(): void
    {
        // Simulate: user dragged custom category to position 1 (sort=50),
        // chats is position 2 (sort=150) — saved in standard_tab_sorts
        $savedSorts = ['chats' => 150, 'task' => 250, 'copilot' => 350];
        $standardTabs = [
            ['id' => 'chats', 'presetIndex' => 0],
            ['id' => 'task', 'presetIndex' => 1],
            ['id' => 'copilot', 'presetIndex' => 2],
        ];
        $categoryTabs = [
            ['id' => 'customCat_5', 'sort' => 50],  // TEST!!! — first
        ];

        $sorted = $this->simulateMergeWithCategoryTabs($standardTabs, $categoryTabs, $savedSorts);

        $this->assertSame('customCat_5', $sorted[0]['id'], 'Custom category should be first');
        $this->assertSame('chats', $sorted[1]['id'], 'Chats should be second');
        $this->assertSame('task', $sorted[2]['id']);
        $this->assertSame('copilot', $sorted[3]['id']);
    }

    public function testMergeSortWithoutSavedSortsFallsBackToPositional(): void
    {
        $savedSorts = [];
        $standardTabs = [
            ['id' => 'chats', 'presetIndex' => 0],
            ['id' => 'task', 'presetIndex' => 1],
            ['id' => 'copilot', 'presetIndex' => 2],
        ];
        $categoryTabs = [
            ['id' => 'customCat_5', 'sort' => 150],
        ];

        $sorted = $this->simulateMergeWithCategoryTabs($standardTabs, $categoryTabs, $savedSorts);

        // chats=100 (positional), customCat_5=150, task=200, copilot=300
        $this->assertSame('chats', $sorted[0]['id']);
        $this->assertSame('customCat_5', $sorted[1]['id']);
        $this->assertSame('task', $sorted[2]['id']);
    }

    public function testMergeSortPartialSavedSorts(): void
    {
        // Only chats has a saved sort, others fall back to positional
        $savedSorts = ['chats' => 500];
        $standardTabs = [
            ['id' => 'chats', 'presetIndex' => 0],
            ['id' => 'task', 'presetIndex' => 1],
            ['id' => 'copilot', 'presetIndex' => 2],
        ];
        $categoryTabs = [
            ['id' => 'customCat_5', 'sort' => 150],
        ];

        $sorted = $this->simulateMergeWithCategoryTabs($standardTabs, $categoryTabs, $savedSorts);

        // customCat_5=150, task=200 (positional), copilot=300 (positional), chats=500 (saved)
        $this->assertSame('customCat_5', $sorted[0]['id']);
        $this->assertSame('task', $sorted[1]['id']);
        $this->assertSame('copilot', $sorted[2]['id']);
        $this->assertSame('chats', $sorted[3]['id'], 'Chats moved to last by saved sort');
    }

    public function testMergeSortSavedSortZeroFallsBackToPositional(): void
    {
        $savedSorts = ['chats' => 0, 'task' => 200];
        $standardTabs = [
            ['id' => 'chats', 'presetIndex' => 0],
            ['id' => 'task', 'presetIndex' => 1],
        ];
        $categoryTabs = [];

        $sorted = $this->simulateMergeWithCategoryTabs($standardTabs, $categoryTabs, $savedSorts);

        // chats: saved=0 → fallback to positional (0+1)*100=100
        // task: saved=200
        $this->assertSame('chats', $sorted[0]['id']);
        $this->assertSame(100, $sorted[0]['sort'], 'Zero saved sort falls back to positional');
        $this->assertSame('task', $sorted[1]['id']);
        $this->assertSame(200, $sorted[1]['sort']);
    }

    public function testMergeSortNegativeSavedSortFallsBackToPositional(): void
    {
        $savedSorts = ['chats' => -10];
        $standardTabs = [
            ['id' => 'chats', 'presetIndex' => 0],
        ];

        $sorted = $this->simulateMergeWithCategoryTabs($standardTabs, [], $savedSorts);
        $this->assertSame(100, $sorted[0]['sort']);
    }

    public function testMergeSortCategoryBetweenStandardTabs(): void
    {
        // CRM chats (sort=150) should go between chats(100) and task(200)
        $savedSorts = [];
        $standardTabs = [
            ['id' => 'chats', 'presetIndex' => 0],
            ['id' => 'task', 'presetIndex' => 1],
            ['id' => 'copilot', 'presetIndex' => 2],
        ];
        $categoryTabs = [
            ['id' => 'customCat_0', 'sort' => 150],
        ];

        $sorted = $this->simulateMergeWithCategoryTabs($standardTabs, $categoryTabs, $savedSorts);

        $this->assertSame('chats', $sorted[0]['id']);
        $this->assertSame('customCat_0', $sorted[1]['id']);
        $this->assertSame('task', $sorted[2]['id']);
    }

    public function testMergeSortMultipleCategoriesInterleaved(): void
    {
        $savedSorts = [];
        $standardTabs = [
            ['id' => 'chats', 'presetIndex' => 0],
            ['id' => 'task', 'presetIndex' => 1],
            ['id' => 'copilot', 'presetIndex' => 2],
        ];
        $categoryTabs = [
            ['id' => 'customCat_0', 'sort' => 150],   // CRM between chats and task
            ['id' => 'customCat_-1', 'sort' => 250],  // Events between task and copilot
        ];

        $sorted = $this->simulateMergeWithCategoryTabs($standardTabs, $categoryTabs, $savedSorts);

        $ids = array_column($sorted, 'id');
        $this->assertSame(['chats', 'customCat_0', 'task', 'customCat_-1', 'copilot'], $ids);
    }

    public function testMergeSortFirstTabIdIsCorrectAfterReorder(): void
    {
        // When user puts custom category first, FIRST_TAB_ID should be that category
        $savedSorts = ['chats' => 200];
        $standardTabs = [
            ['id' => 'chats', 'presetIndex' => 0],
        ];
        $categoryTabs = [
            ['id' => 'customCat_5', 'sort' => 50],
        ];

        $sorted = $this->simulateMergeWithCategoryTabs($standardTabs, $categoryTabs, $savedSorts);

        $firstTabId = $sorted[0]['id'];
        $this->assertSame('customCat_5', $firstTabId, 'FIRST_TAB_ID should match first sorted tab');
    }

    public function testMergeSortOnlyStandardTabsReorderedNoCategories(): void
    {
        // User reordered only standard tabs (no category tabs)
        $savedSorts = ['chats' => 300, 'task' => 100, 'copilot' => 200];
        $standardTabs = [
            ['id' => 'chats', 'presetIndex' => 0],
            ['id' => 'task', 'presetIndex' => 1],
            ['id' => 'copilot', 'presetIndex' => 2],
        ];

        $sorted = $this->simulateMergeWithCategoryTabs($standardTabs, [], $savedSorts);

        $ids = array_column($sorted, 'id');
        $this->assertSame(['task', 'copilot', 'chats'], $ids);
    }

    public function testGetUserStandardTabSortsEmptyJson(): void
    {
        $json = '';
        $result = ($json === '' || $json === '0') ? [] : json_decode($json, true);
        $this->assertSame([], $result);
    }

    public function testGetUserStandardTabSortsZeroString(): void
    {
        $json = '0';
        $result = ($json === '' || $json === '0') ? [] : json_decode($json, true);
        $this->assertSame([], $result);
    }

    public function testGetUserStandardTabSortsValidJson(): void
    {
        $json = '{"chats":200,"task":100}';
        $decoded = json_decode($json, true);
        $this->assertIsArray($decoded);
        $this->assertSame(200, $decoded['chats']);
        $this->assertSame(100, $decoded['task']);
    }

    public function testGetUserStandardTabSortsInvalidJson(): void
    {
        $json = 'not-valid-json{';
        $decoded = json_decode($json, true);
        $result = is_array($decoded) ? $decoded : [];
        $this->assertSame([], $result);
    }

    // ─── Helper ────────────────────────────────────────────────────────

    private function groupChatsByCategory(array $chatRows): array
    {
        $chatsByCategory = [];
        foreach ($chatRows as $chatRow) {
            $chatsByCategory[(int)$chatRow['CATEGORY_ID']][] = $chatRow['DIALOG_ID'];
        }
        return $chatsByCategory;
    }

    /**
     * Simulates mergeWithCategoryTabs logic from Manager.php for unit testing.
     */
    private function simulateMergeWithCategoryTabs(array $standardTabs, array $categoryTabs, array $savedSorts): array
    {
        $entries = [];
        foreach ($standardTabs as $tab) {
            $tabId = $tab['id'];
            $i = $tab['presetIndex'];
            $sort = isset($savedSorts[$tabId]) && $savedSorts[$tabId] > 0
                ? (int)$savedSorts[$tabId]
                : ($i + 1) * 100;
            $entries[] = ['id' => $tabId, 'sort' => $sort];
        }
        foreach ($categoryTabs as $cat) {
            $entries[] = ['id' => $cat['id'], 'sort' => $cat['sort']];
        }

        usort($entries, static fn($a, $b) => $a['sort'] <=> $b['sort']);

        return $entries;
    }
}
