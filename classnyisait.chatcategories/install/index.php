<?php
IncludeModuleLangFile(__FILE__);
use Bitrix\Main\ModuleManager;
use Bitrix\Main\EventManager;
use Bitrix\Main\Application;

class classnyisait_chatcategories extends CModule
{
    var $MODULE_ID = "classnyisait.chatcategories";
    var $MODULE_VERSION;
    var $MODULE_VERSION_DATE;
    var $MODULE_NAME;
    var $MODULE_DESCRIPTION;
    var $PARTNER_NAME = "ClassnyiSait";
    var $PARTNER_URI  = "https://classnyisait.ru";

    public function __construct()
    {
        $arModuleVersion = [];
        include(__DIR__ . "/version.php");

        $this->MODULE_VERSION      = $arModuleVersion["VERSION"];
        $this->MODULE_VERSION_DATE = $arModuleVersion["VERSION_DATE"];
        $this->MODULE_NAME         = "Категории чатов";
        $this->MODULE_DESCRIPTION  = "Пользовательские категории чатов в мессенджере. Работает только на веб-версии Битрикс24 (коробочная редакция).";
        $this->PARTNER_NAME = "ClassnyiSait";
        $this->PARTNER_URI = "https://classnyisait.ru";
    }

    function DoInstall()
    {
        $this->InstallDB();
        $this->InstallEvents();
        ModuleManager::registerModule($this->MODULE_ID);
        return true;
    }

    function DoUninstall()
    {
        global $APPLICATION;

        $step = max(1, (int)($_REQUEST['step'] ?? 1));
        if ($step === 1) {
            $APPLICATION->IncludeAdminFile(
                'Удаление модуля «Категории чатов»',
                __DIR__ . '/unstep1.php'
            );

            return true;
        }

        if (!check_bitrix_sessid()) {
            return false;
        }

        $deleteData = (string)($_REQUEST['delete_data'] ?? 'N') === 'Y';

        $this->UnInstallEvents();
        if ($deleteData) {
            $this->UnInstallDB();
        }
        ModuleManager::unRegisterModule($this->MODULE_ID);

        $APPLICATION->IncludeAdminFile(
            'Удаление модуля «Категории чатов»',
            __DIR__ . '/unstep2.php'
        );

        return true;
    }

    function InstallDB()
    {
        $connection = Application::getConnection();
        $sqlFile = __DIR__ . "/db/mysql/install.sql";
        if (file_exists($sqlFile)) {
            $sql = file_get_contents($sqlFile);
            $statements = array_filter(array_map("trim", explode(";", $sql)));
            foreach ($statements as $statement) {
                if ($statement) {
                    $connection->queryExecute($statement);
                }
            }
        }
    }

    function UnInstallDB()
    {
        $connection = Application::getConnection();
        $sqlFile = __DIR__ . "/db/mysql/uninstall.sql";
        if (file_exists($sqlFile)) {
            $sql = file_get_contents($sqlFile);
            $statements = array_filter(array_map("trim", explode(";", $sql)));
            foreach ($statements as $statement) {
                if ($statement) {
                    $connection->queryExecute($statement);
                }
            }
        }
    }

    function InstallEvents()
    {
        $eventManager = EventManager::getInstance();
        $eventManager->registerEventHandler(
            "main",
            "OnProlog",
            $this->MODULE_ID,
            "\Classnyisait\ChatCategories\EventHandler",
            "onProlog"
        );
        $eventManager->registerEventHandler(
            "im",
            "OnAfterNavigationMenuBuild",
            $this->MODULE_ID,
            "\Classnyisait\ChatCategories\EventHandler",
            "onNavigationMenuBuild"
        );
    }

    function UnInstallEvents()
    {
        $eventManager = EventManager::getInstance();
        $eventManager->unRegisterEventHandler(
            "main",
            "OnProlog",
            $this->MODULE_ID,
            "\Classnyisait\ChatCategories\EventHandler",
            "onProlog"
        );
        $eventManager->unRegisterEventHandler(
            "im",
            "OnAfterNavigationMenuBuild",
            $this->MODULE_ID,
            "\Classnyisait\ChatCategories\EventHandler",
            "onNavigationMenuBuild"
        );
    }
}
