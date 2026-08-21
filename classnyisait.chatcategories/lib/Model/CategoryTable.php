<?php
namespace Classnyisait\ChatCategories\Model;

use Bitrix\Main\ORM\Data\DataManager;
use Bitrix\Main\ORM\Fields\IntegerField;
use Bitrix\Main\ORM\Fields\StringField;
use Bitrix\Main\ORM\Fields\DatetimeField;
use Bitrix\Main\Type\DateTime;

class CategoryTable extends DataManager
{
    public static function getTableName(): string
    {
        return "b_custom_chat_category";
    }

    public static function getMap(): array
    {
        return [
            (new IntegerField("ID"))
                ->configurePrimary()
                ->configureAutocomplete(),
            (new IntegerField("USER_ID"))
                ->configureRequired(),
            (new StringField("NAME"))
                ->configureRequired()
                ->configureSize(255),
            (new IntegerField("SORT"))
                ->configureDefaultValue(500),
            (new DatetimeField("CREATED_AT"))
                ->configureDefaultValue(static function () {
                    return new DateTime();
                }),
        ];
    }
}
