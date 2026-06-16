const spinnerDb = document.getElementById('spinner-db');
let timerQuery;

function mostraSpinner() {
    if (spinnerDb) {
        spinnerDb.classList.remove('nascosto');
    }
}

function nascondiSpinner() {
    if (spinnerDb) {
        spinnerDb.classList.add('nascosto');
    }
}

function eseguiConDebounce(callback, ritardo = 500) {
    mostraSpinner();
    clearTimeout(timerQuery);
    
    timerQuery = setTimeout(() => {
        callback(); 
    }, ritardo);
}
