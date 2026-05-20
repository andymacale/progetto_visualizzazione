require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fs = require('fs');    
const path = require('path'); 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const queryAnalisiStagionale = fs.readFileSync(
    path.join(__dirname, 'public/query/analisi_stagionale.sql'), 
    'utf-8'
);

const queryReparti = fs.readFileSync(
  path.join(__dirname, 'public/query/carica_reparti.sql'), 
    'utf-8'
);
app.get('/api/dati', async (req, res) => {
  try {
    const risultato = await pool.query('SELECT * FROM patients limit 10');
    res.json(risultato.rows); 
  } catch (errore) {
    console.error(errore);
    res.status(500).json({ error: 'Errore nel recupero dei dati' });
  }
});

app.get('/api/reparti', async (req, res) => {
    try {
      const result = await pool.query(queryReparti)
      res.json(result.rows);
    } catch (errore) {
      console.error(errore)
      res.status(500).json({error : 'Errore nel recupero dei dati' })
    }
});

app.get('/api/analisi-stagionale', async (req, res) => {
    const dataInizio = req.query.dataInizio || null;
    const dataFine = req.query.dataFine || null;
    const diagnosi = req.query.diagnosi ? `%${req.query.diagnosi}%` : null;
    const reparto = req.query.reparto || null; 
    
    const page = parseInt(req.query.page) || 0;
    const offset = page * 50; 

    try {
        const result = await pool.query(queryAnalisiStagionale, [
            dataInizio, 
            dataFine, 
            diagnosi,
            reparto,
            offset 
        ]);
        res.json(result.rows);
    } catch (err) {
        console.error("Errore query analisi stagionale:", err);
        res.status(500).json({ error: "Errore interno del database" });
    }
});

app.listen(PORT, () => {
  console.log(`Server in ascolto su http://localhost:${PORT}`);
});