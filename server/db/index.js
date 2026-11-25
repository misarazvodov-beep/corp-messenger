const { Pool } = require('pg');

// Настройки берём из файла .env
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Если с базой что-то случилось, увидим это в окне сервера
pool.on('error', (err) => {
  console.error('Ошибка базы данных:', err.message);
});

// Проверка подключения при запуске сервера
async function checkConnection() {
  const result = await pool.query('SELECT NOW() AS now');
  console.log('База данных подключена:', result.rows[0].now);
}

module.exports = { pool, checkConnection };