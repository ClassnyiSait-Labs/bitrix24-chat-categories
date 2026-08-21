<?php

/**
 * Test stub for the Bitrix ORM base class of the same name.
 *
 * Exists solely so that the module's Model\CategoryTable and
 * Model\CategoryChatTable can be loaded outside a Bitrix24 portal. Empty on
 * purpose: the unit tests check that getTableName() and getMap() are declared,
 * not what they return — the field objects those maps build come from the
 * kernel and are only meaningful on a real portal.
 */

declare(strict_types=1);

namespace Bitrix\Main\ORM\Data;

class DataManager
{
}
