const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Worker } = require('worker_threads');

const app = express();
const PORT = 8090;

const CACHE_FILE = path.join(__dirname, 'public', 'temp', 'temp_analisi_stagionale.json');
const DIAGNOSI_FILE = path.join(__dirname, 'public', 'temp', 'diagnosi.json');
const CSV_DATASET = path.join(__dirname, 'public', 'data', 'dataset.csv');
const CSV_REPARTI = path.join(__dirname, 'public', 'data', 'reparti.csv');

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

isWorkerReady = false;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let diagnosiList = null;

const repartiList = fs.readFileSync(CSV_REPARTI, 'utf-8')
    .split('\n')
    .slice(1)
    .map(l => l.trim().replace(/^"|"$/g, ''))
    .filter(l => l.length > 0)
    .map(r => ({ reparto: r }));


function parseCSVLine(line) {
    const fields = [];
    let i = 0;
    let current = '';
    let inQuote = false;

    while (i < line.length) {
        const ch = line[i];
        if (inQuote) {
            if (ch === '"') {
                if (line[i + 1] === '"') { current += '"'; i += 2; }
                else { inQuote = false; i++; }
            } else { current += ch; i++; }
        } else {
            if (ch === '"') { inQuote = true; i++; }
            else if (ch === ',') { fields.push(current); current = ''; i++; }
            else if (ch === '\r') { i++; }
            else { current += ch; i++; }
        }
    }
    fields.push(current);
    return fields;
}

function parsePgArray(str) {
    if (!str || str.trim() === '' || str.toUpperCase() === 'NULL' || str === '{}') return [];
    const inner = str.slice(1, -1).trim();
    if (!inner) return [];

    const results = [];
    let i = 0;

    while (i < inner.length) {
        if (inner[i] === '"') {
            i++;
            let val = '';
            while (i < inner.length) {
                if (inner[i] === '"' && inner[i + 1] === '"') { val += '"'; i += 2; }
                else if (inner[i] === '"') { i++; break; }
                else { val += inner[i]; i++; }
            }
            results.push(val);
        } else {
            let j = i;
            while (j < inner.length && inner[j] !== ',') j++;
            const val = inner.slice(i, j).trim();
            if (val) results.push(val);
            i = j;
        }
        if (i < inner.length && inner[i] === ',') i++;
    }

    return results;
}

function giorniMese(anno, mese) {
    return new Date(Date.UTC(anno, mese, 0)).getUTCDate();
}

function dataAdGiornoEpoch(dateStr) {
    const datePart = dateStr.split(' ')[0].trim();
    const [y, m, d] = datePart.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}


function aggiungiPeriodo(monthlyBuckets, reparto, in_g, out_g, diagnosi, globalMaxGiorno) {
    const ultimoGiorno = out_g !== null ? out_g - 1 : globalMaxGiorno;

    if (ultimoGiorno < in_g) {
        const startDate = new Date(in_g * 86400000);
        const anno = startDate.getUTCFullYear();
        const mese = startDate.getUTCMonth() + 1;
        const D = giorniMese(anno, mese);
        for (const d of diagnosi) {
            const bKey = `${anno}-${mese}|||${reparto}|||${d}`;
            if (!monthlyBuckets[bKey]) {
                monthlyBuckets[bKey] = { anno, mese, reparto, diagnosi: d, D, totalBedDays: 0, ricoveri: 0 };
            }
            monthlyBuckets[bKey].ricoveri += 1;
        }
        return;
    }

    const startDate = new Date(in_g * 86400000);
    let anno = startDate.getUTCFullYear();
    let mese = startDate.getUTCMonth() + 1;

    const endDate = new Date(ultimoGiorno * 86400000);
    const endAnno = endDate.getUTCFullYear();
    const endMese = endDate.getUTCMonth() + 1;

    while (anno < endAnno || (anno === endAnno && mese <= endMese)) {
        const D = giorniMese(anno, mese);
        const monthStart = Math.floor(Date.UTC(anno, mese - 1, 1) / 86400000);
        const monthEnd = monthStart + D - 1;

        const overlapStart = Math.max(in_g, monthStart);
        const overlapEnd   = Math.min(ultimoGiorno, monthEnd);
        const overlapDays  = Math.max(0, overlapEnd - overlapStart + 1);
        const isAdmission  = (in_g >= monthStart && in_g <= monthEnd) ? 1 : 0;

        if (overlapDays > 0 || isAdmission > 0) {
            for (const d of diagnosi) {
                const bKey = `${anno}-${mese}|||${reparto}|||${d}`;
                if (!monthlyBuckets[bKey]) {
                    monthlyBuckets[bKey] = { anno, mese, reparto, diagnosi: d, D, totalBedDays: 0, ricoveri: 0 };
                }
                monthlyBuckets[bKey].totalBedDays += overlapDays;
                monthlyBuckets[bKey].ricoveri     += isAdmission;
            }
        }

        mese++;
        if (mese > 12) { mese = 1; anno++; }
    }
}


async function generaPreprocessingOffline() {
    console.log(`[${new Date().toLocaleTimeString()}] Avvio del preprocessing offline da CSV...`);
    try {
        const bedEvents = {};
        let globalMaxGiorno = 0;

        await new Promise((resolve, reject) => {
            const rl = readline.createInterface({
                input: fs.createReadStream(CSV_DATASET, { encoding: 'utf8' }),
                crlfDelay: Infinity
            });

            let isHeader = true;
            rl.on('line', (line) => {
                if (isHeader) { isHeader = false; return; }
                const trimmed = line.trim();
                if (!trimmed) return;

                const f = parseCSVLine(trimmed);
                if (f.length < 7) return;

                const tipo     = f[3];
                const giorno   = dataAdGiornoEpoch(f[4]);
                const reparto  = f[5];
                const numero_pl = f[2];
                const diagnosi = parsePgArray(f[6]);

                if (diagnosi.length === 0) return;
                if (giorno > globalMaxGiorno) globalMaxGiorno = giorno;

                const key = `${reparto}|${numero_pl}`;
                if (!bedEvents[key]) bedEvents[key] = { reparto, eventi: [] };
                bedEvents[key].eventi.push({ tipo, giorno, diagnosi });
            });

            rl.on('close', resolve);
            rl.on('error', reject);
        });

       
        const monthlyBuckets = {};

        for (const { reparto, eventi } of Object.values(bedEvents)) {
            eventi.sort((a, b) => a.giorno - b.giorno);

            let pendingIn = null;

            for (const e of eventi) {
                if (e.tipo === 'IN') {
                    if (pendingIn !== null) {
                        aggiungiPeriodo(monthlyBuckets, reparto, pendingIn.giorno, null, pendingIn.diagnosi, globalMaxGiorno);
                    }
                    pendingIn = e;
                } else {
                    if (pendingIn !== null) {
                        aggiungiPeriodo(monthlyBuckets, reparto, pendingIn.giorno, e.giorno, pendingIn.diagnosi, globalMaxGiorno);
                        pendingIn = null;
                    }
                }
            }
            if (pendingIn !== null) {
                aggiungiPeriodo(monthlyBuckets, reparto, pendingIn.giorno, null, pendingIn.diagnosi, globalMaxGiorno);
            }
        }

        const risultati = Object.values(monthlyBuckets).map(b => ({
            anno:             b.anno,
            mese:             b.mese,
            reparto:          b.reparto,
            diagnosi:         b.diagnosi,
            posti_medi:       Math.round(b.totalBedDays / b.D * 100) / 100,
            numero_ricoveri:  b.ricoveri
        }));

        diagnosiList = [...new Set(risultati.map(r => r.diagnosi))].sort();
        fs.writeFileSync(DIAGNOSI_FILE, JSON.stringify(diagnosiList), 'utf-8');
        fs.writeFileSync(CACHE_FILE, JSON.stringify(risultati, null, 2), 'utf-8');

        isWorkerReady = false;
        worker.postMessage({ type: 'SET_CACHE', payload: { cacheFile: CACHE_FILE } });

        console.log(`[${new Date().toLocaleTimeString()}] Preprocessing completato! File salvato in: ${CACHE_FILE} e caricato nel worker.`);
    } catch (errore) {
        console.error("Errore critico durante il preprocessing offline:", errore);
    }
}


function cancellaFileTemporaneo() {
    for (const f of [CACHE_FILE, DIAGNOSI_FILE]) {
        if (fs.existsSync(f)) {
            try { fs.unlinkSync(f); }
            catch (err) { console.error('Errore durante la rimozione del file temporaneo:', err); }
        }
    }
    console.log('\n[Server shutdown] File temporanei rimossi.');
}


app.get('/api/reparti', (_req, res) => {
    res.json(repartiList);
});

app.get('/api/diagnosi', (req, res) => {
    if (!diagnosiList) return res.status(503).json({ error: 'Diagnosi non ancora disponibili.' });
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    const lower = q.trim().toLowerCase();
    const risultati = diagnosiList.filter(d => d.toLowerCase().includes(lower)).slice(0, 50);
    res.json(risultati);
});

app.get('/api/analisi-stagionale', async (req, res) => {
    if (!isWorkerReady) {
        return res.status(503).json({ error: "La cache è in fase di generazione nel worker, riprova tra qualche istante." });
    }

    try {
        const dataInizio = req.query.dataInizio ? parseInt(req.query.dataInizio) : null;
        const dataFine   = req.query.dataFine   ? parseInt(req.query.dataFine)   : null;

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


process.on('SIGINT',  () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
process.on('exit',    () => cancellaFileTemporaneo());

(async () => {
    await generaPreprocessingOffline();

    app.listen(PORT, () => {
        console.log(`Server in ascolto su http://localhost:${PORT}`);
    });
})();
