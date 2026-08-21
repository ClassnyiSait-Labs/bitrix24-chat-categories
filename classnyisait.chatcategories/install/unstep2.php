<?php

$dataDeleted = (string)($_REQUEST['delete_data'] ?? 'N') === 'Y';
?>
<p>Модуль «Категории чатов» удалён.</p>
<p>
    <?= $dataDeleted
        ? 'Таблицы и данные модуля удалены.'
        : 'Таблицы и данные сохранены для последующей переустановки.' ?>
</p>
<p>
    <a href="<?= htmlspecialcharsbx($APPLICATION->GetCurPage()) ?>?lang=<?= urlencode(LANGUAGE_ID) ?>">
        Вернуться к списку модулей
    </a>
</p>