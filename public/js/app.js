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
const inputDiagnosi = document.getElementById('nome-diagnosi'); // Ripristinato input testo
const containerReparti = document.getElementById('container-reparti');

const flexOpzioni = document.getElementById('flex-opzioni');
let chartCartesiano = null; 
let sezioneAttiva = null;

// Popolamento dinamico delle sole checkbox dei reparti
async function caricaReparti() {
    try {
        const response = await fetch('/api/reparti');
        const reparti = await response.json();
        containerReparti.innerHTML = '';
        reparti.forEach(r => {
            // CORREZIONE GRAFICA: style="width:auto" impedisce alle checkbox di allargarsi distruggendo il testo
            containerReparti.innerHTML += `
                <label style="display:flex; align-items:center; gap:10px; margin-bottom:8px; font-size:13px; cursor:pointer; width:100%;">
                    <input type="checkbox" class="cb-reparto" value="${r.reparto}" style="width:auto; margin:0; cursor:pointer;"> 
                    <span style="flex:1; white-space:normal; line-height:1.2; color:#333;">${r.reparto}</span>
                </label>`;
        });
    } catch (e) { console.error("Errore caricamento reparti:", e); }
}
caricaReparti();

// ==========================================
// 2. GESTIONE NAVIGAZIONE (HERO TO HEADER)
// ==========================================
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

        setTimeout(() => { ricaricaDati('posti'); }, 400);
    }
}
btnPosti.addEventListener('click', () => commutaVisualizzazione('posti'));

// ==========================================
// 3. COSTRUZIONE DEL GRAFICO CARTESIANO MULTI-SERIE
// ==========================================
function disegnaGraficoCartesiano(righeDb) {
    if (chartCartesiano) chartCartesiano.destroy();

    const mesiUnici = [...new Set(righeDb.map(r => {
        const d = new Date(r.mese_riferimento);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }))].sort();
    
    const coloriReparti = {
        'Medical Intensive Care Unit (MICU)': '#007BFF', 
        'Trauma SICU (TSICU)': '#DC3545',               
        'Medical/Surgical Intensive Care Unit (MICU/SICU)': '#28A745', 
        'Coronary Care Unit (CCU)': '#FFC107',           
        'Cardiac Vascular Intensive Care Unit (CVICU)': '#6F42C1',
        'Neuro Intermediate': '#FD7E14',
        'Surgical Intensive Care Unit (SICU)': '#20C997'
    };
    
    const formeMalattie = ['circle', 'rect', 'triangle', 'triangleRot', 'rectRot', 'star'];
    const malattieUniche = [...new Set(righeDb.map(r => r.diagnosi_principali))];

    const gruppi = {};
    righeDb.forEach(riga => {
        const chiave = `${riga.reparto || 'Generale'} - ${riga.diagnosi_principali}`;
        if (!gruppi[chiave]) {
            gruppi[chiave] = { reparto: riga.reparto, malattia: riga.diagnosi_principali, punti: {} };
        }
        const d = new Date(riga.mese_riferimento);
        const meseStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        gruppi[chiave].punti[meseStr] = riga;
    });

    const datasets = Object.keys(gruppi).map((chiave) => {
        const g = gruppi[chiave];
        const colore = coloriReparti[g.reparto] || '#6c757d';
        const indiceMalattia = malattieUniche.indexOf(g.malattia) % formeMalattie.length;
        const forma = formeMalattie[indiceMalattia];

        const dataModellata = mesiUnici.map(mese => {
            const datoMese = g.punti[mese];
            return datoMese ? parseFloat(datoMese.media_letti_occupati) : null; 
        });

        const radiiPunti = mesiUnici.map(mese => {
            const datoMese = g.punti[mese];
            if (!datoMese) return 0;
            const giorniDegenza = parseFloat(datoMese.media_ore_degenza) / 24;
            return 6 + Math.min(18, giorniDegenza * 0.9); 
        });

        const spessoreBordi = mesiUnici.map(mese => {
            const datoMese = g.punti[mese];
            if (!datoMese) return 1;
            const giorniDegenza = parseFloat(datoMese.media_ore_degenza) / 24;
            return 1.5 + Math.min(5, giorniDegenza * 0.25);
        });

        return {
            label: `${g.reparto || 'Generale'} | ${g.malattia}`,
            data: dataModellata,
            borderColor: colore,
            backgroundColor: colore,
            borderWidth: 2,
            tension: 0.15, 
            pointStyle: forma,
            pointRadius: radiiPunti,
            pointBorderWidth: spessoreBordi,
            pointBorderColor: '#ffffff', 
            pointHoverRadius: radiiPunti.map(r => r + 4),
            pointHoverBorderWidth: spessoreBordi.map(b => b + 2),
            pointHoverBorderColor: '#333333', 
            spanGaps: true 
        };
    });

    const ctx = document.getElementById('graficoCartesiano').getContext('2d');
    chartCartesiano = new Chart(ctx, {
        type: 'line', 
        data: {
            labels: mesiUnici.map(m => {
                const [anno, mese] = m.split('-');
                const nomiMesi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
                return `${nomiMesi[parseInt(mese)-1]} ${anno}`;
            }),
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12, usePointStyle: true, font: { size: 10 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(30, 30, 30, 0.95)', 
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const dataset = context.dataset;
                            const labelOriginale = dataset.label.split(' | ');
                            const chiaveGruppo = dataset.label.replace(' | ', ' - ');
                            const meseAsseX = mesiUnici[context.dataIndex];
                            const rigaOriginale = gruppi[chiaveGruppo].punti[meseAsseX];
                            
                            const giorni = rigaOriginale ? (rigaOriginale.media_ore_degenza / 24).toFixed(1) : 0;
                            return [
                                `🚨 DEGENZA MEDIA: ${giorni} GIORNI`,
                                `------------------------------------------`,
                                `Reparto: ${labelOriginale[0]}`,
                                `Malattia: ${labelOriginale[1]}`,
                                `Letti Medi Occupati (Asse Y): ${context.parsed.y}`,
                                `Volume Ricoveri Totale: ${rigaOriginale ? rigaOriginale.numero_ricoveri : 0}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: { title: { display: true, text: 'Asse Temporale (Mesi)', font: { weight: 'bold', size: 12 } } },
                y: { beginAtZero: true, title: { display: true, text: 'Posti Letto Medi Occupati', font: { weight: 'bold', size: 12 } } }
            }
        }
    });
}

// ==========================================
// GLOBALI PER I MULTI-TAG DELLE DIAGNOSI
// ==========================================
let diagnosiScelte = [];
const wrapperTagDiagnosi = document.getElementById('wrapper-tag-diagnosi');

// Cliccando sul rettangolo bianco, si dà il focus all'input nascosto all'interno
wrapperTagDiagnosi.addEventListener('click', () => inputDiagnosi.focus());

// Funzione per generare visivamente i blocchetti (Chips) dei tag
function renderizzaTag() {
    // Rimuoviamo i vecchi tag per non duplicarli (mantenendo solo l'input di testo)
    const vecchiTag = wrapperTagDiagnosi.querySelectorAll('.tag-chip');
    vecchiTag.forEach(t => t.remove());

    // Creiamo un blocchetto per ogni malattia nell'array prima dell'input
    diagnosiScelte.forEach((malattia, indice) => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        // Stile moderno e pulito per il tag
        chip.style.cssText = "background-color: #e6f2ff; color: #007BFF; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: bold; display: flex; align-items: center; gap: 8px; border: 1px solid #b3d7ff; user-select: none;";
        chip.innerHTML = `
            ${malattia}
            <span style="cursor:pointer; color:#ff4d4d; font-size: 14px; font-weight:bold; transition: 0.2s;" onmouseover="this.style.color='#cc0000'" onmouseout="this.style.color='#ff4d4d'" onclick="rimuoviTag(${indice})">&times;</span>
        `;
        wrapperTagDiagnosi.insertBefore(chip, inputDiagnosi);
    });
}

// Funzione globale richiamata dalla "x" del tag
window.rimuoviTag = function(indice) {
    diagnosiScelte.splice(indice, 1); // Rimuove l'elemento dall'array
    renderizzaTag();
    ricaricaDati('posti'); // Aggiorna il grafico cartesiano immediatamente
};

// Ascoltatore del tasto INVIO nell'input
inputDiagnosi.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        const valore = inputDiagnosi.value.trim();
        // Se il testo è valido e non è già stato inserito, lo aggiungiamo
        if (valore && !diagnosiScelte.includes(valore)) {
            diagnosiScelte.push(valore);
            inputDiagnosi.value = ''; // Svuota il campo di testo
            renderizzaTag();
            ricaricaDati('posti'); // Lancia la fetch
        }
    }
});


// ==========================================
// 4. RICHIESTA DATI AL SERVER (FETCH AGGIORNATA)
// ==========================================
async function ricaricaDati(sezioneDati) {
    if (sezioneDati !== 'posti') return;
    
    if (typeof mostraSpinner === 'function') mostraSpinner();

    try {
        const valoreInizioRaw = inputDataInizio.value; 
        const valoreFineRaw = inputDataFine.value;

        // Raccogliamo i reparti spuntati
        const repartiScelti = Array.from(document.querySelectorAll('.cb-reparto:checked')).map(cb => cb.value);

        const parametri = new URLSearchParams();
        if (valoreInizioRaw) parametri.append('dataInizio', `${valoreInizioRaw}-01`);
        if (valoreFineRaw) parametri.append('dataFine', `${valoreFineRaw}-01`);
        
        // NUOVO: Spediamo al server tutte le diagnosi inserite nell'array dei tag
        diagnosiScelte.forEach(d => parametri.append('diagnosi', d));
        
        // Spediamo i reparti spuntati
        repartiScelti.forEach(r => parametri.append('reparto', r));

        const url = `/api/analisi-stagionale?${parametri.toString()}`;
        const response = await fetch(url);
        const righeDb = await response.json();

        if (righeDb.length > 0) {
            disegnaGraficoCartesiano(righeDb);
        } else {
            if (chartCartesiano) chartCartesiano.destroy();
        }
    } catch (error) { 
        console.error("Errore caricamento dati:", error); 
    } finally {
        if (typeof nascondiSpinner === 'function') nascondiSpinner();
    }
}

// Collegamento degli eventi stabili
containerReparti.addEventListener('change', () => eseguiConDebounce(() => ricaricaDati('posti'), 400));
inputDataInizio.addEventListener('input', () => eseguiConDebounce(() => ricaricaDati('posti'), 400));
inputDataFine.addEventListener('input', () => eseguiConDebounce(() => ricaricaDati('posti'), 400));
// Nota: Rimosso l'ascoltatore 'input' sulla diagnosi poiché ora l'aggiornamento avviene solo alla pressione del tasto Invio