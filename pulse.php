<?php

declare(strict_types=1);

/* Meduk Relax — живые цифры для сайта: сколько человек здесь сейчас и сколько visitor-days за 30 дней.
   Присутствие держим отдельным маленьким файлом, а не в журнале событий: журнал от этого не пухнет.
   Как и везде, вместо IP — суточный обезличенный отпечаток. */

require __DIR__ . '/admin/lib.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

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

$limit = meduk_rate_check('pulse');
if (empty($limit['allowed'])) {
    meduk_rate_reject($limit);
}

const MEDUK_ONLINE_WINDOW = 300; // пять минут без запроса — и человек больше не «на сайте»

$now = time();
$ua = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
$isBot = $ua === '' || preg_match('~bot|crawl|spider|slurp|curl|wget|headless|monitor|uptime~i', $ua);

/* ================= Кто сейчас на сайте ================= */

$online = 0;
$fh = @fopen(meduk_dir() . '/online.json', 'c+');
$onlineStateOk = false;
$onlineStateIssue = false;
$onlineCapped = false;
$rawSeen = '';

if ($fh) {
    if (flock($fh, LOCK_EX)) {
        $stat = fstat($fh);
        $size = is_array($stat) ? (int) ($stat['size'] ?? -1) : -1;
        if ($size < 0 || $size > 262144 || !rewind($fh)) {
            $seen = [];
            $onlineStateIssue = true;
        } else {
            $rawSeen = stream_get_contents($fh);
            $seen = is_string($rawSeen) ? json_decode($rawSeen, true) : null;
        }
        if (!is_array($seen)) {
            $seen = [];
            $onlineStateIssue = true;
        }

        // Убираем тех, кого не было последние пять минут
        foreach ($seen as $key => $ts) {
            if (!is_int($ts) || $ts < $now - MEDUK_ONLINE_WINDOW) {
                unset($seen[$key]);
            }
        }
        if (!$isBot) {
            $seen[meduk_visitor(meduk_ip(), $ua)] = $now;
        }
        if (count($seen) > MEDUK_ONLINE_MAX_ENTRIES) {
            asort($seen, SORT_NUMERIC);
            while (count($seen) > MEDUK_ONLINE_MAX_ENTRIES) {
                array_shift($seen);
            }
            $onlineCapped = true;
        }
        $online = count($seen);

        $encodedSeen = json_encode($seen);
        $onlineStateOk = is_string($encodedSeen)
            && ftruncate($fh, 0)
            && rewind($fh)
            && meduk_write_all($fh, $encodedSeen . "\n")
            && fflush($fh);
        if (!$onlineStateOk) {
            @ftruncate($fh, 0);
            @rewind($fh);
            if ($rawSeen !== '') {
                meduk_write_all($fh, $rawSeen);
                @fflush($fh);
            }
        } else {
            @chmod(meduk_dir() . '/online.json', 0600);
        }
        flock($fh, LOCK_UN);
    }
    fclose($fh);
}
if (!$onlineStateOk || $onlineStateIssue) {
    meduk_ops_note('pulse', 'online_state_fail');
}
if ($onlineCapped) {
    meduk_ops_note('pulse', 'online_capped');
}

/* ================= Активные посетитель-дни за 30 дней ================= */
/* Суточный псевдоним меняется каждый день: это не число уникальных людей за месяц. */

$visitorDays = 0;
$visitorDaysCapped = false;
try {
    $metric = meduk_cached_visitor_days(30, $now, MEDUK_VISITOR_DAY_CAP);
    $visitorDays = max(0, (int) ($metric['visitor_days'] ?? 0));
    $visitorDaysCapped = !empty($metric['capped']);
    if (empty($metric['ok'])) {
        meduk_ops_note('pulse', 'cache_state_fail');
    } elseif (!empty($metric['rebuilt'])) {
        meduk_ops_note('pulse', 'cache_rebuild');
    }
} catch (Throwable $e) {
    meduk_ops_note('pulse', 'cache_state_fail');
}

echo json_encode([
    'online' => $online,
    'visitorDays' => $visitorDays,
    'visitorDaysCapped' => $visitorDaysCapped,
    'windowDays' => 30,
    'month' => $visitorDays, // временный совместимый alias для старого клиента
]);
