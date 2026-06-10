require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});
let q = fs.readFileSync('public/query/preprocessing.sql', 'utf-8');
q = q.replace(';', '');
pool.query(q + " LIMIT 1").then(res => { console.log(res.rows); pool.end(); }).catch(e => console.error(e));
