// Carica le variabili dal file .env (va messo in cima a tutto)
require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const app = express();

// Usa la porta del file .env o la 3000 come fallback
const PORT = process.env.PORT || 3000;

// Configura la connessione usando le variabili d'ambiente
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

app.use(express.static('public'));

app.get('/api/dati', async (req, res) => {
  try {
    const risultato = await pool.query('SELECT * FROM patients limit 10');
    res.json(risultato.rows); 
  } catch (errore) {
    console.error(errore);
    res.status(500).json({ error: 'Errore nel recupero dei dati' });
  }
});

app.listen(PORT, () => {
  console.log(`Server in ascolto su http://localhost:${PORT}`);
});
