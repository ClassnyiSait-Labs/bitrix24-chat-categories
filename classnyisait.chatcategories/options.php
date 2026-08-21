<?php
defined("B_PROLOG_INCLUDED") && B_PROLOG_INCLUDED === true or die();

use Bitrix\Main\Loader;
use Bitrix\Main\Localization\Loc;

Loc::loadMessages(__FILE__);

$module_id = "classnyisait.chatcategories";

if (!Loader::includeModule($module_id)) {
    return;
}

$tabControl = new CAdminTabControl('classnyisait_chatcategories_tabs', [
    [
        'DIV' => 'module_info',
        'TAB' => 'Информация',
        'TITLE' => 'Информация о модуле',
    ],
    [
        'DIV' => 'classnyisait_support',
        'TAB' => 'Поддержать разработчика',
        'TITLE' => 'Поддержка разработки бесплатных модулей ClassnyiSait',
    ],
]);
?>
<?php $tabControl->Begin(); ?>
<?php $tabControl->BeginNextTab(); ?>
<tr>
    <td colspan="2">
<div style="padding: 20px; font-family: Arial, sans-serif; color: #333;">
    <p>Модуль не требует дополнительной настройки.</p>
    <p>Категории создаются и управляются каждым пользователем самостоятельно в мессенджере Bitrix24.</p>
</div>
    </td>
</tr>
    <?php $tabControl->BeginNextTab(); ?>
    <tr class="heading">
        <td colspan="2">Поддержать разработчика</td>
    </tr>
    <tr>
        <td colspan="2" style="text-align:center;padding:32px 20px;">
            <p style="max-width:720px;margin:0 auto 20px;font-size:15px;line-height:1.5;">
                Поддержка помогает развивать бесплатные модули ClassnyiSait, тестировать обновления и сохранять совместимость с новыми версиями 1С-Битрикс.
            </p>
            <a class="adm-btn adm-btn-save"
               href="https://classnyisait.ru/support"
               target="_blank"
               rel="noopener noreferrer">Поддержать разработчика</a>
        </td>
    </tr>
<?php $tabControl->End(); ?>
