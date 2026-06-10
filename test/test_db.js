require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});
pool.query('SELECT * FROM mv_analisi_stagionale LIMIT 1').then(res => { console.log(res.rows); pool.end(); }).catch(e => console.error(e));
