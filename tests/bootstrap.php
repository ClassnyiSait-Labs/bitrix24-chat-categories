<?php

/**
 * PHPUnit bootstrap.
 *
 * Two module classes cannot be loaded without a Bitrix kernel, because they
 * extend kernel classes: Controller\Category extends Bitrix\Main\Engine\Controller,
 * and the Model\*Table classes extend Bitrix\Main\ORM\Data\DataManager.
 *
 * tests/stubs/ provides the bare minimum for those two parents to exist, so the
 * module classes become loadable and reflection-based assertions can run in CI.
 * The stubs carry no behaviour on purpose — the tests only inspect structure
 * (constants, method existence, inheritance). Anything that actually calls into
 * the kernel needs a running Bitrix24 and is out of scope for unit tests.
 *
 * When a real Bitrix kernel is present it is loaded first and the stubs are
 * never reached, because the autoloader only resolves classes nobody defined yet.
 */

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
