<?php

// Copy this file to auth-config.php (same folder) and fill in real values.
// auth-config.php is gitignored — never commit real credentials to the repo.
//
// Generate a password hash on the server with:
//   php -r "echo password_hash('your-password-here', PASSWORD_DEFAULT), PHP_EOL;"

return [
    'username' => 'admin',
    'passwordHash' => '$2y$10$REPLACE.WITH.A.REAL.BCRYPT.HASH.FROM.THE.COMMAND.ABOVE',
];
