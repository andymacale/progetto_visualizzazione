const { parentPort } = require('worker_threads');
const fs = require('fs');

let cacheDati = null;

parentPort.on('message', (msg) => {
    const { type, payload } = msg;

    if (type === 'SET_CACHE') {
        try {
            const fileData = fs.readFileSync(payload.cacheFile, 'utf-8');
            cacheDati = JSON.parse(fileData);
            parentPort.postMessage({ type: 'READY' });
        } catch (e) {
            console.error("Errore nel worker durante la lettura del file JSON:", e);
        }
        return;
    }

    if (type === 'QUERY') {
        if (!cacheDati) {
            parentPort.postMessage({ type: 'QUERY_RESULT', reqId: payload.reqId, error: 'Cache non ancora pronta nel worker' });
            return;
        }

        const { reqId, dataInizio, dataFine, diagnosiFiltro, repartoFiltro } = payload;

        try {
            let topDiagnosi = null;
            if (!diagnosiFiltro || diagnosiFiltro.length === 0) {
                const conteggi = {};
                cacheDati.forEach(item => {
                    if (dataInizio && item.anno < dataInizio) return;
                    if (dataFine && item.anno > dataFine) return;
                    if (repartoFiltro && !repartoFiltro.includes(item.reparto)) return;
                    
                    conteggi[item.diagnosi] = (conteggi[item.diagnosi] || 0) + Number(item.posti_medi);
                });
                topDiagnosi = Object.entries(conteggi)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(e => e[0].toLowerCase());
            }

            let datiFiltrati = cacheDati.filter(item => {
                if (dataInizio && item.anno < dataInizio) return false;
                if (dataFine && item.anno > dataFine) return false;
                if (repartoFiltro && !repartoFiltro.includes(item.reparto)) return false;
                
                if (diagnosiFiltro && diagnosiFiltro.length > 0) {
                    const match = diagnosiFiltro.some(d => 
                        item.diagnosi.toLowerCase().includes(d.toLowerCase())
                    );
                    if (!match) return false;
                } else if (topDiagnosi) {
                    if (!topDiagnosi.includes(item.diagnosi.toLowerCase())) return false;
                }
                return true;
            });

            const mappaAggregata = {};
            datiFiltrati.forEach(item => {
                const chiave = `${item.anno}-${item.mese}-${item.reparto}-${item.diagnosi}`;
                if (!mappaAggregata[chiave]) {
                    mappaAggregata[chiave] = {
                        mese_riferimento: `${item.anno}-${String(item.mese).padStart(2, '0')}-01`,
                        reparto: item.reparto,
                        diagnosi_principali: item.diagnosi,
                        media_letti_occupati: 0,
                        numero_ricoveri: 0
                    };
                }
                mappaAggregata[chiave].media_letti_occupati += Number(item.posti_medi);
                mappaAggregata[chiave].numero_ricoveri += Number(item.numero_ricoveri);
            });

            parentPort.postMessage({ 
                type: 'QUERY_RESULT', 
                reqId: reqId, 
                result: Object.values(mappaAggregata) 
            });
        } catch (error) {
            parentPort.postMessage({ 
                type: 'QUERY_RESULT', 
                reqId: reqId, 
                error: error.message 
            });
        }
    }
});
