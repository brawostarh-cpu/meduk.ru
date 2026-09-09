<?php

declare(strict_types=1);

/* Meduk Relax — общая часть счётчика и админки.
   Файл только объявляет константы и функции, сам ничего не выводит.
   Лежит в admin/, но подключается и из collect.php в корне сайта. */

/**
 * Приватная конфигурация владельца.
 *
 * Приоритет: переменные окружения, затем meduk-config.php рядом с public_html.
 * Реальные значения намеренно не хранятся в каталоге сайта и deploy-архивах.
 */
function meduk_private_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    $config = [];
    $site = dirname(__DIR__); // .../public_html
    $configFile = dirname($site) . '/meduk-config.php';

    if (is_readable($configFile)) {
        try {
            $loaded = require $configFile;
            if (is_array($loaded)) {
                $config = $loaded;
            }
        } catch (Throwable $e) {
            // Ошибочная приватная конфигурация не должна раскрывать детали посетителю.
            $config = [];
        }
    }

    return $config;
}

function meduk_private_value(string $envName, string $configKey): string
{
    $fromEnv = getenv($envName);
    if (is_string($fromEnv) && trim($fromEnv) !== '') {
        return trim($fromEnv);
    }

    $config = meduk_private_config();
    return trim((string) ($config[$configKey] ?? ''));
}

function meduk_owner_email(): string
{
    return strtolower(meduk_private_value('MEDUK_OWNER_EMAIL', 'owner_email'));
}

function meduk_setup_token(): string
{
    return meduk_private_value('MEDUK_SETUP_TOKEN', 'setup_token');
}

function meduk_owner_email_ready(): bool
{
    return filter_var(meduk_owner_email(), FILTER_VALIDATE_EMAIL) !== false;
}

function meduk_setup_token_ready(): bool
{
    return strlen(meduk_setup_token()) >= 32;
}
const MEDUK_EVENTS        = ['visit', 'section', 'preset', 'play', 'donate', 'telegram', 'theme', 'install', 'share', 'listen'];
const MEDUK_MAX_LOG_BYTES = 41943040; // 40 МБ, дальше просто перестаём писать
const MEDUK_RETENTION_DAYS = 62;
const MEDUK_RETENTION_INTERVAL = 86400;
const MEDUK_EVENT_FUTURE_SKEW = 300;
const MEDUK_EVENT_MAX_LINE_BYTES = 32768;
const MEDUK_VISITOR_DAY_CAP = 50000;
const MEDUK_ADMIN_SESSION_CAP = 20000;
const MEDUK_ADMIN_DIMENSION_CAP = 2048;
const MEDUK_RATE_MAX_FILE_BYTES = 1572864;
const MEDUK_RATE_MAX_KEYS = 5000;
const MEDUK_ONLINE_MAX_ENTRIES = 1000;
const MEDUK_MAX_FAILS     = 5;
const MEDUK_LOCK_SECONDS  = 900;      // 15 минут отдыха после пяти промахов
const MEDUK_SESSION_LIFE  = 28800;    // 8 часов бездействия — и просим войти заново
const MEDUK_TZ_OFFSET     = 10800;    // Москва, +3: сутки в отчёте должны совпадать со своими

/** Папка с данными. Только вне public_html; иначе сбор и admin прекращают работу. */
function meduk_dir(): string
{
    static $dir = null;
    if ($dir !== null) {
        return $dir;
    }

    $site = realpath(dirname(__DIR__)) ?: dirname(__DIR__); // .../public_html
    $configured = meduk_private_value('MEDUK_DATA_DIR', 'data_dir');
    $candidate = $configured !== '' ? $configured : dirname($site) . '/meduk-data';

    if (!preg_match('~^(?:[A-Za-z]:[\\\\/]|/)~', $candidate)) {
        throw new RuntimeException('Meduk data directory must be an absolute path.');
    }
    if (!is_dir($candidate) && !@mkdir($candidate, 0700, true)) {
        throw new RuntimeException('Meduk data directory is unavailable.');
    }

    $resolved = realpath($candidate);
    if (!is_string($resolved) || !is_writable($resolved)) {
        throw new RuntimeException('Meduk data directory is not writable.');
    }

    $sitePrefix = rtrim(str_replace('\\', '/', $site), '/') . '/';
    $dataPrefix = rtrim(str_replace('\\', '/', $resolved), '/') . '/';
    if (strpos($dataPrefix, $sitePrefix) === 0) {
        throw new RuntimeException('Meduk data directory must stay outside public_html.');
    }

    return $dir = $resolved;
}

/** Секрет для хеширования. Создаётся сам при первом обращении. */
function meduk_salt(): string
{
    static $salt = null;
    if ($salt !== null) {
        return $salt;
    }
    $file = meduk_dir() . '/salt.bin';
    $fh = @fopen($file, 'c+b');
    if (!$fh || !flock($fh, LOCK_EX)) {
        if (is_resource($fh)) {
            fclose($fh);
        }
        throw new RuntimeException('Unable to lock the Meduk analytics salt.');
    }
    try {
        rewind($fh);
        $existing = stream_get_contents($fh);
        if (is_string($existing) && strlen($existing) >= 32) {
            return $salt = $existing;
        }
        $salt = random_bytes(32);
        if (!ftruncate($fh, 0)
            || !rewind($fh)
            || !meduk_write_all($fh, $salt)
            || !fflush($fh)
            || !rewind($fh)
            || stream_get_contents($fh) !== $salt) {
            throw new RuntimeException('Unable to persist the Meduk analytics salt.');
        }
        @chmod($file, 0600);
        return $salt;
    } finally {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}

/** Обезличенная метка посетителя: соль плюс дата, поэтому завтра хеш будет другим.
    Самого IP мы нигде не храним — восстановить человека из журнала нельзя. */
function meduk_visitor(string $ip, string $ua): string
{
    return substr(hash_hmac('sha256', $ip . '|' . $ua . '|' . gmdate('Y-m-d'), meduk_salt()), 0, 16);
}

function meduk_ip(): string
{
    // Только REMOTE_ADDR: заголовки вроде X-Forwarded-For посетитель может подделать
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

function meduk_log_path(string $month): string
{
    if (preg_match('~^\d{4}-(?:0[1-9]|1[0-2])$~D', $month) !== 1) {
        throw new InvalidArgumentException('Invalid Meduk event-log month.');
    }
    return meduk_dir() . '/events-' . $month . '.jsonl';
}

/** Только канонические помесячные журналы; временные и посторонние файлы исключены. */
function meduk_event_files(): array
{
    $files = [];
    foreach (glob(meduk_dir() . '/events-*.jsonl') ?: [] as $file) {
        if (is_file($file) && preg_match('~^events-\d{4}-(?:0[1-9]|1[0-2])\.jsonl$~D', basename($file)) === 1) {
            $files[] = $file;
        }
    }
    sort($files, SORT_STRING);
    return $files;
}

/** Общая advisory-блокировка для append/read/prune/delete журналов. */
function meduk_events_lock(int $operation)
{
    if ($operation !== LOCK_SH && $operation !== LOCK_EX) {
        throw new InvalidArgumentException('Invalid Meduk events-lock operation.');
    }
    $path = meduk_dir() . '/events.lock';
    $fh = @fopen($path, 'c+');
    if (!$fh || !flock($fh, $operation)) {
        if (is_resource($fh)) {
            fclose($fh);
        }
        throw new RuntimeException('Unable to lock the Meduk event store.');
    }
    @chmod($path, 0600);
    return $fh;
}

function meduk_events_unlock($fh): void
{
    if (is_resource($fh)) {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}

/** fwrite() имеет право записать только часть строки, поэтому дописываем до конца. */
function meduk_write_all($fh, string $data): bool
{
    $length = strlen($data);
    $offset = 0;
    while ($offset < $length) {
        $written = @fwrite($fh, substr($data, $offset));
        if (!is_int($written) || $written < 1) {
            return false;
        }
        $offset += $written;
    }
    return true;
}

/** Отдельный lock-файл остаётся стабильным, пока JSON-состояние заменяется rename(). */
function meduk_private_state_lock(string $scope)
{
    if ($scope !== 'rate' && $scope !== 'ops') {
        throw new InvalidArgumentException('Unknown Meduk private-state lock.');
    }
    $path = meduk_dir() . '/' . $scope . '.lock';
    $fh = @fopen($path, 'c+');
    if (!$fh || !flock($fh, LOCK_EX)) {
        if (is_resource($fh)) {
            fclose($fh);
        }
        throw new RuntimeException('Unable to lock Meduk private state.');
    }
    @chmod($path, 0600);
    return $fh;
}

function meduk_private_state_unlock($fh): void
{
    if (is_resource($fh)) {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}

/** Суточный HMAC для защиты от злоупотреблений; сырой IP и User-Agent не сохраняются. */
function meduk_rate_key(string $scope, ?int $now = null): string
{
    if ($scope !== 'collect' && $scope !== 'pulse') {
        throw new InvalidArgumentException('Unknown Meduk rate-limit scope.');
    }
    $now = $now ?? time();
    $message = "rate\0" . $scope . "\0" . meduk_ip() . "\0" . gmdate('Y-m-d', $now);
    return substr(hash_hmac('sha256', $message, meduk_salt()), 0, 32);
}

/** Стартовые квоты рассчитаны на небольшой сайт; после наблюдения их можно повысить. */
function meduk_rate_policy(string $scope): array
{
    if ($scope === 'collect') {
        return [
            'capacity' => 12.0,
            'refill' => 0.2,
            'daily_requests' => 600,
            'daily_bytes' => 1048576,
            'global_capacity' => 120.0,
            'global_refill' => 2.0,
            'global_daily_requests' => 10000,
            'global_daily_bytes' => 4194304,
        ];
    }
    if ($scope === 'pulse') {
        return [
            'capacity' => 8.0,
            'refill' => 0.1,
            'daily_requests' => 1500,
            'daily_bytes' => 0,
            'global_capacity' => 180.0,
            'global_refill' => 3.0,
            'global_daily_requests' => 50000,
            'global_daily_bytes' => 0,
        ];
    }
    throw new InvalidArgumentException('Unknown Meduk rate-limit scope.');
}

function meduk_rate_new_entry(float $capacity, int $now): array
{
    return ['tokens' => $capacity, 'at' => $now, 'requests' => 0, 'bytes' => 0];
}

/** Проверяет сохранённую запись и пополняет token bucket до текущего момента. */
function meduk_rate_refill_entry(array $entry, float $capacity, float $refill, int $now): array
{
    if (!isset($entry['tokens'], $entry['at'], $entry['requests'], $entry['bytes'])
        || !is_numeric($entry['tokens'])
        || !is_int($entry['at'])
        || !is_int($entry['requests'])
        || !is_int($entry['bytes'])
        || $entry['requests'] < 0
        || $entry['bytes'] < 0) {
        throw new UnexpectedValueException('Corrupt Meduk rate-limit entry.');
    }
    $tokens = (float) $entry['tokens'];
    if (!is_finite($tokens) || $tokens < 0) {
        throw new UnexpectedValueException('Corrupt Meduk rate-limit token count.');
    }
    $elapsed = max(0, min(86400, $now - $entry['at']));
    $entry['tokens'] = min($capacity, $tokens + $elapsed * $refill);
    $entry['at'] = $now;
    return $entry;
}

function meduk_rate_seconds_to_utc_day(int $now): int
{
    $insideDay = (($now % 86400) + 86400) % 86400;
    return max(1, 86400 - $insideDay);
}

/** Удаляет только строго именованные служебные файлы старше их короткого срока. */
function meduk_rate_cleanup_files(int $now, string $scope): void
{
    if ($scope !== 'rate' && $scope !== 'ops') {
        throw new InvalidArgumentException('Unknown Meduk cleanup scope.');
    }
    $today = strtotime(gmdate('Y-m-d', $now) . ' 00:00:00 UTC');
    if (!is_int($today)) {
        return;
    }
    foreach ([[$scope, $scope === 'rate' ? 2 : 14]] as $rule) {
        foreach (glob(meduk_dir() . '/' . $rule[0] . '-*.json') ?: [] as $file) {
            $pattern = '~^' . preg_quote($rule[0], '~') . '-(\d{4}-\d{2}-\d{2})\.json$~D';
            if (!is_file($file) || preg_match($pattern, basename($file), $match) !== 1) {
                continue;
            }
            $fileDay = strtotime($match[1] . ' 00:00:00 UTC');
            if (is_int($fileDay) && $fileDay < $today - $rule[1] * 86400) {
                @unlink($file);
            }
        }
    }
}

function meduk_rate_failure(int $retryAfter = 60): array
{
    return ['allowed' => false, 'status' => 503, 'retry_after' => max(1, $retryAfter), 'reason' => 'storage'];
}

/**
 * Token bucket и дневные пределы для одного HMAC и всего endpoint.
 * Решение и обе записи сохраняются под одной эксклюзивной блокировкой.
 */
function meduk_rate_check(string $scope, int $payloadBytes = 0, ?int $now = null): array
{
    $now = $now ?? time();
    $payloadBytes = max(0, $payloadBytes);
    $lock = null;
    $failed = false;
    $result = null;
    $day = '';
    $path = '';

    try {
        $policy = meduk_rate_policy($scope);
        $day = gmdate('Y-m-d', $now);
        $key = meduk_rate_key($scope, $now);
        $path = meduk_dir() . '/rate-' . $day . '.json';
        $lock = meduk_private_state_lock('rate');

        if (!is_file($path)) {
            $state = ['v' => 1, 'day' => $day, 'scopes' => []];
            meduk_rate_cleanup_files($now, 'rate');
        } else {
            clearstatcache(true, $path);
            $size = @filesize($path);
            if (!is_int($size) || $size < 2 || $size > MEDUK_RATE_MAX_FILE_BYTES) {
                throw new UnexpectedValueException('Invalid Meduk rate-limit state size.');
            }
            $raw = @file_get_contents($path);
            if (!is_string($raw)) {
                throw new RuntimeException('Unable to read Meduk rate-limit state.');
            }
            $state = json_decode($raw, true);
            if (!is_array($state)
                || ($state['v'] ?? null) !== 1
                || ($state['day'] ?? null) !== $day
                || !isset($state['scopes'])
                || !is_array($state['scopes'])) {
                throw new UnexpectedValueException('Corrupt Meduk rate-limit state.');
            }
        }

        $scopeState = $state['scopes'][$scope] ?? ['global' => null, 'keys' => [], 'ops' => []];
        if (!is_array($scopeState)
            || !isset($scopeState['keys'], $scopeState['ops'])
            || !is_array($scopeState['keys'])
            || !is_array($scopeState['ops'])) {
            throw new UnexpectedValueException('Corrupt Meduk rate-limit scope.');
        }
        if (count($scopeState['keys']) > MEDUK_RATE_MAX_KEYS) {
            throw new UnexpectedValueException('Meduk rate-limit key cap exceeded.');
        }

        $global = $scopeState['global'] ?? meduk_rate_new_entry($policy['global_capacity'], $now);
        if (!is_array($global)) {
            throw new UnexpectedValueException('Corrupt Meduk global rate-limit entry.');
        }
        $global = meduk_rate_refill_entry($global, $policy['global_capacity'], $policy['global_refill'], $now);

        $hasKey = array_key_exists($key, $scopeState['keys']);
        if (!$hasKey && count($scopeState['keys']) >= MEDUK_RATE_MAX_KEYS) {
            $retryAfter = meduk_rate_seconds_to_utc_day($now);
            $reason = 'key-cap';
            $entry = null;
        } else {
            $entry = $hasKey
                ? $scopeState['keys'][$key]
                : meduk_rate_new_entry($policy['capacity'], $now);
            if (!is_array($entry)) {
                throw new UnexpectedValueException('Corrupt Meduk visitor rate-limit entry.');
            }
            $entry = meduk_rate_refill_entry($entry, $policy['capacity'], $policy['refill'], $now);
            $retryAfter = 0;
            $reason = '';
        }

        $checks = [
            ['ok' => $global['tokens'] >= 1, 'retry' => (int) ceil(max(0, 1 - $global['tokens']) / $policy['global_refill']), 'reason' => 'global-burst'],
            ['ok' => $global['requests'] + 1 <= $policy['global_daily_requests'], 'retry' => meduk_rate_seconds_to_utc_day($now), 'reason' => 'global-day'],
            ['ok' => $policy['global_daily_bytes'] < 1 || $global['bytes'] + $payloadBytes <= $policy['global_daily_bytes'], 'retry' => meduk_rate_seconds_to_utc_day($now), 'reason' => 'global-bytes'],
        ];
        if (is_array($entry)) {
            $checks[] = ['ok' => $entry['tokens'] >= 1, 'retry' => (int) ceil(max(0, 1 - $entry['tokens']) / $policy['refill']), 'reason' => 'visitor-burst'];
            $checks[] = ['ok' => $entry['requests'] + 1 <= $policy['daily_requests'], 'retry' => meduk_rate_seconds_to_utc_day($now), 'reason' => 'visitor-day'];
            $checks[] = ['ok' => $policy['daily_bytes'] < 1 || $entry['bytes'] + $payloadBytes <= $policy['daily_bytes'], 'retry' => meduk_rate_seconds_to_utc_day($now), 'reason' => 'visitor-bytes'];
        }
        foreach ($checks as $check) {
            if (!$check['ok'] && $check['retry'] >= $retryAfter) {
                $retryAfter = max(1, $check['retry']);
                $reason = $check['reason'];
            }
        }

        $allowed = is_array($entry) && $retryAfter === 0;
        if ($allowed) {
            $global['tokens'] -= 1;
            $global['requests']++;
            $global['bytes'] += $payloadBytes;
            $entry['tokens'] -= 1;
            $entry['requests']++;
            $entry['bytes'] += $payloadBytes;
        }
        // Новый visitor-key не сохраняем, если запрос уже отклонён глобальной квотой.
        if (is_array($entry) && ($hasKey || $allowed)) {
            $scopeState['keys'][$key] = $entry;
        }
        $scopeState['global'] = $global;
        $op = $allowed ? 'allowed' : 'limited';
        $scopeState['ops'][$op] = min(PHP_INT_MAX, max(0, (int) ($scopeState['ops'][$op] ?? 0)) + 1);
        $state['scopes'][$scope] = $scopeState;

        $encoded = json_encode($state, JSON_UNESCAPED_SLASHES);
        if (!is_string($encoded) || strlen($encoded) > MEDUK_RATE_MAX_FILE_BYTES) {
            throw new RuntimeException('Meduk rate-limit state is too large.');
        }
        if (!meduk_atomic_event_write($path, $encoded . "\n")) {
            throw new RuntimeException('Unable to persist Meduk rate-limit state.');
        }

        $result = [
            'allowed' => $allowed,
            'status' => $allowed ? 200 : 429,
            'retry_after' => $allowed ? 0 : max(1, $retryAfter),
            'reason' => $allowed ? 'allowed' : $reason,
        ];
    } catch (UnexpectedValueException $e) {
        if (is_resource($lock) && $path !== '' && $day !== '') {
            $clean = json_encode(['v' => 1, 'day' => $day, 'scopes' => []], JSON_UNESCAPED_SLASHES);
            if (is_string($clean)) {
                meduk_atomic_event_write($path, $clean . "\n");
            }
        }
        $failed = true;
    } catch (Throwable $e) {
        $failed = true;
    } finally {
        meduk_private_state_unlock($lock);
    }

    if ($failed || !is_array($result)) {
        meduk_ops_note($scope, 'rate_state_fail', $now);
        return meduk_rate_failure(60);
    }
    return $result;
}

/** Пишет только агрегированный код ошибки, без пользовательских данных. */
function meduk_ops_note(string $scope, string $event, ?int $now = null): bool
{
    $allowed = [
        'collect' => ['rate_state_fail', 'retention_fail', 'append_fail'],
        'pulse' => ['rate_state_fail', 'online_state_fail', 'online_capped', 'cache_state_fail', 'cache_rebuild'],
    ];
    if (!isset($allowed[$scope]) || !in_array($event, $allowed[$scope], true)) {
        return false;
    }
    $now = $now ?? time();
    $day = gmdate('Y-m-d', $now);
    $lock = null;
    try {
        $path = meduk_dir() . '/ops-' . $day . '.json';
        $lock = meduk_private_state_lock('ops');
        if (!is_file($path)) {
            $state = ['v' => 1, 'day' => $day, 'collect' => [], 'pulse' => []];
            meduk_rate_cleanup_files($now, 'ops');
        } else {
            clearstatcache(true, $path);
            $size = @filesize($path);
            $raw = is_int($size) && $size >= 2 && $size <= 65536
                ? @file_get_contents($path)
                : false;
            if (!is_string($raw)) {
                $state = ['v' => 1, 'day' => $day, 'collect' => [], 'pulse' => []];
            } else {
            $state = json_decode($raw, true);
            if (!is_array($state)
                || ($state['v'] ?? null) !== 1
                || ($state['day'] ?? null) !== $day
                || !isset($state['collect'], $state['pulse'])
                || !is_array($state['collect'])
                || !is_array($state['pulse'])) {
                    $state = ['v' => 1, 'day' => $day, 'collect' => [], 'pulse' => []];
                }
            }
        }
        $state[$scope][$event] = min(PHP_INT_MAX, max(0, (int) ($state[$scope][$event] ?? 0)) + 1);
        $encoded = json_encode($state, JSON_UNESCAPED_SLASHES);
        if (!is_string($encoded) || strlen($encoded) > 65536) {
            return false;
        }
        return meduk_atomic_event_write($path, $encoded . "\n");
    } catch (Throwable $e) {
        return false;
    } finally {
        meduk_private_state_unlock($lock);
    }
}

function meduk_rate_reject(array $result): void
{
    $status = (int) ($result['status'] ?? 503);
    if ($status !== 429 && $status !== 503) {
        $status = 503;
    }
    http_response_code($status);
    header('Retry-After: ' . max(1, (int) ($result['retry_after'] ?? 60)));
    header('Cache-Control: no-store');
    exit;
}

/** Временный файл обязан находиться рядом с журналами для атомарного rename(). */
function meduk_event_temp_file(string $prefix): ?string
{
    $dir = meduk_dir();
    $path = @tempnam($dir, $prefix);
    if (!is_string($path)) {
        return null;
    }
    $tempDir = realpath(dirname($path));
    if (!is_string($tempDir) || $tempDir !== $dir) {
        @unlink($path);
        return null;
    }
    @chmod($path, 0600);
    return $path;
}

/** Безопасно добавляет уже подготовленные JSONL-строки в помесячный журнал. */
function meduk_append_event_lines(string $path, string $lines): bool
{
    if ($lines === '') {
        return true;
    }
    if (dirname($path) !== meduk_dir()
        || preg_match('~^events-\d{4}-(?:0[1-9]|1[0-2])\.jsonl$~D', basename($path)) !== 1) {
        return false;
    }

    try {
        $lock = meduk_events_lock(LOCK_EX);
    } catch (Throwable $e) {
        return false;
    }

    $fh = null;
    try {
        clearstatcache(true, $path);
        $size = is_file($path) ? @filesize($path) : 0;
        if (!is_int($size) || $size + strlen($lines) > MEDUK_MAX_LOG_BYTES) {
            return false;
        }

        $fh = @fopen($path, 'c+b');
        if (!$fh || fseek($fh, 0, SEEK_END) !== 0) {
            return false;
        }
        $start = ftell($fh);
        if (!is_int($start)) {
            return false;
        }

        $separator = '';
        if ($start > 0) {
            if (fseek($fh, -1, SEEK_END) !== 0) {
                return false;
            }
            $lastByte = fread($fh, 1);
            if (!is_string($lastByte) || strlen($lastByte) !== 1) {
                return false;
            }
            if ($lastByte !== "\n") {
                $separator = "\n";
            }
            if (fseek($fh, 0, SEEK_END) !== 0) {
                return false;
            }
        }
        if ($start + strlen($separator) + strlen($lines) > MEDUK_MAX_LOG_BYTES) {
            return false;
        }

        $ok = meduk_write_all($fh, $separator . $lines) && fflush($fh);
        if (!$ok) {
            ftruncate($fh, $start);
            fflush($fh);
            return false;
        }
        @chmod($path, 0600);
        return true;
    } finally {
        if (is_resource($fh)) {
            fclose($fh);
        }
        meduk_events_unlock($lock);
    }
}

/** Атомарно заменяет небольшой служебный файл внутри приватного data-dir. */
function meduk_atomic_event_write(string $target, string $data): bool
{
    $temp = meduk_event_temp_file('.state-');
    if ($temp === null) {
        return false;
    }
    $fh = @fopen($temp, 'wb');
    $ok = is_resource($fh) && meduk_write_all($fh, $data) && fflush($fh);
    if (is_resource($fh)) {
        fclose($fh);
    }
    if (!$ok || !@rename($temp, $target)) {
        @unlink($temp);
        return false;
    }
    @chmod($target, 0600);
    return true;
}

/** Возвращает статистику очистки одного файла; исходник не меняется при ошибке. */
function meduk_prune_event_file(string $file, int $cutoff, int $now): array
{
    $result = ['ok' => false, 'kept' => 0, 'dropped' => 0, 'error' => ''];
    $source = @fopen($file, 'rb');
    if (!$source) {
        $result['error'] = 'open-source';
        return $result;
    }
    $temp = meduk_event_temp_file('.retention-');
    if ($temp === null) {
        fclose($source);
        $result['error'] = 'create-temp';
        return $result;
    }
    $target = @fopen($temp, 'wb');
    if (!$target) {
        fclose($source);
        @unlink($temp);
        $result['error'] = 'open-temp';
        return $result;
    }

    $writeOk = true;
    while (($line = fgets($source)) !== false) {
        $event = json_decode($line, true);
        $ts = is_array($event) && isset($event['ts']) && is_int($event['ts']) ? $event['ts'] : 0;
        if ($ts >= $cutoff && $ts <= $now + MEDUK_EVENT_FUTURE_SKEW) {
            if (!meduk_write_all($target, $line)) {
                $writeOk = false;
                break;
            }
            $result['kept']++;
        } else {
            $result['dropped']++;
        }
    }
    $readOk = feof($source);
    $flushOk = $writeOk && fflush($target);
    fclose($source);
    fclose($target);

    if (!$readOk || !$flushOk) {
        @unlink($temp);
        $result['error'] = !$readOk ? 'read-source' : 'write-temp';
        return $result;
    }
    if ($result['dropped'] === 0) {
        @unlink($temp);
        $result['ok'] = true;
        return $result;
    }
    if (!@rename($temp, $file)) {
        @unlink($temp);
        $result['error'] = 'replace-source';
        return $result;
    }
    @chmod($file, 0600);
    $result['ok'] = true;
    return $result;
}

/**
 * Удаляет каждую запись старше точного cutoff по ts.
 * Успех означает, что все канонические журналы обработаны и state сохранён.
 */
function meduk_cleanup_old_logs(
    int $retentionDays = MEDUK_RETENTION_DAYS,
    ?int $now = null,
    bool $force = false
): array {
    $now = $now ?? time();
    $retentionDays = max(1, $retentionDays);
    $cutoff = $now - $retentionDays * 86400;
    $summary = [
        'ok' => false,
        'skipped' => false,
        'files' => 0,
        'kept' => 0,
        'dropped' => 0,
        'errors' => [],
    ];

    try {
        $lock = meduk_events_lock(LOCK_EX);
    } catch (Throwable $e) {
        $summary['errors'][] = 'events-lock';
        return $summary;
    }

    try {
        $stateFile = meduk_dir() . '/retention-state.json';
        $state = json_decode((string) @file_get_contents($stateFile), true);
        $lastSuccess = is_array($state) ? (int) ($state['last_success'] ?? 0) : 0;
        if (!$force
            && $lastSuccess > $now - MEDUK_RETENTION_INTERVAL
            && $lastSuccess <= $now + MEDUK_EVENT_FUTURE_SKEW) {
            $summary['ok'] = true;
            $summary['skipped'] = true;
            return $summary;
        }

        foreach (meduk_event_files() as $file) {
            $summary['files']++;
            $result = meduk_prune_event_file($file, $cutoff, $now);
            $summary['kept'] += (int) $result['kept'];
            $summary['dropped'] += (int) $result['dropped'];
            if (empty($result['ok'])) {
                $summary['errors'][] = basename($file) . ':' . (string) $result['error'];
            }
        }

        if (empty($summary['errors'])) {
            $encoded = json_encode([
                'last_success' => $now,
                'retention_days' => $retentionDays,
                'files' => $summary['files'],
                'kept' => $summary['kept'],
                'dropped' => $summary['dropped'],
            ]);
            if (!is_string($encoded) || !meduk_atomic_event_write($stateFile, $encoded . "\n")) {
                $summary['errors'][] = 'retention-state';
            }
        }
        $summary['ok'] = empty($summary['errors']);
        return $summary;
    } finally {
        meduk_events_unlock($lock);
    }
}

/** Удаление из admin использует тот же lock, что append/read/retention. */
function meduk_delete_event_logs(): bool
{
    try {
        $lock = meduk_events_lock(LOCK_EX);
    } catch (Throwable $e) {
        return false;
    }
    $ok = true;
    try {
        foreach (meduk_event_files() as $file) {
            if (!@unlink($file)) {
                $ok = false;
            }
        }
        $cache = meduk_dir() . '/pulse-month.json';
        if (is_file($cache) && !@unlink($cache)) {
            $ok = false;
        }
        return $ok;
    } finally {
        meduk_events_unlock($lock);
    }
}

/** День по московскому времени — в отчёте так понятнее, чем в UTC. */
function meduk_day(int $ts): string
{
    return gmdate('Y-m-d', $ts + MEDUK_TZ_OFFSET);
}

function meduk_e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/* ================= Владелец и вход ================= */

function meduk_auth_file(): string
{
    return meduk_dir() . '/owner.json';
}

function meduk_auth_load(): ?array
{
    $raw = @file_get_contents(meduk_auth_file());
    if (!is_string($raw) || $raw === '') {
        return null;
    }
    $data = json_decode($raw, true);
    return (is_array($data) && !empty($data['hash'])) ? $data : null;
}

function meduk_auth_save(string $hash): bool
{
    $ok = @file_put_contents(meduk_auth_file(), json_encode(['hash' => $hash, 'created' => time()]), LOCK_EX);
    if ($ok !== false) {
        @chmod(meduk_auth_file(), 0600);
    }
    return $ok !== false;
}

function meduk_attempts_read(): array
{
    $file = meduk_dir() . '/login-attempts.json';
    $fh = @fopen($file, 'c+');
    if (!$fh || !flock($fh, LOCK_SH)) {
        if ($fh) {
            fclose($fh);
        }
        return [];
    }
    $data = json_decode((string) stream_get_contents($fh), true);
    flock($fh, LOCK_UN);
    fclose($fh);
    return is_array($data) ? $data : [];
}

/** Сколько секунд ещё нельзя пробовать войти. 0 — можно. */
function meduk_login_wait(string $key): int
{
    $rec = meduk_attempts_read()[$key] ?? null;
    if (!is_array($rec) || (int) ($rec['fails'] ?? 0) < MEDUK_MAX_FAILS) {
        return 0;
    }
    $left = (int) ($rec['ts'] ?? 0) + MEDUK_LOCK_SECONDS - time();
    return max(0, $left);
}

function meduk_login_note(string $key, bool $ok): void
{
    $file = meduk_dir() . '/login-attempts.json';
    $fh = @fopen($file, 'c+');
    if (!$fh || !flock($fh, LOCK_EX)) {
        if ($fh) {
            fclose($fh);
        }
        return;
    }
    $all = json_decode((string) stream_get_contents($fh), true);
    if (!is_array($all)) {
        $all = [];
    }
    $now = time();

    // Чистим всё старше часа, чтобы файл не рос
    foreach ($all as $k => $rec) {
        if (!is_array($rec) || (int) ($rec['ts'] ?? 0) < $now - 3600) {
            unset($all[$k]);
        }
    }
    if ($ok) {
        unset($all[$key]);
    } else {
        $rec = $all[$key] ?? [];
        $fails = (int) ($rec['fails'] ?? 0);
        // Отсидел своё — счёт начинается заново
        if ($fails >= MEDUK_MAX_FAILS && (int) ($rec['ts'] ?? 0) + MEDUK_LOCK_SECONDS < $now) {
            $fails = 0;
        }
        $all[$key] = ['fails' => $fails + 1, 'ts' => $now];
    }
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, (string) json_encode($all));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    @chmod($file, 0600);
}

function meduk_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    ini_set('session.use_strict_mode', '1');
    session_name('meduk_adm');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/admin',
        'httponly' => true,
        'secure'   => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function meduk_csrf(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    return (string) $_SESSION['csrf'];
}

function meduk_csrf_ok($token): bool
{
    return is_string($token) && !empty($_SESSION['csrf']) && hash_equals((string) $_SESSION['csrf'], $token);
}

/* ================= Потоковое чтение журнала ================= */

/**
 * Читает допустимые события построчно, не накапливая журналы в памяти.
 * Вызывающий код уже обязан удерживать events.lock; false из callback останавливает обход.
 */
function meduk_each_event_locked(int $days, callable $consumer, ?int $now = null): int
{
    $now = $now ?? time();
    $from = $now - max(1, $days) * 86400;
    $count = 0;

    foreach (meduk_event_files() as $file) {
        $fh = @fopen($file, 'rb');
        if (!$fh) {
            throw new RuntimeException('Unable to open a Meduk event log.');
        }
        try {
            while (!feof($fh)) {
                $line = fgets($fh, MEDUK_EVENT_MAX_LINE_BYTES + 1);
                if ($line === false) {
                    break;
                }

                $hasLf = $line !== '' && substr($line, -1) === "\n";
                $oversized = (!$hasLf && !feof($fh))
                    || (!$hasLf && strlen($line) >= MEDUK_EVENT_MAX_LINE_BYTES);
                if ($oversized) {
                    while (!$hasLf && !feof($fh)) {
                        $tail = fgets($fh, MEDUK_EVENT_MAX_LINE_BYTES + 1);
                        if ($tail === false) {
                            break;
                        }
                        $hasLf = $tail !== '' && substr($tail, -1) === "\n";
                    }
                    continue;
                }

                $event = json_decode($line, true);
                $ts = is_array($event) && isset($event['ts']) && is_int($event['ts']) ? $event['ts'] : 0;
                if ($ts < $from || $ts > $now + MEDUK_EVENT_FUTURE_SKEW) {
                    continue;
                }
                $count++;
                if ($consumer($event) === false) {
                    return $count;
                }
            }
            if (!feof($fh)) {
                throw new RuntimeException('Unable to read a Meduk event log.');
            }
        } finally {
            fclose($fh);
        }
    }
    return $count;
}

/** Потоковый обход с общей блокировкой от append/prune/delete. */
function meduk_each_event(int $days, callable $consumer, ?int $now = null): int
{
    $lock = meduk_events_lock(LOCK_SH);
    try {
        return meduk_each_event_locked($days, $consumer, $now);
    } finally {
        meduk_events_unlock($lock);
    }
}

/** Ограниченный счётчик суточных псевдонимов; это visitor-days, а не уникальные люди. */
function meduk_count_visitor_days_locked(int $days, int $cap, ?int $now = null): array
{
    $cap = max(1, min(MEDUK_VISITOR_DAY_CAP, $cap));
    $seen = [];
    $capped = false;
    meduk_each_event_locked($days, static function (array $event) use (&$seen, &$capped, $cap): bool {
        $visitor = (string) ($event['v'] ?? '');
        if ($visitor === '' || isset($seen[$visitor])) {
            return true;
        }
        if (count($seen) >= $cap) {
            $capped = true;
            return false;
        }
        $seen[$visitor] = true;
        return true;
    }, $now);
    return ['count' => count($seen), 'capped' => $capped];
}

/**
 * Минутный кеш visitor-days пересчитывается и записывается под events.lock.
 * Поэтому очистка с LOCK_EX не может завершиться между чтением журналов и записью кеша.
 */
function meduk_cached_visitor_days(int $days = 30, ?int $now = null, int $cap = MEDUK_VISITOR_DAY_CAP): array
{
    $now = $now ?? time();
    $days = max(1, min(MEDUK_RETENTION_DAYS, $days));
    $cap = max(1, min(MEDUK_VISITOR_DAY_CAP, $cap));
    $cacheFile = meduk_dir() . '/pulse-month.json';
    $lock = meduk_events_lock(LOCK_SH);

    try {
        clearstatcache(true, $cacheFile);
        $size = is_file($cacheFile) ? @filesize($cacheFile) : 0;
        $raw = is_int($size) && $size > 1 && $size <= 4096
            ? @file_get_contents($cacheFile)
            : false;
        $cache = is_string($raw) ? json_decode($raw, true) : null;
        $cacheValid = is_array($cache)
            && ($cache['v'] ?? null) === 2
            && ($cache['days'] ?? null) === $days
            && ($cache['cap'] ?? null) === $cap
            && isset($cache['at'], $cache['visitor_days'], $cache['capped'])
            && is_int($cache['at'])
            && is_int($cache['visitor_days'])
            && is_bool($cache['capped'])
            && $cache['visitor_days'] >= 0
            && $cache['visitor_days'] <= $cap
            && $cache['at'] <= $now + MEDUK_EVENT_FUTURE_SKEW;

        if ($cacheValid && $cache['at'] > $now - 60) {
            return [
                'ok' => true,
                'visitor_days' => $cache['visitor_days'],
                'capped' => $cache['capped'],
                'rebuilt' => false,
            ];
        }

        $metric = meduk_count_visitor_days_locked($days, $cap, $now);
        $encoded = json_encode([
            'v' => 2,
            'at' => $now,
            'days' => $days,
            'cap' => $cap,
            'visitor_days' => $metric['count'],
            'capped' => $metric['capped'],
        ], JSON_UNESCAPED_SLASHES);
        $stored = is_string($encoded)
            && meduk_atomic_event_write($cacheFile, $encoded . "\n");
        return [
            'ok' => $stored,
            'visitor_days' => $metric['count'],
            'capped' => $metric['capped'],
            'rebuilt' => true,
        ];
    } finally {
        meduk_events_unlock($lock);
    }
}
