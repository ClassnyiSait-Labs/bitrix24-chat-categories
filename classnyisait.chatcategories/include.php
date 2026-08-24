<?php
use Bitrix\Main\Loader;
use Bitrix\Main\Page\Asset;

$moduleId = 'classnyisait.chatcategories';

// Engine ajax reads module-root .settings.php (controllers). Some zip/scp
// deploys drop dotfiles -- restore from the non-hidden twin if needed.
$settingsDst = __DIR__ . '/.settings.php';
$settingsSrc = __DIR__ . '/module.settings.php';
if (!is_file($settingsDst) && is_file($settingsSrc)) {
    @copy($settingsSrc, $settingsDst);
}

// Publish JS/CSS under /bitrix/js|css (allowed). /bitrix/modules/ is often 403.
$publicJsDir = '/bitrix/js/classnyisait.chatcategories';
$publicCssDir = '/bitrix/css/classnyisait.chatcategories';
$docRoot = rtrim((string)($_SERVER['DOCUMENT_ROOT'] ?? ''), '/\\');

$publishPairs = [
    [__DIR__ . '/install/js', $docRoot . $publicJsDir],
    [__DIR__ . '/install/css', $docRoot . $publicCssDir],
];
foreach ($publishPairs as [$srcDir, $dstDir]) {
    if ($docRoot === '' || !is_dir($srcDir) || !function_exists('CopyDirFiles')) {
        continue;
    }
    $needCopy = !is_dir($dstDir);
    if (!$needCopy) {
        foreach (scandir($srcDir) ?: [] as $name) {
            if ($name === '.' || $name === '..') {
                continue;
            }
            $srcFile = $srcDir . '/' . $name;
            $dstFile = $dstDir . '/' . $name;
            if (is_file($srcFile) && (!is_file($dstFile) || filemtime($srcFile) > filemtime($dstFile))) {
                $needCopy = true;
                break;
            }
        }
    }
    if ($needCopy) {
        CopyDirFiles($srcDir, $dstDir, true, true);
    }
}

// Автозагрузка классов
Loader::registerAutoLoadClasses($moduleId, [
    'Classnyisait\ChatCategories\EventHandler'            => 'lib/EventHandler.php',
    'Classnyisait\ChatCategories\Model\CategoryTable'     => 'lib/Model/CategoryTable.php',
    'Classnyisait\ChatCategories\Model\CategoryChatTable' => 'lib/Model/CategoryChatTable.php',
    'Classnyisait\ChatCategories\Controller\Category'     => 'lib/Controller/Category.php',
]);

$asset = Asset::getInstance();

$cssFile = $docRoot . $publicCssDir . '/categories.css';
$asset->addCss($publicCssDir . '/categories.css' . (is_file($cssFile) ? '?v=' . filemtime($cssFile) : ''));

// v26 UI для управления категориями: "+ Категория", popup'ы создания/переименования/
// удаления, контекстное меню "Категории" в чате. Маршрутизация и фильтрация — в
// classnyisait.crmchat/install/js/v26_compat.js.
$compatScript = $publicJsDir . '/v26_layout_compat.js';
$compatFile = $docRoot . $compatScript;
$asset->addString(
    '<script src="' . $compatScript . (is_file($compatFile) ? '?v=' . filemtime($compatFile) : '') . '"></script>'
);

$uiScript = $publicJsDir . '/v26_categories_ui.js';
$uiFile = $docRoot . $uiScript;
$asset->addString(
    '<script src="' . $uiScript . (is_file($uiFile) ? '?v=' . filemtime($uiFile) : '') . '"></script>'
);

$portalVersion = defined('SM_VERSION') && SM_VERSION
    ? (string)SM_VERSION
    : (string)\Bitrix\Main\ModuleManager::getVersion('main');
$moduleIdForVer = $moduleId;
$moduleVersion = (string)\Bitrix\Main\ModuleManager::getVersion($moduleIdForVer);
if ($moduleVersion === '') {
    $arModuleVersion = [];
    $verFile = __DIR__ . '/install/version.php';
    if (is_file($verFile)) {
        include $verFile;
        $moduleVersion = (string)(isset($arModuleVersion['VERSION']) ? $arModuleVersion['VERSION'] : '');
    }
}

$classnyiModules = [];
$installed = [];
if (class_exists('\Bitrix\Main\ModuleManager')) {
    $installed = \Bitrix\Main\ModuleManager::getInstalledModules();
}
if (!is_array($installed)) {
    $installed = [];
}
foreach ($installed as $installedId => $installedInfo) {
    $mid = is_array($installedInfo) && !empty($installedInfo['ID'])
        ? (string)$installedInfo['ID']
        : (string)$installedId;
    if (strncmp($mid, 'classnyisait.', 13) !== 0) {
        continue;
    }
    $mver = '';
    if (class_exists('\Bitrix\Main\ModuleManager')) {
        $mver = (string)\Bitrix\Main\ModuleManager::getVersion($mid);
    }
    if ($mver === '' && is_array($installedInfo) && !empty($installedInfo['VERSION'])) {
        $mver = (string)$installedInfo['VERSION'];
    }
    if ($mver === '' && class_exists('CModule')) {
        $modObj = \CModule::CreateModuleObject($mid);
        if (is_object($modObj) && !empty($modObj->MODULE_VERSION)) {
            $mver = (string)$modObj->MODULE_VERSION;
        }
    }
    if ($mid === $moduleIdForVer && $mver === '') {
        $mver = $moduleVersion;
    }
    $classnyiModules[] = [
        'id' => $mid,
        'version' => $mver !== '' ? $mver : '?',
    ];
}
usort($classnyiModules, static function ($a, $b) {
    return strcmp($a['id'], $b['id']);
});

$asset->addString(
    '<script>'
    . 'window.classnyisaitChatCatPortalVersion = ' . \Bitrix\Main\Web\Json::encode($portalVersion) . ';'
    . 'window.classnyisaitChatCatModuleVersion = ' . \Bitrix\Main\Web\Json::encode($moduleVersion) . ';'
    . 'window.classnyisaitChatCatModules = ' . \Bitrix\Main\Web\Json::encode($classnyiModules) . ';'
    . 'if (window.BX && BX.message) { BX.message(' . \Bitrix\Main\Web\Json::encode([
        'CLASSNYISAIT_CHATCAT_PORTAL_VERSION' => $portalVersion,
        'CLASSNYISAIT_CHATCAT_MODULE_VERSION' => $moduleVersion,
        'CLASSNYISAIT_CHATCAT_MODULES_JSON' => \Bitrix\Main\Web\Json::encode($classnyiModules),
    ]) . '); }'
    . '</script>'
);

// Old JS disabled - incompatible with module-level LayoutComponentMap in v26.
//$asset->addJs($publicJsDir.'/categories_core.js');
//$asset->addJs($publicJsDir.'/categories_context_menu.js');
