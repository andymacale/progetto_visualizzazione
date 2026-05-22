// ==========================================
// 1. SELEZIONE DEGLI ELEMENTI DOM
// ==========================================
const btnPosti = document.getElementById('btn-posti');
const btnMedicinali = document.getElementById('btn-medicinali');
const sezioneSplit = document.getElementById('sezione-split');
const formPosti = document.getElementById('form-posti');
const formMedicinali = document.getElementById('form-medicinali');
const risPosti = document.getElementById('risultati-posti');
const risMedicinali = document.getElementById('risultati-medicinali');

const inputDataInizio = document.getElementById('data-inizio');
const inputDataFine = document.getElementById('data-fine');
const inputDiagnosi = document.getElementById('nome-diagnosi');
const containerReparti = document.getElementById('container-reparti');

const flexOpzioni = document.getElementById('flex-opzioni');
let chartCartesiano = null; 
let sezioneAttiva = null;

async function caricaReparti() {
    try {
        const response = await fetch('/api/reparti');
        const reparti = await response.json();
        containerReparti.innerHTML = '';
        reparti.forEach(r => {
            containerReparti.innerHTML += `
                <label style="display:flex; align-items:center; gap:10px; margin-bottom:8px; font-size:13px; cursor:pointer; width:100%;">
                    <input type="checkbox" class="cb-reparto" value="${r.reparto}" style="width:auto; margin:0; cursor:pointer;"> 
                    <span style="flex:1; white-space:normal; line-height:1.2; color:#333;">${r.reparto}</span>
                </label>`;
        });
    } catch (e) { console.error("Errore caricamento reparti:", e); }
}
caricaReparti();

function commutaVisualizzazione(tipo) {
    if (sezioneAttiva === tipo) {
        sezioneSplit.classList.add('nascosto');
        btnPosti.classList.remove('selezionato');
        btnMedicinali.classList.remove('selezionato');
        sezioneAttiva = null;
        flexOpzioni.classList.remove('compatto'); 
        return;
    }
    sezioneAttiva = tipo;
    sezioneSplit.classList.remove('nascosto');
    flexOpzioni.classList.add('compatto'); 

    if (tipo === 'posti') {
        btnPosti.classList.add('selezionato');
        btnMedicinali.classList.remove('selezionato');
        formPosti.style.display = 'block';
        risPosti.style.display = 'block';
        formMedicinali.style.display = 'none';
        risMedicinali.style.display = 'none';

        mostraMessaggioGrafico("inserire gli anni di riferimento");

        setTimeout(() => { ricaricaDati('posti'); }, 400);
    }
}
btnPosti.addEventListener('click', () => commutaVisualizzazione('posti'));

// ==========================================
// 3. COSTRUZIONE DELL'ISTOGRAMMA RAGGRUPPATO
// ==========================================
function disegnaGraficoCartesiano(righeDb) {
    if (chartCartesiano) chartCartesiano.destroy();

    const nomiMesi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    
    // Configurazione Colori (Sincronizzata per Grafico e Legenda)
    const coloriReparti = {
        'Medical Intensive Care Unit (MICU)': '#007BFF', 
        'Trauma SICU (TSICU)': '#DC3545',               
        'Medical/Surgical Intensive Care Unit (MICU/SICU)': '#28A745', 
        'Coronary Care Unit (CCU)': '#FFC107',           
        'Cardiac Vascular Intensive Care Unit (CVICU)': '#6F42C1',
        'Neuro Intermediate': '#FD7E14',
        'Surgical Intensive Care Unit (SICU)': '#20C997',
        'Intensive Care Unit (ICU)': '#E83E8C', // Fucsia
        'Medicine': '#17A2B8'                   // Ciano
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
        const coloreBarra = regolareLuminosita(coloreBase, indiceAnno * 35);

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
                        alert(`📋 DETTAGLIO SELEZIONE:\n` +
                              `--------------------------------------------\n` +
                              `Mese Analizzato: ${nomiMesi[indiceMese]} (${dettagliLabel[1]})\n` +
                              `Reparto (Esteso): ${dataset.repartoEsteso}\n` +
                              `${dettagliLabel[2]}\n\n` +
                              `📊 METRICHE SANITARIE LIVE:\n` +
                              `• Letti Medi Occupati (Asse Y): ${parseFloat(infoRiga.media_letti_occupati).toFixed(1)}\n` +
                              `• Numero Ricoveri Effettivi: ${infoRiga.numero_ricoveri}`);
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
                    grid: { 
                        display: true,          
                        offset: true,           
                        drawOnChartArea: true,  
                        drawTicks: true,        
                        color: 'rgba(0, 0, 0, 0.12)', 
                        lineWidth: 1            
                    },
                    title: { display: true, text: 'Mesi di Riferimento', font: { weight: 'bold', size: 11 } } 
                },
                y: { 
                    beginAtZero: true, 
                    title: { display: true, text: 'Letti Medi Occupati', font: { weight: 'bold', size: 11 } } 
                }
            }
        }
    });

    // Avviamo la Legenda Visiva Universale!
    generoHeatmapLegenda(righeDb, anniUnici, coloriReparti, malattieUniche);
}

// Funzione di utilità per variare i colori HEX (esattamente come nel grafico)
function regolareLuminosita(hex, percent) {
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);

    R = parseInt((R * (100 + percent)) / 100);
    G = parseInt((G * (100 + percent)) / 100);
    B = parseInt((B * (100 + percent)) / 100);

    R = (R < 255) ? R : 255;  
    G = (G < 255) ? G : 255;  
    B = (B < 255) ? B : 255;  

    const rHex = (R.toString(16).length === 1) ? "0" + R.toString(16) : R.toString(16);
    const gHex = (G.toString(16).length === 1) ? "0" + G.toString(16) : G.toString(16);
    const bHex = (B.toString(16).length === 1) ? "0" + B.toString(16) : B.toString(16);

    return "#" + rHex + gHex + bHex;
}

// =========================================================================
// NUOVA LEGENDA VISIVA: MOSTRA I COLORI DEGLI ANNI E IL VOLUME DEI RICOVERI
// =========================================================================
// =========================================================================
// NUOVA LEGENDA VISIVA: SCORREVOLE CON INTESTAZIONE FISSA
// =========================================================================
function generoHeatmapLegenda(righeDb, anniUnici, coloriReparti, malattieUniche) {
    const containerHeatmap = document.getElementById('heatmap-container');
    if (!containerHeatmap) return;

    const aggregati = {};

    // 1. Raggruppiamo i dati
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

    // 2. INTESTAZIONE FISSA (Non scorre)
    let htmlMappa = `
        <div class="heatmap-titolo" style="margin-top: 10px; margin-bottom: 12px;">🎨 Legenda Anni e Volume Ricoveri Totale (Pazienti)</div>
        <div class="heatmap-griglia">
            
            <div class="heatmap-riga" style="margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid #eee; padding-right: 12px;">
                <div class="heatmap-etichetta-reparto" style="font-weight: bold; color: #333; flex: 0 0 200px;">Reparto e Diagnosi</div>
                <div class="heatmap-celle-mesi">`;
                
    anniUnici.forEach(anno => {
        htmlMappa += `<div style="flex: 1; font-size: 11px; font-weight: bold; text-align: center; color: #444;">Anno ${anno}</div>`;
    });

    htmlMappa += `</div></div>`;

    // 3. CONTENITORE SCORREVOLE (Qui dentro vanno i dati)
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
                    <strong>🏢 ${repartoBreve}</strong><br>
                    <span style="font-size: 10px; color: #666;">🦠 ${data.malattia}</span>
                </div>
                <div class="heatmap-celle-mesi">`;

        anniUnici.forEach((anno, indiceAnno) => {
            const datiAnno = data[anno];
            
            if (datiAnno && datiAnno.volumeRicoveri > 0) {
                const coloreBarraMappata = regolareLuminosita(coloreBase, indiceAnno * 35);

                htmlMappa += `
                    <div class="heatmap-cella" 
                         style="background-color: ${coloreBarraMappata}; border: ${stileBordo}; border-radius: 4px; height: 36px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; color: #fff; text-shadow: 0px 1px 3px rgba(0,0,0,0.9); cursor: pointer;" 
                         title="Reparto: ${data.reparto}\nMalattia: ${data.malattia}\nAnno: ${anno}\nPazienti Totali: ${datiAnno.volumeRicoveri}"
                         onclick="alert('🏢 ${data.reparto}\\n🦠 ${data.malattia}\\n📅 Anno: ${anno}\\n👥 Volume Totale Pazienti: ${datiAnno.volumeRicoveri}')">
                         ${datiAnno.volumeRicoveri}
                    </div>`;
            } else {
                htmlMappa += `<div class="heatmap-cella" style="background-color: #f5f5f5; border-radius: 4px; height: 36px;" title="Nessun ricovero"></div>`;
            }
        });

        htmlMappa += `</div></div>`;
    });

    htmlMappa += `</div>`; // Chiude il contenitore scorrevole
    htmlMappa += `</div>`; // Chiude la griglia generale
    containerHeatmap.innerHTML = htmlMappa;
}

// ==========================================
// GLOBALI PER I MULTI-TAG DELLE DIAGNOSI
// ==========================================
let diagnosiScelte = [];
const wrapperTagDiagnosi = document.getElementById('wrapper-tag-diagnosi');

wrapperTagDiagnosi.addEventListener('click', () => inputDiagnosi.focus());

function renderizzaTag() {
    const vecchiTag = wrapperTagDiagnosi.querySelectorAll('.tag-chip');
    vecchiTag.forEach(t => t.remove());

    diagnosiScelte.forEach((malattia, indice) => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.style.cssText = "background-color: #e6f2ff; color: #007BFF; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; display: flex; align-items: center; gap: 8px; border: 1px solid #b3d7ff; user-select: none;";
        chip.innerHTML = `
            ${malattia}
            <span style="cursor:pointer; color:#ff4d4d; font-size: 14px; font-weight:bold; transition: 0.2s;" onmouseover="this.style.color='#cc0000'" onmouseout="this.style.color='#ff4d4d'" onclick="rimuoviTag(${indice})">&times;</span>
        `;
        wrapperTagDiagnosi.insertBefore(chip, inputDiagnosi);
    });
}

window.rimuoviTag = function(indice) {
    diagnosiScelte.splice(indice, 1);
    renderizzaTag();
    ricaricaDati('posti');
};

inputDiagnosi.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        const valore = inputDiagnosi.value.trim();
        if (valore && !diagnosiScelte.includes(valore)) {
            diagnosiScelte.push(valore);
            inputDiagnosi.value = '';
            renderizzaTag();
            ricaricaDati('posti');
        }
    }
});

// ==========================================
// 4. RICHIESTA DATI AL SERVER E AGGREGAZIONE MALATTIE SIMILI
// ==========================================
async function ricaricaDati(sezioneDati) {
    if (sezioneDati !== 'posti') return;
    
    const valoreInizioRaw = inputDataInizio.value.trim(); 
    const valoreFineRaw = inputDataFine.value.trim();

    if (!valoreInizioRaw || !valoreFineRaw) {
        mostraMessaggioGrafico("inserire gli anni di riferimento");
        return;
    }

    if (typeof mostraSpinner === 'function') mostraSpinner();

    try {
        const repartiScelti = Array.from(document.querySelectorAll('.cb-reparto:checked')).map(cb => cb.value);

        const parametri = new URLSearchParams();
        parametri.append('dataInizio', valoreInizioRaw);
        parametri.append('dataFine', valoreFineRaw);
        
        diagnosiScelte.forEach(d => parametri.append('diagnosi', d));
        repartiScelti.forEach(r => parametri.append('reparto', r));

        const url = `/api/analisi-stagionale?${parametri.toString()}`;
        const response = await fetch(url);
        const righeDbRaw = await response.json();

        if (righeDbRaw.length > 0) {
            
            // AGGREGAZIONE DELLE VARIANTI CLINICHE IN UN UNICO NOME
            const mappaAggregata = {};
            
            righeDbRaw.forEach(riga => {
                let nomeMalattia = riga.diagnosi_principali;
                
                // Raggruppa sotto il nome del tag tutte le malattie pescate da "ilike"
                if (diagnosiScelte.length > 0) {
                    const tagTrovato = diagnosiScelte.find(tag => 
                        riga.diagnosi_principali.toLowerCase().includes(tag.toLowerCase())
                    );
                    if (tagTrovato) nomeMalattia = tagTrovato.toUpperCase(); 
                }
                
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

containerReparti.addEventListener('change', () => eseguiConDebounce(() => ricaricaDati('posti'), 400));
inputDataInizio.addEventListener('input', () => eseguiConDebounce(() => ricaricaDati('posti'), 400));
inputDataFine.addEventListener('input', () => eseguiConDebounce(() => ricaricaDati('posti'), 400));

// ==========================================
// 5. FUNZIONE DI UTILITÀ PER MESSAGGI DI ERRORE
// ==========================================
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
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.font = "bold 16px 'Montserrat', sans-serif";
        ctx.fillStyle = "#ff0000"; 
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(messaggio, canvas.width / 2, canvas.height / 2);
    }
}