<?php

declare(strict_types=1);

/* Meduk Relax — панель владельца: статистика сайта и смена пароля.
   Ни одной строчки JavaScript и ни одного внешнего файла — только PHP и свои стили. */

require __DIR__ . '/lib.php';

header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store, no-cache, must-revalidate');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");

meduk_session_start();

$auth   = meduk_auth_load();
$method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
$action = (string) ($_POST['action'] ?? '');
$error  = '';
$notice = '';

if (!meduk_owner_email_ready() || ($auth === null && !meduk_setup_token_ready())) {
    http_response_code(503);
    header('Retry-After: 300');
    meduk_render_config_error();
    exit;
}

/* ================= Первый запуск: владелец задаёт пароль сам ================= */

if ($auth === null) {
    if ($method === 'POST' && $action === 'setup' && meduk_csrf_ok($_POST['csrf'] ?? null)) {
        $setupKey = 'setup-' . substr(hash('sha256', meduk_ip()), 0, 16);
        $setupWait = meduk_login_wait($setupKey);
        $email = strtolower(trim((string) ($_POST['email'] ?? '')));
        $token = trim((string) ($_POST['token'] ?? ''));
        $p1    = (string) ($_POST['password'] ?? '');
        $p2    = (string) ($_POST['password2'] ?? '');

        $setupOk = false;
        if ($setupWait > 0) {
            $error = 'Слишком много попыток. Подождите ' . (int) ceil($setupWait / 60) . ' мин.';
        } else {
            if (!hash_equals(meduk_owner_email(), $email)) {
                $error = 'Эта почта не является почтой владельца.';
            } elseif (!hash_equals(meduk_setup_token(), $token)) {
                $error = 'Код установки неверный.';
            } elseif (strlen($p1) < 10) {
                $error = 'Пароль должен быть не короче 10 символов.';
            } elseif ($p1 !== $p2) {
                $error = 'Пароли не совпали.';
            } elseif (!meduk_auth_save(password_hash($p1, PASSWORD_DEFAULT))) {
                $error = 'Не удалось сохранить пароль: у сайта нет прав на запись.';
            } else {
                $auth   = meduk_auth_load();
                $notice = 'Пароль сохранён. Теперь войдите.';
                $setupOk = true;
            }
            meduk_login_note($setupKey, $setupOk);
        }
    }
    if ($auth === null) {
        meduk_render_setup($error, $notice);
        exit;
    }
}

/* ================= Вход и выход ================= */

if ($method === 'POST' && $action === 'logout' && meduk_csrf_ok($_POST['csrf'] ?? null)) {
    $_SESSION = [];
    session_destroy();
    header('Location: index.php');
    exit;
}

if ($method === 'POST' && $action === 'login' && meduk_csrf_ok($_POST['csrf'] ?? null)) {
    $key  = substr(hash('sha256', meduk_ip()), 0, 16);
    $wait = meduk_login_wait($key);

    if ($wait > 0) {
        $error = 'Слишком много попыток. Подождите ' . (int) ceil($wait / 60) . ' мин.';
    } else {
        $email = strtolower(trim((string) ($_POST['email'] ?? '')));
        $ok = hash_equals(meduk_owner_email(), $email)
            && password_verify((string) ($_POST['password'] ?? ''), (string) $auth['hash']);

        meduk_login_note($key, $ok);

        if ($ok) {
            session_regenerate_id(true); // чтобы чужой заранее подсунутый номер сессии стал бесполезен
            $_SESSION['ok'] = true;
            $_SESSION['at'] = time();
            header('Location: index.php');
            exit;
        }
        $error = 'Неверная почта или пароль.';
    }
}

$loggedIn = !empty($_SESSION['ok']);

// Долгое бездействие — просим войти заново
if ($loggedIn && time() - (int) ($_SESSION['at'] ?? 0) > MEDUK_SESSION_LIFE) {
    $_SESSION['ok'] = false;
    $loggedIn = false;
    $notice = 'Вы долго не заходили, войдите заново.';
}

if (!$loggedIn) {
    meduk_render_login($error, $notice);
    exit;
}

$_SESSION['at'] = time();

/* ================= Действия внутри панели ================= */

if ($method === 'POST' && $action === 'password' && meduk_csrf_ok($_POST['csrf'] ?? null)) {
    $old = (string) ($_POST['old'] ?? '');
    $p1  = (string) ($_POST['password'] ?? '');
    $p2  = (string) ($_POST['password2'] ?? '');

    if (!password_verify($old, (string) $auth['hash'])) {
        $error = 'Текущий пароль указан неверно.';
    } elseif (strlen($p1) < 10) {
        $error = 'Новый пароль должен быть не короче 10 символов.';
    } elseif ($p1 !== $p2) {
        $error = 'Новые пароли не совпали.';
    } elseif (!meduk_auth_save(password_hash($p1, PASSWORD_DEFAULT))) {
        $error = 'Не удалось сохранить пароль.';
    } else {
        $auth   = meduk_auth_load();
        $notice = 'Пароль изменён.';
    }
}

if ($method === 'POST' && $action === 'wipe' && meduk_csrf_ok($_POST['csrf'] ?? null)) {
    if (empty($_POST['sure'])) {
        $error = 'Чтобы очистить статистику, отметьте галочку.';
    } elseif (!meduk_delete_event_logs()) {
        $error = 'Не удалось полностью очистить статистику. Повторите попытку позже.';
    } else {
        $notice = 'Статистика очищена.';
    }
}

/* ================= Сводка ================= */

$days = (int) ($_GET['d'] ?? 7);
if (!in_array($days, [1, 7, 30], true)) {
    $days = 7;
}

/** Ограничивает высококардинальные агрегаты, чтобы отчёт не исчерпал память PHP. */
function meduk_bounded_add(array &$map, string $key, int $amount, int $cap, bool &$capped): void
{
    if ($key === '') {
        return;
    }
    if (isset($map[$key])) {
        $map[$key] += $amount;
        return;
    }
    if (count($map) >= $cap) {
        $capped = true;
        return;
    }
    $map[$key] = $amount;
}

// Выгрузка в таблицу: пригодится, чтобы посмотреть цифры в Excel
if (($_GET['export'] ?? '') === 'csv') {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="meduk-' . gmdate('Y-m-d') . '.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF"); // метка, чтобы Excel не испортил русские буквы
    fputcsv($out, ['время', 'событие', 'подробности', 'устройство', 'секунд на сайте']);
    meduk_each_event($days, static function (array $ev) use ($out): bool {
        $p = is_array($ev['p'] ?? null) ? $ev['p'] : [];
        $details = [];
        foreach ($p as $k => $v) {
            $details[] = $k . '=' . $v;
        }
        fputcsv($out, [
            gmdate('Y-m-d H:i', (int) ($ev['ts'] ?? 0) + MEDUK_TZ_OFFSET),
            (string) ($ev['n'] ?? ''),
            implode(' ', $details),
            ((string) ($ev['d'] ?? '')) === 'm' ? 'телефон' : 'компьютер',
            (int) ($ev['t'] ?? 0),
        ]);
        return true;
    });
    fclose($out);
    exit;
}

$visits = 0;
$plays = 0;
$tg = 0;
$visitorDays = [];
$visitorDaysCapped = false;
$aggregateCapped = false;
$byDay = [];
$sections = [];
$presets = [];
$refs = [];
$themes = [];
$donates = [];
$devices = [];
$dwell = [];
$listenTotal = 0;   // сколько всего наслушали, в секундах
$listenBySid = [];  // и сколько пришлось на каждый сеанс
$installs = 0;
$shares = 0;

$totalEvents = meduk_each_event($days, static function (array $ev) use (
    &$visits,
    &$plays,
    &$tg,
    &$visitorDays,
    &$visitorDaysCapped,
    &$aggregateCapped,
    &$byDay,
    &$sections,
    &$presets,
    &$refs,
    &$themes,
    &$donates,
    &$devices,
    &$dwell,
    &$listenTotal,
    &$listenBySid,
    &$installs,
    &$shares
): bool {
    $name  = (string) ($ev['n'] ?? '');
    $props = is_array($ev['p'] ?? null) ? $ev['p'] : [];

    $visitor = (string) ($ev['v'] ?? '');
    if ($visitor !== '' && !isset($visitorDays[$visitor])) {
        if (count($visitorDays) < MEDUK_VISITOR_DAY_CAP) {
            $visitorDays[$visitor] = true;
        } else {
            $visitorDaysCapped = true;
        }
    }

    $sid = (string) ($ev['s'] ?? '');
    if ($sid !== '') {
        if (isset($dwell[$sid])) {
            $dwell[$sid] = max($dwell[$sid], (int) ($ev['t'] ?? 0));
        } elseif (count($dwell) < MEDUK_ADMIN_SESSION_CAP) {
            $dwell[$sid] = max(0, (int) ($ev['t'] ?? 0));
        } else {
            $aggregateCapped = true;
        }
    }

    if ($name === 'visit') {
        $visits++;
        $day = meduk_day((int) ($ev['ts'] ?? 0));
        $byDay[$day] = ($byDay[$day] ?? 0) + 1;

        $dev = (string) ($ev['d'] ?? 'd');
        meduk_bounded_add($devices, $dev, 1, MEDUK_ADMIN_DIMENSION_CAP, $aggregateCapped);

        if (!empty($props['ref'])) {
            meduk_bounded_add($refs, (string) $props['ref'], 1, MEDUK_ADMIN_DIMENSION_CAP, $aggregateCapped);
        }
        if (!empty($props['theme'])) {
            meduk_bounded_add($themes, (string) $props['theme'], 1, MEDUK_ADMIN_DIMENSION_CAP, $aggregateCapped);
        }
    } elseif ($name === 'section' && !empty($props['id'])) {
        meduk_bounded_add($sections, (string) $props['id'], 1, MEDUK_ADMIN_DIMENSION_CAP, $aggregateCapped);
    } elseif ($name === 'preset' && !empty($props['id'])) {
        meduk_bounded_add($presets, (string) $props['id'], 1, MEDUK_ADMIN_DIMENSION_CAP, $aggregateCapped);
    } elseif ($name === 'play') {
        $plays++;
    } elseif ($name === 'telegram') {
        $tg++;
    } elseif ($name === 'donate') {
        $kind = (string) ($props['kind'] ?? '—');
        meduk_bounded_add($donates, $kind, 1, MEDUK_ADMIN_DIMENSION_CAP, $aggregateCapped);
    } elseif ($name === 'listen') {
        // Сайт присылает отрезки прослушивания: складываем их за сеанс и в общий счёт
        $sec = (int) ($props['sec'] ?? 0);
        if ($sec > 0 && $sec <= 86400) {
            $listenTotal += $sec;
            if ($sid !== '') {
                if (isset($listenBySid[$sid])) {
                    $listenBySid[$sid] += $sec;
                } elseif (count($listenBySid) < MEDUK_ADMIN_SESSION_CAP) {
                    $listenBySid[$sid] = $sec;
                } else {
                    $aggregateCapped = true;
                }
            }
        }
    } elseif ($name === 'install') {
        if ((string) ($props['result'] ?? '') === 'accepted') {
            $installs++;
        }
    } elseif ($name === 'share') {
        $shares++;
    }
    return true;
});

$avgDwell = $dwell ? (int) round(array_sum($dwell) / count($dwell)) : 0;
$avgListen = $listenBySid ? (int) round(array_sum($listenBySid) / count($listenBySid)) : 0;

// График всегда хотя бы за неделю, иначе одинокий столбик выглядит странно
$chart = [];
for ($i = max(7, $days) - 1; $i >= 0; $i--) {
    $d = meduk_day(time() - $i * 86400);
    $chart[$d] = $byDay[$d] ?? 0;
}

meduk_render_dashboard([
    'days'     => $days,
    'error'    => $error,
    'notice'   => $notice,
    'visits'   => $visits,
    'visitor_days' => count($visitorDays),
    'visitor_days_capped' => $visitorDaysCapped,
    'bounded'  => $aggregateCapped || $visitorDaysCapped,
    'plays'    => $plays,
    'tg'       => $tg,
    'donates'  => $donates,
    'avg'      => $avgDwell,
    'listen'   => $listenTotal,
    'avglisten' => $avgListen,
    'installs' => $installs,
    'shares'   => $shares,
    'chart'    => $chart,
    'sections' => $sections,
    'presets'  => $presets,
    'refs'     => $refs,
    'themes'   => $themes,
    'devices'  => $devices,
    'total'    => $totalEvents,
]);

/* ================= Отрисовка ================= */

function meduk_head(string $title): void
{
    ?><!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?= meduk_e($title) ?></title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px 20px 60px;
    background: #0b0a08; color: #ece5d6;
    font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .wrap { max-width: 980px; margin: 0 auto; }
  h1 { font-size: 21px; margin: 0; letter-spacing: -0.01em; }
  h2 { font-size: 14px; margin: 0 0 12px; color: #a99c80; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
  a { color: #e0b45f; }
  .bar-top { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 6px; }
  .sub { color: #8d8266; font-size: 13px; margin: 0 0 26px; }
  .card { background: #131109; border: 1px solid rgba(224,180,95,0.16); border-radius: 14px; padding: 18px 20px; margin-bottom: 18px; }
  .msg { padding: 11px 15px; border-radius: 10px; margin-bottom: 16px; font-size: 14px; }
  .msg.err { background: rgba(190,80,70,0.14); border: 1px solid rgba(190,80,70,0.45); color: #f0b3ab; }
  .msg.ok  { background: rgba(120,170,120,0.13); border: 1px solid rgba(120,170,120,0.42); color: #b6dbb2; }
  label { display: block; font-size: 13px; color: #a99c80; margin: 14px 0 5px; }
  input[type=email], input[type=password], input[type=text] {
    width: 100%; padding: 11px 13px; border-radius: 9px;
    border: 1px solid rgba(224,180,95,0.26); background: rgba(255,255,255,0.04);
    color: #ece5d6; font: inherit;
  }
  input:focus { outline: 2px solid #e0b45f; outline-offset: 1px; }
  button {
    margin-top: 18px; padding: 11px 20px; border: 0; border-radius: 9px;
    background: linear-gradient(180deg, #e6bf72, #cb9a3d); color: #241b08;
    font: inherit; font-weight: 700; cursor: pointer;
  }
  button.ghost { background: none; border: 1px solid rgba(224,180,95,0.3); color: #ddd0b4; font-weight: 500; }
  button:hover { filter: brightness(1.07); }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 18px; }
  .kpi { background: #131109; border: 1px solid rgba(224,180,95,0.16); border-radius: 14px; padding: 15px 17px; }
  .kpi b { display: block; font-size: 27px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .kpi span { font-size: 12.5px; color: #948872; }
  .tabs { display: flex; gap: 8px; }
  .tabs a { padding: 7px 14px; border-radius: 999px; font-size: 13px; text-decoration: none; border: 1px solid rgba(224,180,95,0.26); color: #bdb096; }
  .tabs a.on { background: rgba(224,180,95,0.16); color: #f2dcae; border-color: rgba(224,180,95,0.55); }
  .chart { display: flex; align-items: flex-end; gap: 5px; height: 150px; margin-top: 6px; }
  .chart div { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 5px; min-width: 0; }
  .chart span { display: block; width: 100%; border-radius: 4px 4px 0 0; background: linear-gradient(180deg, #e0b45f, #8a6a2a); min-height: 2px; }
  .chart b { font-size: 11px; color: #cbbfa2; font-variant-numeric: tabular-nums; }
  .chart i { font-size: 10px; color: #7d735d; font-style: normal; white-space: nowrap; }
  .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px; }
  .rows { display: flex; flex-direction: column; gap: 9px; }
  .row { position: relative; display: flex; justify-content: space-between; gap: 12px; padding: 8px 11px; border-radius: 8px; background: rgba(255,255,255,0.035); font-size: 14px; overflow: hidden; }
  .row i { position: absolute; inset: 0 auto 0 0; background: rgba(224,180,95,0.13); border-radius: 8px; }
  .row span, .row b { position: relative; }
  .row b { color: #8d8266; font-weight: 500; font-variant-numeric: tabular-nums; }
  .empty { color: #7d735d; font-size: 13.5px; margin: 0; }
  .foot { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
  .note { color: #7d735d; font-size: 12.5px; line-height: 1.5; }
  .chk { display: flex; align-items: center; gap: 8px; margin-top: 14px; font-size: 13.5px; color: #a99c80; }
  .chk input { width: auto; }
</style>
</head>
<body><div class="wrap">
<?php
}

function meduk_foot(): void
{
    echo "</div></body></html>";
}

function meduk_msgs(string $error, string $notice): void
{
    if ($error !== '') {
        echo '<p class="msg err">' . meduk_e($error) . '</p>';
    }
    if ($notice !== '') {
        echo '<p class="msg ok">' . meduk_e($notice) . '</p>';
    }
}

function meduk_render_config_error(): void
{
    meduk_head('Meduk Relax — панель недоступна');
    ?>
    <div class="card">
      <h1>Панель владельца временно недоступна</h1>
      <p class="sub">Основной сайт продолжает работать. Настройка панели выполняется отдельно.</p>
    </div>
    <?php
    meduk_foot();
}

function meduk_render_setup(string $error, string $notice): void
{
    meduk_head('Meduk Relax — первый запуск');
    $csrf = meduk_csrf();
    ?>
    <h1>Первый запуск панели</h1>
    <p class="sub">Задайте свой пароль. Больше эта страница не откроется.</p>
    <?php meduk_msgs($error, $notice); ?>
    <form class="card" method="post" autocomplete="off">
      <input type="hidden" name="action" value="setup">
      <input type="hidden" name="csrf" value="<?= meduk_e($csrf) ?>">
      <label for="email">Почта владельца</label>
      <input id="email" type="email" name="email" required autocomplete="username" placeholder="owner@example.com">
      <label for="token">Код установки</label>
      <input id="token" type="text" name="token" required autocomplete="off">
      <label for="password">Новый пароль (от 10 символов)</label>
      <input id="password" type="password" name="password" required minlength="10" autocomplete="new-password">
      <label for="password2">Повторите пароль</label>
      <input id="password2" type="password" name="password2" required minlength="10" autocomplete="new-password">
      <button type="submit">Сохранить пароль</button>
      <p class="note" style="margin-top:16px">Пароль хранится только в виде необратимого отпечатка — прочитать его не может никто, включая разработчика.</p>
    </form>
    <?php
    meduk_foot();
}

function meduk_render_login(string $error, string $notice): void
{
    meduk_head('Meduk Relax — вход');
    $csrf = meduk_csrf();
    ?>
    <h1>Meduk Relax</h1>
    <p class="sub">Панель владельца</p>
    <?php meduk_msgs($error, $notice); ?>
    <form class="card" method="post">
      <input type="hidden" name="action" value="login">
      <input type="hidden" name="csrf" value="<?= meduk_e($csrf) ?>">
      <label for="email">Почта</label>
      <input id="email" type="email" name="email" required autocomplete="username">
      <label for="password">Пароль</label>
      <input id="password" type="password" name="password" required autocomplete="current-password">
      <button type="submit">Войти</button>
    </form>
    <p class="note">После пяти неудачных попыток вход закрывается на 15 минут.</p>
    <?php
    meduk_foot();
}

/** Список со шкалами: наглядно показывает долю без единой картинки. */
function meduk_rows(array $data, array $names = [], int $limit = 8): void
{
    if (!$data) {
        echo '<p class="empty">Пока пусто.</p>';
        return;
    }
    arsort($data);
    $max = max($data);
    echo '<div class="rows">';
    foreach (array_slice($data, 0, $limit, true) as $key => $n) {
        $label = $names[$key] ?? $key;
        $w = $max > 0 ? (int) round($n / $max * 100) : 0;
        echo '<div class="row"><i style="width:' . $w . '%"></i>'
            . '<span>' . meduk_e((string) $label) . '</span>'
            . '<b>' . (int) $n . '</b></div>';
    }
    echo '</div>';
}

/* Секунды в человеческий вид: «2 ч 15 мин» читается лучше, чем 8100 */
function meduk_dur(int $sec): string
{
    if ($sec >= 3600) {
        return intdiv($sec, 3600) . ' ч ' . intdiv($sec % 3600, 60) . ' мин';
    }
    if ($sec >= 60) {
        return intdiv($sec, 60) . ' мин';
    }
    return $sec . ' с';
}

function meduk_render_dashboard(array $d): void
{
    $sectionNames = [
        'player' => 'Звук', 'presets' => 'Состояния', 'mixer' => 'Студия', 'focus' => 'Фокус',
        'breath' => 'Дыхание', 'science' => 'Наука', 'support' => 'Поддержать',
    ];
    $themeNames  = ['light' => 'Свет', 'paper' => 'Бумага', 'gold' => 'Полночь'];
    $deviceNames = ['m' => 'Телефон', 'd' => 'Компьютер'];
    $donateNames = ['sbor' => 'Сбор банка', 'cloudtips' => 'CloudTips'];

    meduk_head('Meduk Relax — статистика');
    $csrf = meduk_csrf();
    $days = (int) $d['days'];
    ?>
    <div class="bar-top">
      <h1>Статистика Meduk Relax</h1>
      <div class="tabs">
        <a href="?d=1"  class="<?= $days === 1 ? 'on' : '' ?>">Сутки</a>
        <a href="?d=7"  class="<?= $days === 7 ? 'on' : '' ?>">Неделя</a>
        <a href="?d=30" class="<?= $days === 30 ? 'on' : '' ?>">Месяц</a>
      </div>
    </div>
    <p class="sub"><a href="../">Открыть сайт</a> · <a href="?d=<?= $days ?>&amp;export=csv">Выгрузить в таблицу</a> · всего событий за период: <?= (int) $d['total'] ?></p>

    <?php if (!empty($d['bounded'])): ?>
      <p class="note">Объём данных достиг защитного лимита памяти: высококардинальные показатели показаны как нижняя граница.</p>
    <?php endif; ?>

    <?php meduk_msgs((string) $d['error'], (string) $d['notice']); ?>

    <div class="kpis">
      <div class="kpi"><b><?= (int) $d['visits'] ?></b><span>заходов</span></div>
      <div class="kpi"><b><?= (int) $d['visitor_days'] ?><?= !empty($d['visitor_days_capped']) ? '+' : '' ?></b><span>активных посетитель-дней</span></div>
      <div class="kpi"><b><?= (int) $d['plays'] ?></b><span>включений звука</span></div>
      <div class="kpi"><b><?= (int) $d['tg'] ?></b><span>переходов в Telegram</span></div>
      <div class="kpi"><b><?= array_sum($d['donates']) ?></b><span>нажатий «поддержать»</span></div>
      <div class="kpi"><b><?= (int) floor($d['avg'] / 60) ?>:<?= str_pad((string) ($d['avg'] % 60), 2, '0', STR_PAD_LEFT) ?></b><span>среднее время на сайте</span></div>
      <div class="kpi"><b><?= htmlspecialchars(meduk_dur((int) ($d['listen'] ?? 0)), ENT_QUOTES, 'UTF-8') ?></b><span>наслушали всего</span></div>
      <div class="kpi"><b><?= htmlspecialchars(meduk_dur((int) ($d['avglisten'] ?? 0)), ENT_QUOTES, 'UTF-8') ?></b><span>слушают за один заход</span></div>
      <div class="kpi"><b><?= (int) ($d['installs'] ?? 0) ?></b><span>поставили как приложение</span></div>
      <div class="kpi"><b><?= (int) ($d['shares'] ?? 0) ?></b><span>поделились миксом</span></div>
    </div>

    <div class="card">
      <h2>Заходы по дням</h2>
      <div class="chart">
        <?php
        $maxDay = max(1, max($d['chart']));
        foreach ($d['chart'] as $day => $n) {
            $h = (int) round($n / $maxDay * 100);
            echo '<div><b>' . (int) $n . '</b><span style="height:' . max(2, $h) . '%"></span>'
                . '<i>' . meduk_e(substr($day, 8, 2) . '.' . substr($day, 5, 2)) . '</i></div>';
        }
        ?>
      </div>
    </div>

    <div class="grid2">
      <div class="card"><h2>Какие разделы смотрят</h2><?php meduk_rows($d['sections'], $sectionNames); ?></div>
      <div class="card"><h2>Какие состояния включают</h2><?php meduk_rows($d['presets']); ?></div>
      <div class="card"><h2>Откуда приходят</h2><?php meduk_rows($d['refs']); ?></div>
      <div class="card"><h2>С чего заходят</h2><?php meduk_rows($d['devices'], $deviceNames); ?></div>
      <div class="card"><h2>Какая тема выпала</h2><?php meduk_rows($d['themes'], $themeNames); ?></div>
      <div class="card"><h2>Кнопки поддержки</h2><?php meduk_rows($d['donates'], $donateNames); ?></div>
    </div>

    <div class="card">
      <h2>Смена пароля</h2>
      <form method="post" autocomplete="off">
        <input type="hidden" name="action" value="password">
        <input type="hidden" name="csrf" value="<?= meduk_e($csrf) ?>">
        <label for="old">Текущий пароль</label>
        <input id="old" type="password" name="old" required autocomplete="current-password">
        <label for="np">Новый пароль (от 10 символов)</label>
        <input id="np" type="password" name="password" required minlength="10" autocomplete="new-password">
        <label for="np2">Повторите новый</label>
        <input id="np2" type="password" name="password2" required minlength="10" autocomplete="new-password">
        <button type="submit">Сменить пароль</button>
      </form>
    </div>

    <div class="card">
      <h2>Очистка</h2>
      <form method="post">
        <input type="hidden" name="action" value="wipe">
        <input type="hidden" name="csrf" value="<?= meduk_e($csrf) ?>">
        <p class="note">Удалит весь журнал событий без возможности восстановить. Пароль и настройки останутся.</p>
        <label class="chk"><input type="checkbox" name="sure" value="1"> Да, стереть всю статистику</label>
        <button class="ghost" type="submit">Очистить статистику</button>
      </form>
    </div>

    <div class="card">
      <h2>О приватности</h2>
      <p class="note">
        Счётчик свой, сторонних сервисов и рекламы нет. IP-адреса не сохраняются: вместо них
        записывается односторонний отпечаток, который меняется каждые сутки — поэтому видно число
        активных посетитель-дней и действия, но не <em>кто именно</em>. Один человек в разные дни
        учитывается повторно. Куки аналитики не ставятся; выбор посетителя хранится только
        в localStorage его браузера и может быть отозван в разделе «Приватность».
      </p>
      <form method="post" class="foot">
        <input type="hidden" name="action" value="logout">
        <input type="hidden" name="csrf" value="<?= meduk_e($csrf) ?>">
        <button class="ghost" type="submit">Выйти</button>
      </form>
    </div>
    <?php
    meduk_foot();
}
