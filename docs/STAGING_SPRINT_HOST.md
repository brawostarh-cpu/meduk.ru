# Staging и обновление на SprintHost

Текущий document root из панели: `/home/lukt120/domains/meduk.ru/public_html/`.

## До загрузки

1. Сделать полный архив `public_html` и приватных данных аналитики.
2. Убедиться, что архив можно скачать и распаковать.
3. Не удалять старую копию до завершения проверки.

## Публичные файлы

В `public_html` загружаются только файлы сайта и каталоги `admin/`, `assets/`. Файлы `MEDUK_MASTER_PLAN...`, `README*`, `package.json`, `scripts/`, `content/`, `docs/`, `.git/` и тестовые данные в public root не нужны. Корневой `.htaccess` закрывает их, но правильнее не загружать.

## Данные вне public_html

Аналитика ожидает каталог рядом с public root:

```text
/home/lukt120/domains/meduk.ru/meduk-data/
```

Каталог должен быть недоступен через URL и иметь минимальные права. Не создавать его внутри `public_html`.

## После загрузки

Проверить HTTPS и статические файлы:

```text
https://meduk.ru/
https://meduk.ru/manifest.webmanifest
https://meduk.ru/sw.js
https://meduk.ru/assets/mark-88.webp
```

Ожидается:

- `admin/lib.php` не отдаёт исходный код;
- список каталогов выключен;
- `.git`, `.env`, `scripts/`, `docs/` и планы недоступны;
- `.php` не попадают в service-worker cache;
- звук, помодоро, дыхание и маршрут `.ics` работают без аккаунта.

## Важно

Сейчас в репозитории нет production-ключей ЮKassa, SMTP, РКН-подтверждения или реальных аккаунтных данных. Платёжный режим не включается заменой флага. До публичного платного запуска нужны release gates из `docs/release-gates.json`.
