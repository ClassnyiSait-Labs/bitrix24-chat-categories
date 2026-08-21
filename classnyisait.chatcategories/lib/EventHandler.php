<?php
namespace Classnyisait\ChatCategories;

use Bitrix\Im\V2\Application\Navigation\NavigationMenuBuildEvent;
use Bitrix\Im\V2\Application\Navigation\MenuItem;
use Bitrix\Main\EventResult;
use Bitrix\Main\Loader;
use Bitrix\Main\Page\Asset;
use Bitrix\Main\Web\Json;
use Classnyisait\ChatCategories\Model\CategoryTable;
use Classnyisait\ChatCategories\Model\CategoryChatTable;

class EventHandler
{
    public static function onProlog(): void
    {
        Loader::includeModule("classnyisait.chatcategories");
        self::injectCategoriesMap();
    }

    /**
     * Пробрасывает в JS mapping {categoryId: [dialogId, ...]}, чтобы
     * v26_compat.js мог фильтровать список recent при активной customCat_-вкладке.
     */
    private static function injectCategoriesMap(): void
    {
        $userId = (int)(\Bitrix\Main\Engine\CurrentUser::get()->getId());
        if ($userId <= 0) {
            return;
        }

        $categories = CategoryTable::getList([
            "select" => ["ID", "NAME", "SORT"],
            "filter" => ["USER_ID" => $userId],
            "order" => ["SORT" => "ASC", "NAME" => "ASC"],
        ])->fetchAll();

        $list = array_map(
            static fn($c) => [
                "id"   => (int)$c["ID"],
                "name" => (string)$c["NAME"],
                "sort" => (int)$c["SORT"],
            ],
            $categories
        );

        $map = [];
        if (!empty($categories)) {
            $catIds = array_map(static fn($c) => (int)$c["ID"], $categories);
            $rows = CategoryChatTable::getList([
                "select" => ["CATEGORY_ID", "DIALOG_ID"],
                "filter" => ["@CATEGORY_ID" => $catIds],
            ])->fetchAll();

            foreach ($rows as $row) {
                $cid = (string)$row["CATEGORY_ID"];
                $map[$cid] ??= [];
                $map[$cid][] = (string)$row["DIALOG_ID"];
            }
        }

        Asset::getInstance()->addString(
            '<script>'
            . 'window.classnyisaitCategoriesMap = ' . Json::encode($map) . ';'
            . 'window.classnyisaitCategoriesList = ' . Json::encode($list) . ';'
            . '</script>'
        );
    }

    public static function onNavigationMenuBuild(NavigationMenuBuildEvent $event): EventResult
    {
        $collection = $event->getCollection();

        $userId = (int)(\Bitrix\Main\Engine\CurrentUser::get()->getId());
        if ($userId <= 0) {
            return new EventResult(EventResult::SUCCESS);
        }

        $categories = CategoryTable::getList([
            "filter" => ["USER_ID" => $userId],
            "order" => ["SORT" => "ASC", "NAME" => "ASC"],
        ])->fetchAll();

        foreach ($categories as $cat) {
            $collection->add(new MenuItem(
                id: "customCat_" . $cat["ID"],
                text: $cat["NAME"],
                sort: (int)$cat["SORT"],
            ));
        }

        return new EventResult(EventResult::SUCCESS);
    }
}
