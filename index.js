require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fs = require('fs');    
const path = require('path'); 
const { Worker } = require('worker_threads');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurazione percorso file temporaneo e tempo di aggiornamento (es. ogni 5 minuti)
const CACHE_FILE = path.join(__dirname, 'public', 'temp', 'temp_analisi_stagionale.json');
const MINUTI_AGGIORNAMENTO = 5; 

// --- SETUP WORKER THREAD ---
const worker = new Worker(path.join(__dirname, 'worker', 'worker.js'));
let isWorkerReady = false;
let nextReqId = 1;
const pendingRequests = new Map();

worker.on('message', (msg) => {
    if (msg.type === 'READY') {
        isWorkerReady = true;
    } else if (msg.type === 'QUERY_RESULT') {
        const { reqId, result, error } = msg;
        if (pendingRequests.has(reqId)) {
            const { resolve, reject } = pendingRequests.get(reqId);
            pendingRequests.delete(reqId);
            if (error) reject(new Error(error));
            else resolve(result);
        }
    }
});
worker.on('error', err => console.error("Worker error:", err));
worker.on('exit', code => {
    if (code !== 0) console.error(new Error(`Worker stopped with exit code ${code}`));
});

// Impostiamo a false e attendiamo il messaggio READY dal worker
isWorkerReady = false;

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

const queryReparti = fs.readFileSync(
  path.join(__dirname, 'public/query/carica_reparti.sql'), 
    'utf-8'
);

// --- FUNZIONI DI PREPROCESSING OFFLINE ---

// Funzione globale per estrarre i dati pre-aggregati dal database
async function generaPreprocessingOffline() {
    console.log(`[${new Date().toLocaleTimeString()}] Avvio del preprocessing offline dal DB...`);
    try {
        const queryGlobal = fs.readFileSync(
            path.join(__dirname, 'public/query/preprocessing.sql'), 
            'utf-8'
        );

        const risultato = await pool.query(queryGlobal);
        
        // Scrittura sincrona del file temporaneo JSON come richiesto
        fs.writeFileSync(CACHE_FILE, JSON.stringify(risultato.rows, null, 2), 'utf-8');
        
        // Passiamo al Worker Thread solo il percorso del JSON
        // Il worker leggerà fisicamente dal .json ed eseguirà lì i filtri
        isWorkerReady = false;
        worker.postMessage({
            type: 'SET_CACHE',
            payload: { cacheFile: CACHE_FILE }
        });
        
        console.log(`[${new Date().toLocaleTimeString()}] Preprocessing completato! File salvato in: ${CACHE_FILE} e caricato nel worker.`);
    } catch (errore) {
        console.error("Errore critico durante il preprocessing offline:", errore);
    }
}

// Funzione di pulizia del file temporaneo alla chiusura del server
function cancellaFileTemporaneo() {
    if (fs.existsSync(CACHE_FILE)) {
        try {
            fs.unlinkSync(CACHE_FILE);
            console.log('\n[Server Shutdown] File JSON temporaneo rimosso con successo.');
        } catch (err) {
            console.error('Errore durante la rimozione del file temporaneo:', err);
        }
    }
}

// --- ENDPOINT API ---

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

// Endpoint modificato: delega il calcolo pesante al Worker Thread
app.get('/api/analisi-stagionale', async (req, res) => {
    if (!isWorkerReady) {
        return res.status(503).json({ error: "La cache è in fase di generazione nel worker, riprova tra qualche istante." });
    }

    try {
        const dataInizio = req.query.dataInizio ? parseInt(req.query.dataInizio) : null;
        const dataFine = req.query.dataFine ? parseInt(req.query.dataFine) : null;
        
        let diagnosiFiltro = req.query.diagnosi || null;
        if (diagnosiFiltro && !Array.isArray(diagnosiFiltro)) diagnosiFiltro = [diagnosiFiltro];
        
        let repartoFiltro = req.query.reparto || null;
        if (repartoFiltro && !Array.isArray(repartoFiltro)) repartoFiltro = [repartoFiltro];

        const reqId = nextReqId++;
        
        const workerPromise = new Promise((resolve, reject) => {
            pendingRequests.set(reqId, { resolve, reject });
        });

        worker.postMessage({
            type: 'QUERY',
            payload: { reqId, dataInizio, dataFine, diagnosiFiltro, repartoFiltro }
        });

        const risultato = await workerPromise;
        res.json(risultato);

    } catch (err) {
        console.error("Errore durante la lettura o il filtraggio tramite worker:", err);
        res.status(500).json({ error: "Errore interno durante l'elaborazione dei filtri" });
    }
});

// --- GESTIONE LIFECYCLE E AVVIO SERVER ---

// Cattura l'uscita del processo (Ctrl+C, crash, stop del terminale) per pulire il file JSON
process.on('SIGINT', () => { cancellaFileTemporaneo(); process.exit(0); });
process.on('SIGTERM', () => { cancellaFileTemporaneo(); process.exit(0); });
process.on('exit', () => { cancellaFileTemporaneo(); });

(async () => {
  // Esegue il preprocessing prima di avviare il server, in modo che sia pronto
  await generaPreprocessingOffline();

  app.listen(PORT, () => {
    console.log(`Server in ascolto su http://localhost:${PORT}`);
    
    // Configura l'aggiornamento automatico ogni TOT minuti
    setInterval(async () => {
        await generaPreprocessingOffline();
    }, MINUTI_AGGIORNAMENTO * 60 * 1000);
  });
})();