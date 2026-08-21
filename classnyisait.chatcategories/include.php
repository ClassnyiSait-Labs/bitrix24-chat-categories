<?php
use Bitrix\Main\Loader;
use Bitrix\Main\Page\Asset;

$moduleId = 'classnyisait.chatcategories';

// Определяем веб-путь к модулю, чтобы он работал и для /bitrix/modules, и для /local/modules
$webModuleDir = (is_dir($_SERVER['DOCUMENT_ROOT'].'/local/modules/'.$moduleId))
    ? '/local/modules/'.$moduleId
    : '/bitrix/modules/'.$moduleId;

// Автозагрузка классов
Loader::registerAutoLoadClasses($moduleId, [
    'Classnyisait\ChatCategories\EventHandler'            => 'lib/EventHandler.php',
    'Classnyisait\ChatCategories\Model\CategoryTable'     => 'lib/Model/CategoryTable.php',
    'Classnyisait\ChatCategories\Model\CategoryChatTable' => 'lib/Model/CategoryChatTable.php',
    'Classnyisait\ChatCategories\Controller\Category'     => 'lib/Controller/Category.php',
]);

$asset = Asset::getInstance();

// Подключение CSS
$asset->addCss($webModuleDir.'/install/css/categories.css');

// v26 UI для управления категориями: "+ Категория", popup'ы создания/переименования/
// удаления, контекстное меню "Категории" в чате. Маршрутизация и фильтрация — в
// classnyisait.crmchat/install/js/v26_compat.js.
$uiScript = $webModuleDir . '/install/js/v26_categories_ui.js';
$uiFile = $_SERVER['DOCUMENT_ROOT'] . $uiScript;
$asset->addString(
    '<script src="' . $uiScript . '?v=' . filemtime($uiFile) . '"></script>'
);
// Старые JS отключены — несовместимы с module-level LayoutComponentMap в v26 (см. memory).
//$asset->addJs($webModuleDir.'/install/js/categories_core.js');
//$asset->addJs($webModuleDir.'/install/js/categories_context_menu.js');
?>
