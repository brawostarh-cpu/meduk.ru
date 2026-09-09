<?php

declare(strict_types=1);

// Команда предназначена только для cron/CLI. Через HTTP она ничего не раскрывает.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/lib.php';

try {
    $result = meduk_cleanup_old_logs(MEDUK_RETENTION_DAYS, time(), true);
} catch (Throwable $e) {
    fwrite(STDERR, "MEDUK retention failed.\n");
    exit(1);
}

if (empty($result['ok'])) {
    $errors = is_array($result['errors'] ?? null) ? count($result['errors']) : 1;
    fwrite(STDERR, 'MEDUK retention failed; errors=' . $errors . ".\n");
    exit(1);
}

fwrite(
    STDOUT,
    'MEDUK retention ok; files=' . (int) $result['files']
    . '; kept=' . (int) $result['kept']
    . '; dropped=' . (int) $result['dropped'] . ".\n"
);
exit(0);
