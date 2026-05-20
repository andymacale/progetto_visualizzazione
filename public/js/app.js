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
const corpoTabellaPosti = document.getElementById('corpo-tabella-posti');

const menuReparti = document.getElementById('menu-reparti');

const inputFarmaco = document.getElementById('nome-farmaco');
const inputQuantita = document.getElementById('quantita');

let sezioneAttiva = null;

async function caricaReparti() {
    try {
        const response = await fetch('/api/reparti');
        const reparti = await response.json();
        
        menuReparti.innerHTML = '<option value="" selected>Tutti i reparti</option>';
        reparti.forEach(r => {
            menuReparti.innerHTML += `<option value="${r.reparto}">${r.reparto}</option>`;
        });
    } catch (error) {
        console.error("Errore caricamento reparti", error);
        menuReparti.innerHTML = '<option value="">Errore di rete</option>';
    }
}
caricaReparti();

function commutaVisualizzazione(tipo) {
    if (sezioneAttiva === tipo) {
        sezioneSplit.classList.add('nascosto');
        btnPosti.classList.remove('selezionato');
        btnMedicinali.classList.remove('selezionato');
        sezioneAttiva = null;
        return;
    }

    sezioneAttiva = tipo;
    sezioneSplit.classList.remove('nascosto');

    if (tipo === 'posti') {
        btnPosti.classList.add('selezionato');
        btnMedicinali.classList.remove('selezionato');
        
        formPosti.style.display = 'block';
        risPosti.style.display = 'block';
        formMedicinali.style.display = 'none';
        risMedicinali.style.display = 'none';

        ricaricaDati('posti');

    } else if (tipo === 'medicinali') {
        btnMedicinali.classList.add('selezionato');
        btnPosti.classList.remove('selezionato');
        
        formMedicinali.style.display = 'block';
        risMedicinali.style.display = 'block';
        formPosti.style.display = 'none';
        risPosti.style.display = 'none';
    }
}

btnPosti.addEventListener('click', () => commutaVisualizzazione('posti'));
btnMedicinali.addEventListener('click', () => commutaVisualizzazione('medicinali'));

let paginaAttuale = 0;
let inCaricamento = false;
let fineDati = false; 
let observer = null; 

async function ricaricaDati(sezioneDati, nuovaRicerca = true) {
    try {
        if (sezioneDati === 'posti') {
            
            if (inCaricamento || (!nuovaRicerca && fineDati)) return;
            inCaricamento = true;

            const valoreInizioRaw = inputDataInizio.value; 
            const valoreFineRaw = inputDataFine.value;
            const diagnosi = inputDiagnosi.value || '';
            const reparto = menuReparti.value || '';

            const dataInizio = valoreInizioRaw ? `${valoreInizioRaw}-01` : ''; 
            const dataFine = valoreFineRaw ? `${valoreFineRaw}-01` : '';

            const contenitoreCalendario = document.getElementById('contenitore-calendario');

            if (nuovaRicerca) {
                paginaAttuale = 0;
                fineDati = false;
                
                if (observer) observer.disconnect();

                contenitoreCalendario.innerHTML = `
                    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; padding: 50px;">
                        <img src="/img/croce.png" alt="Caricamento..." style="width: 50px; height: 50px; animation: rotazione 2s linear infinite;">
                        <p style="color: #007BFF; font-weight: bold; margin-top: 15px;">Costruzione calendario in corso...</p>
                    </div>
                `;
            }

            const url = `/api/analisi-stagionale?dataInizio=${dataInizio}&dataFine=${dataFine}&diagnosi=${diagnosi}&reparto=${encodeURIComponent(reparto)}&page=${paginaAttuale}`;
            const response = await fetch(url);
            
            if (!response.ok) throw new Error('Errore server');
            const righeDb = await response.json();

            if (righeDb.length < 50) {
                fineDati = true;
            }

            if (nuovaRicerca) {
                contenitoreCalendario.innerHTML = ''; 
            } else {
                const vecchioSensore = document.getElementById('sensore-scroll');
                if (vecchioSensore) vecchioSensore.remove();
            }

            if (nuovaRicerca && righeDb.length === 0) {
                contenitoreCalendario.innerHTML = '<div style="text-align:center; padding: 50px; color: #666; font-style: italic;">Nessun record trovato con i filtri inseriti.</div>';
                inCaricamento = false;
                return;
            }

            let griglia = document.getElementById('griglia-calendario');
            if (!griglia) {
                griglia = document.createElement('div');
                griglia.id = 'griglia-calendario';
                griglia.style.display = 'grid';
                griglia.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))';
                griglia.style.gap = '20px';
                contenitoreCalendario.appendChild(griglia);
            }

            righeDb.forEach(riga => {
                const opzioniData = { month: 'long', year: 'numeric' };
                const meseAnno = new Date(riga.mese_riferimento).toLocaleDateString('it-IT', opzioniData).toUpperCase();

                const card = document.createElement('div');
                card.style.backgroundColor = '#fff';
                card.style.border = '1px solid #e0e0e0';
                card.style.borderRadius = '10px';
                card.style.overflow = 'hidden';
                card.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)';
                
                card.innerHTML = `
                    <div style="background-color: #007BFF; color: white; text-align: center; padding: 12px; font-weight: bold; font-size: 1.1em; letter-spacing: 1px;">
                         ${meseAnno}
                    </div>
                    <div style="padding: 15px; font-size: 0.95em; line-height: 1.6;">
                        <div style="margin-bottom: 8px;">
                            <span style="color: #555; font-size: 0.85em; text-transform: uppercase;">Reparto</span><br>
                            <strong>${riga.reparto || 'Tutti i reparti'}</strong>
                        </div>
                        <div style="margin-bottom: 12px;">
                            <span style="color: #555; font-size: 0.85em; text-transform: uppercase;">Diagnosi Principale</span><br>
                            <strong>${riga.diagnosi_principali}</strong>
                        </div>
                        <hr style="border: 0; border-top: 1px dashed #ccc; margin: 12px 0;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <span>Ricoveri:</span> <strong>${riga.numero_ricoveri}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <span>Degenza Media:</span> <strong>${riga.media_ore_degenza} h</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px; background: #eef6ff; padding: 4px; border-radius: 4px;">
                            <span>Letti Occupati:</span> <strong style="color: #007BFF; font-size: 1.1em;">${riga.media_letti_occupati}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-top: 5px; color: ${riga.numero_decessi > 0 ? 'red' : 'inherit'};">
                            <span>Decessi:</span> <strong>${riga.numero_decessi}</strong>
                        </div>
                    </div>
                `;
                griglia.appendChild(card);
            });

            if (!fineDati) {
                const sensore = document.createElement('div');
                sensore.id = 'sensore-scroll';
                sensore.innerHTML = '<p style="text-align:center; color:#888; grid-column: 1 / -1; margin-top: 20px;">Caricamento altre righe...</p>';
                griglia.appendChild(sensore);

                observer = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting && !inCaricamento) {
                        paginaAttuale++; 
                        ricaricaDati('posti', false); 
                    }
                });

                observer.observe(sensore);
            }

            inCaricamento = false;

        }
    } catch (error) {
        console.error("Errore:", error);
        inCaricamento = false;
    }
}


function debounceSicuro(callback, ritardo) {
    if (typeof eseguiConDebounce === 'function') {
        eseguiConDebounce(callback, ritardo);
    } else {
        clearTimeout(window.mioTimerFallback);
        window.mioTimerFallback = setTimeout(callback, ritardo);
    }
}

menuReparti.addEventListener('change', () => debounceSicuro(() => ricaricaDati('posti', true), 500));
inputDataInizio.addEventListener('input', () => debounceSicuro(() => ricaricaDati('posti', true), 500));
inputDataFine.addEventListener('input', () => debounceSicuro(() => ricaricaDati('posti', true), 500));
inputDiagnosi.addEventListener('input', () => debounceSicuro(() => ricaricaDati('posti', true), 500));


function debounceSicuro(callback, ritardo) {
    if (typeof eseguiConDebounce === 'function') {
        eseguiConDebounce(callback, ritardo);
    } else {
        clearTimeout(window.mioTimerFallback);
        window.mioTimerFallback = setTimeout(callback, ritardo);
    }
}

menuReparti.addEventListener('change', () => debounceSicuro(() => ricaricaDati('posti'), 500));
inputDataInizio.addEventListener('input', () => debounceSicuro(() => ricaricaDati('posti'), 500));
inputDataFine.addEventListener('input', () => debounceSicuro(() => ricaricaDati('posti'), 500));
inputDiagnosi.addEventListener('input', () => debounceSicuro(() => ricaricaDati('posti'), 500));