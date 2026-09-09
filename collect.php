<?php

declare(strict_types=1);

/* Meduk Relax — приём статистики от stats.js.
   Отвечаем пустотой и как можно быстрее: счётчик не должен мешать сайту работать. */

require __DIR__ . '/admin/lib.php';

header('Content-Type: text/plain; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

/** Возвращает только короткое скалярное значение; набор ключей задаётся ниже по событию. */
function meduk_collect_scalar(array $props, string $key, int $maxLength = 64): string
{
    if (!array_key_exists($key, $props) || !is_scalar($props[$key])) {
        return '';
    }
    $clean = preg_replace('~[[:cntrl:]]~', '', (string) $props[$key]);
    return substr(is_string($clean) ? trim($clean) : '', 0, $maxLength);
}

/**
 * Событийный allowlist не даёт произвольному клиенту записать email, телефон, IP или иной PII.
 * Значения совпадают с фактическими отправителями в stats.js/app.js.
 */
function meduk_collect_props(string $name, $rawProps): array
{
    if (!is_array($rawProps)) {
        return [];
    }

    $out = [];
    if ($name === 'visit') {
        $ref = strtolower(meduk_collect_scalar($rawProps, 'ref', 253));
        if ($ref !== '' && preg_match('~^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?::\d{1,5})?$~D', $ref) === 1) {
            $out['ref'] = $ref;
        }

        $width = meduk_collect_scalar($rawProps, 'w', 4);
        if (preg_match('~^\d{3,4}$~D', $width) === 1 && (int) $width >= 240 && (int) $width <= 7680) {
            $out['w'] = (string) (int) $width;
        }

        $lang = strtolower(meduk_collect_scalar($rawProps, 'lang', 6));
        if (preg_match('~^[a-z]{2,3}(?:-[a-z]{2})?$~D', $lang) === 1) {
            $out['lang'] = $lang;
        }

        if (meduk_collect_scalar($rawProps, 'pwa', 1) === '1') {
            $out['pwa'] = '1';
        }

        $theme = meduk_collect_scalar($rawProps, 'theme', 8);
        if (in_array($theme, ['paper', 'light', 'gold'], true)) {
            $out['theme'] = $theme;
        }
        return $out;
    }

    if ($name === 'donate') {
        if (meduk_collect_scalar($rawProps, 'kind', 8) === 'sbor') {
            $out['kind'] = 'sbor';
        }
        return $out;
    }

    if ($name === 'telegram') {
        $from = meduk_collect_scalar($rawProps, 'from', 8);
        if (in_array($from, ['tgLink', 'link'], true)) {
            $out['from'] = $from;
        }
        return $out;
    }

    if ($name === 'preset' || $name === 'play') {
        $key = $name === 'play' ? 'preset' : 'id';
        $preset = meduk_collect_scalar($rawProps, $key, 16);
        $presets = ['focus', 'reading', 'clear', 'cram', 'memory', 'exam', 'afterclass', 'aftershift', 'meditate', 'creative', 'romance', 'walk', 'nap', 'sleep', 'custom'];
        if (in_array($preset, $presets, true)) {
            $out[$key] = $preset;
        }
        return $out;
    }

    if ($name === 'section') {
        $section = meduk_collect_scalar($rawProps, 'id', 12);
        if (in_array($section, ['player', 'presets', 'mixer', 'focus', 'breath', 'science', 'support'], true)) {
            $out['id'] = $section;
        }
        return $out;
    }

    if ($name === 'theme') {
        $theme = meduk_collect_scalar($rawProps, 'v', 8);
        if (in_array($theme, ['paper', 'light', 'gold'], true)) {
            $out['v'] = $theme;
        }
        return $out;
    }

    if ($name === 'share') {
        if (meduk_collect_scalar($rawProps, 'what', 8) === 'mix') {
            $out['what'] = 'mix';
        }
        return $out;
    }

    if ($name === 'install') {
        $result = meduk_collect_scalar($rawProps, 'result', 10);
        if (in_array($result, ['accepted', 'dismissed', 'unknown'], true)) {
            $out['result'] = $result;
        }
        return $out;
    }

    if ($name === 'listen') {
        $seconds = meduk_collect_scalar($rawProps, 'sec', 5);
        if (preg_match('~^\d{1,5}$~D', $seconds) === 1 && (int) $seconds >= 5 && (int) $seconds <= 86400) {
            $out['sec'] = (string) (int) $seconds;
        }
    }
    return $out;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    exit;
}

$origin = strtolower(rtrim((string) ($_SERVER['HTTP_ORIGIN'] ?? ''), '/'));
$fetchSite = strtolower((string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''));
if ($origin !== 'https://meduk.ru' || ($fetchSite !== '' && $fetchSite !== 'same-origin')) {
    http_response_code(403);
    exit;
}

$raw = (string) file_get_contents('php://input');
if ($raw === '') {
    http_response_code(204);
    exit;
}
if (strlen($raw) > 16384) {
    http_response_code(413);
    exit;
}

$data = json_decode($raw, true);
if (!is_array($data) || empty($data['events']) || !is_array($data['events'])) {
    http_response_code(204);
    exit;
}

$ua = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');

// Роботов в статистику не пускаем, иначе цифры перестают что-либо значить
if ($ua === '' || preg_match('~bot|crawl|spider|slurp|curl|wget|headless|monitor|uptime~i', $ua)) {
    http_response_code(204);
    exit;
}

// Не создаём rate-state для битого JSON и очевидных роботов.
$limit = meduk_rate_check('collect', strlen($raw));
if (empty($limit['allowed'])) {
    meduk_rate_reject($limit);
}

$cleanup = meduk_cleanup_old_logs(MEDUK_RETENTION_DAYS);
if (empty($cleanup['ok'])) {
    meduk_ops_note('collect', 'retention_fail');
    meduk_rate_reject(meduk_rate_failure(60));
}
$path = meduk_log_path(gmdate('Y-m'));

$visitor = meduk_visitor(meduk_ip(), $ua);
$sid     = substr((string) preg_replace('~[^a-z0-9]~i', '', (string) ($data['sid'] ?? '')), 0, 20);
$device  = preg_match('~Mobi|Android|iPhone|iPad~i', $ua) ? 'm' : 'd';
$now     = time();

$lines = '';
$count = 0;

foreach ($data['events'] as $ev) {
    if ($count >= 25) {
        break; // больше двадцати пяти событий за один раз не принимаем
    }
    if (!is_array($ev)) {
        continue;
    }
    $name = (string) ($ev['n'] ?? '');
    if (!in_array($name, MEDUK_EVENTS, true)) {
        continue; // только заранее известные события
    }

    $props = meduk_collect_props($name, $ev['p'] ?? null);

    $json = json_encode([
        'ts' => $now,
        'v'  => $visitor,
        's'  => $sid,
        'n'  => $name,
        'd'  => $device,
        't'  => min(86400, max(0, (int) ($ev['t'] ?? 0))),
        'p'  => $props,
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);

    if (is_string($json)) {
        $lines .= $json . "\n";
        $count++;
    }
}

if ($lines !== '') {
    if (!meduk_append_event_lines($path, $lines)) {
        meduk_ops_note('collect', 'append_fail');
        meduk_rate_reject(meduk_rate_failure(60));
    }
}

http_response_code(204);
