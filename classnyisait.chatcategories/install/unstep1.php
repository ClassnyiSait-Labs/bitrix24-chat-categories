<?php

if (!check_bitrix_sessid()) {
    return;
}
?>
<form action="<?= htmlspecialcharsbx($APPLICATION->GetCurPage()) ?>" method="post">
    <?= bitrix_sessid_post() ?>
    <input type="hidden" name="lang" value="<?= htmlspecialcharsbx(LANGUAGE_ID) ?>">
    <input type="hidden" name="id" value="classnyisait.chatcategories">
    <input type="hidden" name="uninstall" value="Y">
    <input type="hidden" name="step" value="2">

    <p>Удалить модуль «Категории чатов»?</p>
    <p>
        <label>
            <input type="checkbox" name="delete_data" value="Y">
            Удалить таблицы и данные модуля
        </label>
    </p>
    <p style="color:#a00;">
        Отмечайте чекбокс только при окончательном удалении: восстановить удалённые данные без резервной копии будет нельзя.
    </p>
    <p style="color:#777;">
        Если чекбокс не отмечен, таблицы и данные сохранятся для последующей переустановки модуля.
    </p>

    <input type="submit" value="Удалить модуль">
</form>