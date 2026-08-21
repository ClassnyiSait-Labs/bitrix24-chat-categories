# Категории чатов для Bitrix24

[English version](README.md) · [Лицензия MIT](LICENSE)

[![CI](https://github.com/ClassnyiSait-Labs/bitrix24-chat-categories/actions/workflows/ci.yml/badge.svg)](https://github.com/ClassnyiSait-Labs/bitrix24-chat-categories/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)


Бесплатный модуль с открытым исходным кодом для **коробочного Bitrix24**. Позволяет каждому
пользователю создавать собственные категории чатов — свои вкладки рядом со штатными.

![Категории чатов в мессенджере](docs/screenshots/01-overview.png)

## Зачем

В мессенджере Bitrix24 есть один общий список Recent и несколько фиксированных вкладок. Когда
чатов несколько десятков, поиск нужного превращается в прокрутку. Модуль даёт сгруппировать
переписки так, как человек реально работает: по проектам, клиентам, командам.

## Возможности

- создание личных категорий чатов — до 50 на пользователя;
- добавление чата в категорию через контекстное меню;
- переименование и удаление категорий;
- сортировка вкладок перетаскиванием (drag & drop);
- данные приватные: категории видит только их владелец;
- безопасное удаление модуля: таблицы и данные удаляются только при явном выборе администратора.

## Требования

- коробочная редакция Bitrix24, версия 26.0 и выше
- веб-версия мессенджера

## Установка

1. Скопируйте папку `classnyisait.chatcategories` в `/local/modules/` (или `/bitrix/modules/`).
2. **Marketplace → Установленные решения** → «Категории чатов» → *Установить*.
3. Перезагрузите мессенджер — блок категорий появится рядом со штатными вкладками.

Страница модуля: <https://classnyisait.ru/modules/>

## Скриншоты

| Контекстное меню | Вкладка категории | Сортировка |
| --- | --- | --- |
| ![Контекстное меню](docs/screenshots/02-context-menu.jpg) | ![Категория](docs/screenshots/03-category.jpg) | ![Сортировка](docs/screenshots/04-sorting.jpg) |

## Структура проекта

```
classnyisait.chatcategories/
├── install/            установка, SQL-схема, фронтенд (JS/CSS)
├── lib/Controller/     AJAX-контроллер CRUD категорий
├── lib/Model/          D7 ORM-таблицы (категории, связь чат↔категория)
├── lib/EventHandler.php  интеграция в интерфейс мессенджера
└── test/               PHP- и JS-тесты
```

## Разработка

```bash
composer install
composer test          # 59 PHPUnit-тестов
npx jest              # 41 Jest-тест
```

Тесты покрывают чистую логику, работающую без ядра Битрикса. Всё, что обращается к базе,
корзине или интерфейсу мессенджера, требует живого портала и проверяется вручную —
подробности в [CONTRIBUTING.md](CONTRIBUTING.md).

CI прогоняет линт и тесты на PHP 8.1, 8.2 и 8.3 при каждом push и pull request.

## Вклад в проект

Issues и pull requests приветствуются. При баг-репорте укажите номер сборки Bitrix24 и браузер.

## Лицензия

MIT — см. [LICENSE](LICENSE).

Разработчик: [ClassnyiSait Labs](https://classnyisait.ru/) ·
[Поддержать разработчика](https://classnyisait.ru/support)
