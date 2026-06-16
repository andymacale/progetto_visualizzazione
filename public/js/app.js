const btnPosti = document.getElementById('btn-posti');
const containerReparti = document.getElementById('container-reparti');
const containerDiagnosi = document.getElementById('container-diagnosi');
const inputRicercaDiagnosi = document.getElementById('ricerca-diagnosi');
const diagnosiSelezionate = new Set();

const inputDataInizio = document.getElementById('data-inizio');
const inputDataFine = document.getElementById('data-fine');

function validaAnno(val) {
    return /^\d{4}$/.test(val);
}

function segnaErroreAnno(input, errore) {
    input.classList.toggle('input-errore', errore);
}

function salvaFiltri() {
    const repartiScelti = Array.from(document.querySelectorAll('.cb-reparto:checked')).map(cb => cb.value);
    localStorage.setItem('visFiltri', JSON.stringify({
        annoInizio: inputDataInizio.value,
        annoFine: inputDataFine.value,
        reparti: repartiScelti,
        diagnosi: [...diagnosiSelezionate]
    }));
}

function ripristinaFiltri() {
    try { return JSON.parse(localStorage.getItem('visFiltri') || 'null'); }
    catch { return null; }
}

let chartCartesiano = null;

async function caricaReparti() {
    try {
        const response = await fetch('/api/reparti');
        const reparti = await response.json();
        containerReparti.innerHTML = '';
        const salvati = ripristinaFiltri();
        const repartiSalvati = new Set(salvati?.reparti || []);
        reparti.forEach(r => {
            const checked = repartiSalvati.has(r.reparto) ? 'checked' : '';
            containerReparti.innerHTML += `
                <label style="display:flex; align-items:center; gap:10px; margin-bottom:8px; font-size:14px; cursor:pointer; width:100%;">
                    <input type="checkbox" class="cb-reparto" value="${r.reparto}" ${checked} style="width:auto; margin:0; cursor:pointer;">
                    <span style="flex:1; white-space:normal; line-height:1.2; color:#333;">${r.reparto}</span>
                </label>`;
        });
        if (inputDataInizio.value.trim() && inputDataFine.value.trim()) {
            ricaricaDati('posti');
        }
    } catch (e) { console.error("Errore caricamento reparti:", e); }
}

const _filtriSalvati = ripristinaFiltri();
if (_filtriSalvati) {
    if (_filtriSalvati.annoInizio) inputDataInizio.value = _filtriSalvati.annoInizio;
    if (_filtriSalvati.annoFine) inputDataFine.value = _filtriSalvati.annoFine;
    if (_filtriSalvati.diagnosi?.length) {
        _filtriSalvati.diagnosi.forEach(d => diagnosiSelezionate.add(d));
    }
}
caricaReparti();

const containerChipsDiagnosi = document.getElementById('diagnosi-selezionate');

function renderChipsDiagnosi() {
    if (diagnosiSelezionate.size === 0) {
        containerChipsDiagnosi.innerHTML = '';
        return;
    }
    containerChipsDiagnosi.innerHTML = [...diagnosiSelezionate]
        .map(d => `<span class="chip-diagnosi">
            ${d}
            <span class="chip-rimuovi" data-diagnosi="${d}">&times;</span>
        </span>`)
        .join('');
}

if (diagnosiSelezionate.size > 0) renderChipsDiagnosi();

function aggiornaDopoDiagnosi() {
    salvaFiltri();
    renderChipsDiagnosi();
    if (inputDataInizio.value.trim() && inputDataFine.value.trim()) {
        eseguiConDebounce(() => ricaricaDati('posti'), 0);
    }
}

containerDiagnosi.addEventListener('change', (e) => {
    if (!e.target.classList.contains('cb-diagnosi')) return;
    if (e.target.checked) diagnosiSelezionate.add(e.target.value);
    else diagnosiSelezionate.delete(e.target.value);
    aggiornaDopoDiagnosi();
});

containerChipsDiagnosi.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-rimuovi');
    if (!chip) return;
    const d = chip.dataset.diagnosi;
    diagnosiSelezionate.delete(d);
    const cb = containerDiagnosi.querySelector(`.cb-diagnosi[value="${CSS.escape(d)}"]`);
    if (cb) cb.checked = false;
    aggiornaDopoDiagnosi();
});

async function cercaDiagnosi() {
    const q = inputRicercaDiagnosi.value.trim();
    if (q.length < 2) {
        containerDiagnosi.innerHTML = '<span class="testo-caricamento">Inserisci almeno 2 caratteri</span>';
        return;
    }
    try {
        const res = await fetch(`/api/diagnosi?q=${encodeURIComponent(q)}`);
        const lista = await res.json();
        if (!lista.length) {
            containerDiagnosi.innerHTML = '<span class="testo-caricamento">Nessuna diagnosi trovata</span>';
            return;
        }
        containerDiagnosi.innerHTML = lista
            .map(d => `<label style="display:flex; align-items:center; gap:10px; margin-bottom:8px; font-size:14px; cursor:pointer; width:100%;">
                    <input type="checkbox" class="cb-diagnosi" value="${d}" ${diagnosiSelezionate.has(d) ? 'checked' : ''} style="width:auto; margin:0; cursor:pointer;">
                    <span style="flex:1; white-space:normal; line-height:1.2; color:#333;">${d}</span>
                </label>`)
            .join('');
    } catch (e) { console.error("Errore ricerca diagnosi:", e); }
}

document.getElementById('btn-cerca-diagnosi').addEventListener('click', cercaDiagnosi);
inputRicercaDiagnosi.addEventListener('keydown', (e) => { if (e.key === 'Enter') cercaDiagnosi(); });

function disegnaGraficoCartesiano(righeDb) {
    if (chartCartesiano) chartCartesiano.destroy();

    const nomiMesi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    
    const coloriReparti = {
        'Medical Intensive Care Unit (MICU)': '#007BFF', 
        'Trauma SICU (TSICU)': '#DC3545',               
        'Medical/Surgical Intensive Care Unit (MICU/SICU)': '#28A745', 
        'Coronary Care Unit (CCU)': '#FFC107',           
        'Cardiac Vascular Intensive Care Unit (CVICU)': '#6F42C1',
        'Neuro Intermediate': '#FD7E14',
        'Surgical Intensive Care Unit (SICU)': '#20C997',
        'Intensive Care Unit (ICU)': '#E83E8C', 
        'Medicine': '#17A2B8'                   
    };

    const acronimiReparti = {
        'Medical Intensive Care Unit (MICU)': 'MICU',
        'Trauma SICU (TSICU)': 'TSICU',
        'Medical/Surgical Intensive Care Unit (MICU/SICU)': 'MICU/SICU',
        'Coronary Care Unit (CCU)': 'CCU',
        'Cardiac Vascular Intensive Care Unit (CVICU)': 'CVICU',
        'Neuro Intermediate': 'NEURO',
        'Surgical Intensive Care Unit (SICU)': 'SICU',
        'Intensive Care Unit (ICU)': 'ICU',
        'Medicine': 'MED'
    };

    const anniUnici = [...new Set(righeDb.map(r => new Date(r.mese_riferimento).getFullYear()))].sort();
    const malattieUniche = [...new Set(righeDb.map(r => r.diagnosi_principali))].sort();

    const gruppi = {};
    righeDb.forEach(riga => {
        const d = new Date(riga.mese_riferimento);
        const anno = d.getFullYear();
        const meseIndice = d.getMonth();

        const chiave = `${riga.reparto || 'Generale'} - ${riga.diagnosi_principali} - ${anno}`;
        
        if (!gruppi[chiave]) {
            gruppi[chiave] = { 
                reparto: riga.reparto, 
                malattia: riga.diagnosi_principali, 
                anno: anno,
                punti: Array(12).fill(null)
            };
        }
        gruppi[chiave].punti[meseIndice] = riga;
    });

    const datasets = Object.keys(gruppi).map((chiave) => {
        const g = gruppi[chiave];
        const coloreBase = coloriReparti[g.reparto] || '#6c757d';
        
        const indiceAnno = anniUnici.indexOf(g.anno);
        const coloreBarra = sfumaColoreDaScuro(coloreBase, indiceAnno, anniUnici.length);

        const indiceMalattia = malattieUniche.indexOf(g.malattia);
        const patternBordo = indiceMalattia === 0 ? [] : [indiceMalattia * 4, indiceMalattia * 3];

        const dataModellata = g.punti.map(rigaMese => rigaMese ? parseFloat(rigaMese.media_letti_occupati) : null);
        const repartoCompatto = acronimiReparti[g.reparto] || g.reparto || 'Gen';

        return {
            label: `${repartoCompatto} | ${g.anno} | ${g.malattia}`,
            data: dataModellata,
            backgroundColor: coloreBarra,
            borderColor: coloreBase,
            borderWidth: indiceMalattia === 0 ? 1 : 2.5, 
            borderDash: patternBordo, 
            borderRadius: 3,
            barPercentage: 0.85,
            categoryPercentage: 0.8,
            repartoEsteso: g.reparto || 'Generale',
            grezzi: g.punti 
        };
    });

    datasets.sort((a, b) => a.repartoEsteso.localeCompare(b.repartoEsteso));

    const ctx = document.getElementById('graficoCartesiano').getContext('2d');
    chartCartesiano = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: nomiMesi,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 5, bottom: 5, left: 0, right: 0 }
            },
            onClick: (e, elementi) => {
                if (elementi.length > 0) {
                    const barra = elementi[0];
                    const indiceMese = barra.index;
                    const datasetIndex = barra.datasetIndex;
                    const dataset = chartCartesiano.data.datasets[datasetIndex];
                    const infoRiga = dataset.grezzi[indiceMese];
                    const dettagliLabel = dataset.label.split(' | ');
                    
                    if (infoRiga) {
                        alert(`DETTAGLIO SELEZIONE:\n` +
                              `--------------------------------------------\n` +
                              `Mese Analizzato: ${nomiMesi[indiceMese]} (${dettagliLabel[1]})\n` +
                              `Reparto (Esteso): ${dataset.repartoEsteso}\n` +
                              `${dettagliLabel[2]}\n\n` +
                              `METRICHE SANITARIE:\n` +
                              `- Letti Medi Occupati (Asse Y): ${parseFloat(infoRiga.media_letti_occupati).toFixed(1)}\n` +
                              `- Numero Ricoveri Effettivi: ${infoRiga.numero_ricoveri}`);
                    }
                }
            },
            plugins: {
                legend: {
                    display: false 
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 30, 30, 0.95)', 
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        title: function(context) {
                            return `Distribuzione Stagionale: ${context[0].label}`;
                        },
                        label: function(context) {
                            const dataset = context.dataset;
                            const dettagliLabel = dataset.label.split(' | ');
                            const indiceMese = context.dataIndex;
                            const rigaOriginale = dataset.grezzi[indiceMese];
                            const lettiOccupati = context.parsed.y;

                            return [
                                `------------------------------------------`,
                                `Reparto (Esteso): ${dataset.repartoEsteso}`, 
                                `Anno: ${dettagliLabel[1]}`,
                                `Malattia: ${dettagliLabel[2]}`,
                                `Letti Medi Occupati (Y): ${lettiOccupati}`,
                                `Volume Ricoveri nel Mese: ${rigaOriginale ? rigaOriginale.numero_ricoveri : 0}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: { display: false },
                    title: { display: true, text: 'Mesi di riferimento', font: { weight: 'bold', size: 11 } }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.3)',
                        lineWidth: 3
                    },
                    title: { display: true, text: 'Media letti occupati', font: { weight: 'bold', size: 11 } }
                }
            }
        }
    });

    generoHeatmapLegenda(righeDb, anniUnici, coloriReparti, malattieUniche);
}

function sfumaColoreDaScuro(hex, indice, totElementi) {
    if (totElementi <= 1) return hex;
    
    const factor = 0.35 + (0.65 * (indice / (totElementi - 1)));
    
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);

    R = Math.floor(R * factor);
    G = Math.floor(G * factor);
    B = Math.floor(B * factor);

    const rHex = R.toString(16).padStart(2, '0');
    const gHex = G.toString(16).padStart(2, '0');
    const bHex = B.toString(16).padStart(2, '0');

    return "#" + rHex + gHex + bHex;
}

function generoHeatmapLegenda(righeDb, anniUnici, coloriReparti, malattieUniche) {
    const containerHeatmap = document.getElementById('heatmap-container');
    if (!containerHeatmap) return;

    const aggregati = {};

    righeDb.forEach(riga => {
        const anno = new Date(riga.mese_riferimento).getFullYear();
        const reparto = riga.reparto;
        const malattia = riga.diagnosi_principali;
        
        const chiave = `${reparto} | ${malattia}`;

        if (!aggregati[chiave]) {
            aggregati[chiave] = { reparto: reparto, malattia: malattia };
            anniUnici.forEach(a => aggregati[chiave][a] = { volumeRicoveri: 0 });
        }
        
        if (aggregati[chiave][anno]) {
            aggregati[chiave][anno].volumeRicoveri += parseInt(riga.numero_ricoveri);
        }
    });

    let htmlMappa = `
        <div class="heatmap-titolo" style="margin-top: 10px; margin-bottom: 12px;">Legenda anni e volume ricoveri totale (pazienti)</div>
        <div class="heatmap-griglia">
            
            <div class="heatmap-riga" style="margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #eee; padding-right: 12px;">
                <div class="heatmap-etichetta-reparto" style="font-weight: bold; color: #333; flex: 0 0 200px;">Reparto e diagnosi</div>
                <div class="heatmap-celle-mesi">`;
                
    anniUnici.forEach(anno => {
        htmlMappa += `<div style="flex: 1; font-size: 11px; font-weight: bold; text-align: center; color: #444;">${anno}</div>`;
    });

    htmlMappa += `</div></div>`;

    htmlMappa += `<div class="heatmap-righe-scroll">`;

    Object.keys(aggregati).forEach(chiave => {
        const data = aggregati[chiave];
        const repartoBreve = data.reparto.replace('Intensive Care Unit', 'ICU');
        
        const coloreBase = coloriReparti[data.reparto] || '#6c757d';
        const indiceMalattia = malattieUniche.indexOf(data.malattia);
        const stileBordo = indiceMalattia === 0 ? '1px solid rgba(0,0,0,0.1)' : '2px dashed #222';

        htmlMappa += `
            <div class="heatmap-riga">
                <div class="heatmap-etichetta-reparto" style="flex: 0 0 200px; line-height: 1.2;" title="${data.reparto} - ${data.malattia}">
                    <strong> ${repartoBreve}</strong><br>
                    <span style="font-size: 10px; color: #666;"> ${data.malattia}</span>
                </div>
                <div class="heatmap-celle-mesi">`;

        anniUnici.forEach((anno, indiceAnno) => {
            const datiAnno = data[anno];
            
            if (datiAnno && datiAnno.volumeRicoveri > 0) {
                const coloreBarraMappata = sfumaColoreDaScuro(coloreBase, indiceAnno, anniUnici.length);

                htmlMappa += `
                    <div class="heatmap-cella" 
                         style="background-color: ${coloreBarraMappata}; border: ${stileBordo}; border-radius: 4px; height: 36px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; color: #fff; text-shadow: 0px 1px 3px rgba(0,0,0,0.9); cursor: pointer;" 
                         title="Reparto: ${data.reparto}\nMalattia: ${data.malattia}\nAnno: ${anno}\nPazienti Totali: ${datiAnno.volumeRicoveri}"
                         onclick="alert(' ${data.reparto}\\n ${data.malattia}\\n Anno: ${anno}\\n Volume Totale Pazienti: ${datiAnno.volumeRicoveri}')">
                         ${datiAnno.volumeRicoveri}
                    </div>`;
            } else {
                htmlMappa += `<div class="heatmap-cella" style="background-color: #f5f5f5; border-radius: 4px; height: 36px;" title="Nessun ricovero"></div>`;
            }
        });

        htmlMappa += `</div></div>`;
    });

    htmlMappa += `</div>`; 
    htmlMappa += `</div>`; 
    containerHeatmap.innerHTML = htmlMappa;
}

async function ricaricaDati(sezioneDati) {
    if (sezioneDati !== 'posti') return;
    
    const valoreInizioRaw = inputDataInizio.value.trim(); 
    const valoreFineRaw = inputDataFine.value.trim();

    if (!valoreInizioRaw || !valoreFineRaw) {
        mostraMessaggioGrafico("Inserire gli anni di riferimento");
        return;
    }

    if (!validaAnno(valoreInizioRaw) || !validaAnno(valoreFineRaw)) {
        mostraMessaggioGrafico("Anno non valido — deve essere composto da 4 cifre");
        return;
    }

    if (typeof mostraSpinner === 'function') mostraSpinner();
    await new Promise(r => setTimeout(r, 0));

    try {
        const repartiScelti = Array.from(document.querySelectorAll('.cb-reparto:checked')).map(cb => cb.value);
        const diagnosiScelte = [...diagnosiSelezionate];

        const parametri = new URLSearchParams();
        parametri.append('dataInizio', valoreInizioRaw);
        parametri.append('dataFine', valoreFineRaw);

        diagnosiScelte.forEach(d => parametri.append('diagnosi', d));
        repartiScelti.forEach(r => parametri.append('reparto', r));

        const url = `/api/analisi-stagionale?${parametri.toString()}`;
        const response = await fetch(url);
        const righeDbRaw = await response.json();

        if (righeDbRaw.length > 0) {
            
            const mappaAggregata = {};
            
            righeDbRaw.forEach(riga => {
                const nomeMalattia = riga.diagnosi_principali;
                const chiaveUnica = `${riga.mese_riferimento}_${riga.reparto}_${nomeMalattia}`;
                
                if (!mappaAggregata[chiaveUnica]) {
                    mappaAggregata[chiaveUnica] = {
                        ...riga,
                        diagnosi_principali: nomeMalattia, 
                        media_letti_occupati: 0,
                        numero_ricoveri: 0
                    };
                }
                
                mappaAggregata[chiaveUnica].media_letti_occupati += parseFloat(riga.media_letti_occupati);
                mappaAggregata[chiaveUnica].numero_ricoveri += parseInt(riga.numero_ricoveri);
            });

            const righeDbPulite = Object.values(mappaAggregata);
            disegnaGraficoCartesiano(righeDbPulite);
        } else {
            mostraMessaggioGrafico("Nessun dato trovato per i filtri selezionati");
        }
    } catch (error) { 
        console.error("Errore caricamento dati:", error); 
        mostraMessaggioGrafico("Errore di connessione con il server");
    } finally {
        if (typeof nascondiSpinner === 'function') nascondiSpinner();
    }
}

containerReparti.addEventListener('change', () => {
    salvaFiltri();
    if (inputDataInizio.value.trim() && inputDataFine.value.trim()) {
        eseguiConDebounce(() => ricaricaDati('posti'), 400);
    }
});

function gestisciInputAnni() {
    const inizio = inputDataInizio.value.trim();
    const fine = inputDataFine.value.trim();
    const inizioOk = !inizio || validaAnno(inizio);
    const fineOk = !fine || validaAnno(fine);
    segnaErroreAnno(inputDataInizio, inizio.length >= 4 && !inizioOk);
    segnaErroreAnno(inputDataFine, fine.length >= 4 && !fineOk);
    salvaFiltri();
    if (inizio && fine && inizioOk && fineOk) {
        eseguiConDebounce(() => ricaricaDati('posti'), 400);
    }
}

inputDataInizio.addEventListener('input', gestisciInputAnni);
inputDataFine.addEventListener('input', gestisciInputAnni);

function mostraMessaggioGrafico(messaggio) {
    if (chartCartesiano) {
        chartCartesiano.destroy();
        chartCartesiano = null;
    }
    
    const containerHeatmap = document.getElementById('heatmap-container');
    if (containerHeatmap) {
        containerHeatmap.innerHTML = '';
    }

    const canvas = document.getElementById('graficoCartesiano');
    if (canvas) {
        canvas.width = canvas.parentElement.clientWidth || 800;
        canvas.height = canvas.parentElement.clientHeight || 400;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.font = "bold 16px 'Montserrat', sans-serif";
        ctx.fillStyle = "#ff0000"; 
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(messaggio, canvas.width / 2, canvas.height / 2);
    }
}