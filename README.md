# Progetto di Visualizzazione delle Informazioni
## Andrea Macale (matricola 560793)

L'applicazione è un sistema di visualizzazione delle informazioni implementato su interfaccia Web, che rappresenta l'occupazione media mensile dei letti, inserendo un intervallo di anni. L'utente finale può inoltre usare dei filtri, inserendo uno o più reparti; ed una o più diagnosi. Come sistema di visualizzazione, è stato implementato un'istogramma a pila, per poter confrontare l'occupazione letti della stessa diagnosi, mese e reparto in due o più anni differenti.
![istogramma](immagini/istogramma.png)
## Linguaggi utilizzati
I linguaggi utilizzati sono i seguenti:
* per il backend, è stato usato Node.js ed Express;
* per il frontend, HTML + CSS e Javascript;
* per la visualizzazione, la libreria Chart.js;
* per la base di dati, due file `.csv`.
## Architettura
All'avvio, siccome la quantità di dati è enorme, è stato scelto un preprocessing offline, che legge `dataset.csv` ed elabora un file `.json` temporaneo, che calcola i posti medi ed il numero di ricoveri. Di seguito, sono riportate i primi 13 record, per comprendere il funzionamento dell'algoritmo.
![dataset](immagini/dataset.png)
In particolare, ogni ingresso per reparto gli viene identificativo un numero posto letto progressivo con tipo IN, mentre ad ogni uscita viene preso l'identificativo  con tipo OUT, così quel posto letto può essere riutilizzato per un nuovo paziente. Poi per ogni giorno e reparto, vengono presi i record a cui gli viene sommato 1 se il tipo è IN, sottratto 1 se il tipo è OUT, ottenendo così il numero di posti letto occupati per quel giorno. Infine, per il mese di riferimento, si sommano tutti questi valori ottenuti e si divide per il numero di giorni di quel mese (es. gennaio 31, febbraio 28/29, ecc.), calcolando il numero di posti letto medi occupati per quel mese.

