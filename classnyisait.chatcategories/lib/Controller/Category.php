<?php
namespace Classnyisait\ChatCategories\Controller;

use Bitrix\Main\Application;
use Bitrix\Main\Engine\Controller;
use Bitrix\Main\Engine\CurrentUser;
use Bitrix\Main\Error;
use Bitrix\Main\Loader;
use Bitrix\Main\ModuleManager;
use Classnyisait\ChatCategories\Model\CategoryTable;
use Classnyisait\ChatCategories\Model\CategoryChatTable;

class Category extends Controller
{
    private const MAX_CATEGORIES_PER_USER = 50;
    private const MAX_CHATS_PER_CATEGORY  = 200;
    private const MAX_ORDER_SIZE          = 100;

    protected function getDefaultPreFilters(): array
    {
        return [
            new \Bitrix\Main\Engine\ActionFilter\Authentication(),
        ];
    }

    public function configureActions(): array
    {
        $writeFilters = static function (): array {
            return [
                new \Bitrix\Main\Engine\ActionFilter\Authentication(),
                new \Bitrix\Main\Engine\ActionFilter\HttpMethod([
                    \Bitrix\Main\Engine\ActionFilter\HttpMethod::METHOD_POST,
                ]),
                new \Bitrix\Main\Engine\ActionFilter\Csrf(),
            ];
        };

        return [
            "add" => ["prefilters" => $writeFilters()],
            "update" => ["prefilters" => $writeFilters()],
            "delete" => ["prefilters" => $writeFilters()],
            "addChat" => ["prefilters" => $writeFilters()],
            "removeChat" => ["prefilters" => $writeFilters()],
            "reorder" => ["prefilters" => $writeFilters()],
            "saveAllTabSorts" => ["prefilters" => $writeFilters()],
            "saveSystemSorts" => ["prefilters" => $writeFilters()],
        ];
    }

    public function listAction(): array
    {
        $userId = (int)CurrentUser::get()->getId();

        $rows = CategoryTable::getList([
            "filter" => ["=USER_ID" => $userId],
            "order"  => ["SORT" => "ASC", "NAME" => "ASC"],
        ])->fetchAll();

        if (empty($rows)) {
            return [
                "categories" => [],
                "mobileSorts" => $this->getMobileStandardSorts(),
            ];
        }

        $categoryIds = array_column($rows, "ID");

        // Batch query: all chats for all categories in one round-trip (avoids N+1)
        $chatRows = CategoryChatTable::getList([
            "filter" => ["=CATEGORY_ID" => $categoryIds],
            "select" => ["CATEGORY_ID", "DIALOG_ID"],
        ])->fetchAll();

        $chatsByCategory = [];
        foreach ($chatRows as $chatRow) {
            $chatsByCategory[(int)$chatRow["CATEGORY_ID"]][] = $chatRow["DIALOG_ID"];
        }

        $categories = [];
        foreach ($rows as $row) {
            $catId = (int)$row["ID"];
            $categories[] = [
                "id"        => $catId,
                "name"      => $row["NAME"],
                "sort"      => (int)$row["SORT"],
                "dialogIds" => $chatsByCategory[$catId] ?? [],
            ];
        }

        return [
            "categories" => $categories,
            "mobileSorts" => $this->getMobileStandardSorts(),
        ];
    }

    /**
     * Returns mobile standard tab sort values based on the user's preset.
     * Mobile mergeWithCategoryTabs() assigns sort = (position+1)*100 for standard tabs.
     * The tab order depends on the preset (default / openline operator / crm operator).
     */
    private function getMobileStandardSorts(): array
    {
        // Determine preset: default, operator, or crmOperator
        $isOperator = false;
        if (ModuleManager::isModuleInstalled("imopenlines")) {
            try {
                $isOperator = \Bitrix\Im\Integration\Imopenlines\User::isOperator();
            } catch (\Throwable $e) {
                $isOperator = false;
            }
        }

        if ($isOperator) {
            $isCrm = false;
            if (Loader::includeModule("mobile")) {
                try {
                    $isCrm = (new \Bitrix\Mobile\Tab\Manager())->getPresetName() === "crm";
                } catch (\Throwable $e) {}
            }

            if ($isCrm) {
                // getCrmOpenLineOperatorPreset: openLines, messenger, task, copilot, channel, collab
                $tabs = ["openlines", "chat", "taskstask", "copilot", "channel", "collab"];
            } else {
                // getOpenLineOperatorPreset: messenger, openLines, task, copilot, channel, collab
                $tabs = ["chat", "openlines", "taskstask", "copilot", "channel", "collab"];
            }
        } else {
            // getDefaultPreset: messenger, task, copilot, collab, channel, openLines
            // (matches web MenuItemProvider: collab=400, channel=500)
            $tabs = ["chat", "taskstask", "copilot", "collab", "channel", "openlines"];
        }

        $sorts = [];
        foreach ($tabs as $i => $tab) {
            $sorts[$tab] = ($i + 1) * 100;
        }

        // Add extra web-only items with high sort values
        $extras = ["openlinesv2" => 700, "notification" => 800, "call" => 900, "market" => 1000, "settings" => 1100];
        foreach ($extras as $key => $val) {
            if (!isset($sorts[$key])) {
                $sorts[$key] = $val;
            }
        }

        if (\Bitrix\Main\ModuleManager::isModuleInstalled("custom.dealchat")) {
            $sorts["crmdeal"] = 150;
        }

        return $sorts;
    }

    public function addAction(string $name, int $sort = 500): ?array
    {
        $userId = (int)CurrentUser::get()->getId();
        $name   = trim($name);

        if ($name === "") {
            $this->addError(new Error("Name is required"));
            return null;
        }

        $count = CategoryTable::getCount(["=USER_ID" => $userId]);
        if ($count >= self::MAX_CATEGORIES_PER_USER) {
            $this->addError(new Error("Maximum number of categories reached"));
            return null;
        }

        $result = CategoryTable::add([
            "USER_ID" => $userId,
            "NAME"    => $name,
            "SORT"    => $sort,
        ]);

        if (!$result->isSuccess()) {
            $this->addErrors($result->getErrors());
            return null;
        }

        return [
            "id"   => $result->getId(),
            "name" => $name,
            "sort" => $sort,
        ];
    }

    public function updateAction(int $id, ?string $name = null, ?int $sort = null): ?array
    {
        $userId = (int)CurrentUser::get()->getId();

        $category = CategoryTable::getRow([
            "filter" => ["=ID" => $id, "=USER_ID" => $userId],
        ]);

        if (!$category) {
            $this->addError(new Error("Category not found"));
            return null;
        }

        $fields = [];
        if ($name !== null) {
            $name = trim($name);
            if ($name === "") {
                $this->addError(new Error("Name cannot be empty"));
                return null;
            }
            $fields["NAME"] = $name;
        }
        if ($sort !== null) {
            $fields["SORT"] = $sort;
        }

        if (empty($fields)) {
            return ["id" => $id];
        }

        $result = CategoryTable::update($id, $fields);
        if (!$result->isSuccess()) {
            $this->addErrors($result->getErrors());
            return null;
        }

        return ["id" => $id, "name" => $fields["NAME"] ?? $category["NAME"], "sort" => $fields["SORT"] ?? $category["SORT"]];
    }

    public function deleteAction(int $id): ?array
    {
        $userId = (int)CurrentUser::get()->getId();

        $category = CategoryTable::getRow([
            "filter" => ["=ID" => $id, "=USER_ID" => $userId],
        ]);

        if (!$category) {
            $this->addError(new Error("Category not found"));
            return null;
        }

        $connection = Application::getConnection();
        $connection->startTransaction();
        try {
            $chatLinks = CategoryChatTable::getList([
                "filter" => ["=CATEGORY_ID" => $id],
            ]);
            while ($link = $chatLinks->fetch()) {
                CategoryChatTable::delete($link["ID"]);
            }

            $result = CategoryTable::delete($id);
            if (!$result->isSuccess()) {
                $connection->rollbackTransaction();
                $this->addErrors($result->getErrors());
                return null;
            }

            $connection->commitTransaction();
        } catch (\Throwable $e) {
            $connection->rollbackTransaction();
            $this->addError(new Error("Failed to delete category"));
            return null;
        }

        return ["id" => $id];
    }

    public function addChatAction(int $categoryId, string $dialogId): ?array
    {
        $userId = (int)CurrentUser::get()->getId();

        $category = CategoryTable::getRow([
            "filter" => ["=ID" => $categoryId, "=USER_ID" => $userId],
        ]);

        if (!$category) {
            $this->addError(new Error("Category not found"));
            return null;
        }

        // Idempotent: return existing link without error
        $existing = CategoryChatTable::getRow([
            "filter" => ["=CATEGORY_ID" => $categoryId, "=DIALOG_ID" => $dialogId],
        ]);

        if ($existing) {
            return ["id" => $existing["ID"], "categoryId" => $categoryId, "dialogId" => $dialogId];
        }

        $count = CategoryChatTable::getCount(["=CATEGORY_ID" => $categoryId]);
        if ($count >= self::MAX_CHATS_PER_CATEGORY) {
            $this->addError(new Error("Maximum number of chats per category reached"));
            return null;
        }

        $result = CategoryChatTable::add([
            "CATEGORY_ID" => $categoryId,
            "DIALOG_ID"   => $dialogId,
        ]);

        if (!$result->isSuccess()) {
            $this->addErrors($result->getErrors());
            return null;
        }

        return ["id" => $result->getId(), "categoryId" => $categoryId, "dialogId" => $dialogId];
    }

    public function removeChatAction(int $categoryId, string $dialogId): ?array
    {
        $userId = (int)CurrentUser::get()->getId();

        $category = CategoryTable::getRow([
            "filter" => ["=ID" => $categoryId, "=USER_ID" => $userId],
        ]);

        if (!$category) {
            $this->addError(new Error("Category not found"));
            return null;
        }

        $link = CategoryChatTable::getRow([
            "filter" => ["=CATEGORY_ID" => $categoryId, "=DIALOG_ID" => $dialogId],
        ]);

        if (!$link) {
            return ["removed" => false];
        }

        $result = CategoryChatTable::delete($link["ID"]);
        if (!$result->isSuccess()) {
            $this->addErrors($result->getErrors());
            return null;
        }

        return ["removed" => true, "categoryId" => $categoryId, "dialogId" => $dialogId];
    }

    public function reorderAction(array $order): ?array
    {
        if (count($order) > self::MAX_ORDER_SIZE) {
            $this->addError(new Error("Order array is too large"));
            return null;
        }

        $userId  = (int)CurrentUser::get()->getId();
        $updated = [];

        foreach ($order as $item) {
            $id   = (int)($item["id"] ?? 0);
            $sort = (int)($item["sort"] ?? 0);
            if ($id <= 0 || $sort <= 0) continue;
            $cat = CategoryTable::getRow(["filter" => ["=ID" => $id, "=USER_ID" => $userId]]);
            if (!$cat) continue;
            if ((int)$cat["SORT"] !== $sort) {
                CategoryTable::update($id, ["SORT" => $sort]);
                $updated[] = ["id" => $id, "sort" => $sort];
            }
        }

        return ["updated" => $updated];
    }

    /**
     * Saves per-user sort for ALL tabs after a drag-and-drop reorder on web.
     * Handles three kinds of items:
     *   - Standard tabs (chat, taskstask, copilot, ...): saved as JSON in CUserOptions 'standard_tab_sorts'
     *   - System tabs (crmdeal, notifychat): saved individually in CUserOptions
     *   - User categories (customcat_N, N > 0): SORT field updated in b_custom_chat_category
     */
    public function saveAllTabSortsAction(array $sorts): ?array
    {
        if (count($sorts) > self::MAX_ORDER_SIZE) {
            $this->addError(new Error("Sorts array is too large"));
            return null;
        }

        $userId = (int)CurrentUser::get()->getId();

        // Web key (lowercase) → mobile tab ID
        $standardMap = [
            "chat"        => "chats",
            "taskstask"   => "task",
            "copilot"     => "copilot",
            "channel"     => "channel",
            "collab"      => "collab",
            "openlines"   => "openlines",
            "openlinesv2" => "openlines",
        ];
        $systemTabs = ["crmdeal", "notifychat", "taskchat"];

        $standardSorts = [];

        foreach ($sorts as $webKey => $sort) {
            $webKey = strtolower((string)$webKey);
            $sort   = (int)$sort;
            if ($sort <= 0) {
                continue;
            }

            if (isset($standardMap[$webKey])) {
                $mobileId = $standardMap[$webKey];
                // Keep the smaller sort if two web keys map to the same mobile tab (openlines/openlinesv2)
                if (!isset($standardSorts[$mobileId]) || $sort < $standardSorts[$mobileId]) {
                    $standardSorts[$mobileId] = $sort;
                }
            } elseif (in_array($webKey, $systemTabs, true)) {
                \CUserOptions::SetOption("classnyisait.chatcategories", "tab_sort_" . $webKey, $sort, false, $userId);
            } elseif (preg_match("/^customcat_(\d+)$/", $webKey, $match)) {
                $catId = (int)$match[1];
                if ($catId > 0) {
                    $cat = CategoryTable::getRow(["filter" => ["=ID" => $catId, "=USER_ID" => $userId]]);
                    if ($cat !== null && (int)$cat["SORT"] !== $sort) {
                        CategoryTable::update($catId, ["SORT" => $sort]);
                    }
                }
            }
        }

        if (!empty($standardSorts)) {
            \CUserOptions::SetOption(
                "classnyisait.chatcategories",
                "standard_tab_sorts",
                json_encode($standardSorts),
                false,
                $userId
            );
        }

        return ["saved" => true];
    }

    /**
     * Saves per-user sort values for system tabs (crmdeal, notifychat).
     * Stored in CUserOptions and read by immobile Manager.php for mobile tab ordering.
     */
    public function saveSystemSortsAction(array $sorts): ?array
    {
        $userId  = (int)CurrentUser::get()->getId();
        $allowed = ["crmdeal", "notifychat", "taskchat"];

        foreach ($sorts as $code => $sort) {
            $code = (string)$code;
            $sort = (int)$sort;
            if (!in_array($code, $allowed, true) || $sort <= 0) {
                continue;
            }
            \CUserOptions::SetOption("classnyisait.chatcategories", "tab_sort_" . $code, $sort, false, $userId);
        }

        return ["saved" => true];
    }

    public function getChatsAction(int $categoryId): ?array
    {
        $userId = (int)CurrentUser::get()->getId();

        $category = CategoryTable::getRow([
            "filter" => ["=ID" => $categoryId, "=USER_ID" => $userId],
        ]);

        if (!$category) {
            $this->addError(new Error("Category not found"));
            return null;
        }

        $chats = CategoryChatTable::getList([
            "filter" => ["=CATEGORY_ID" => $categoryId],
            "select" => ["DIALOG_ID"],
        ])->fetchAll();

        return ["dialogIds" => array_column($chats, "DIALOG_ID")];
    }
}
