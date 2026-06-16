# Progetto di Visualizzazione delle Informazioni
## Andrea Macale (matricola 560793)

L'applicazione è un sistema di visualizzazione delle informazioni implementato su interfaccia Web, che rappresenta l'occupazione media mensile dei letti, inserendo un intervallo di anni. L'utente finale può inoltre usare dei filtri, inserendo uno o più reparti; ed una o più diagnosi. Come sistema di visualizzazione, è stato implementato un'istogramma a pila, per poter confrontare l'occupazione letti della stessa diagnosi, mese e reparto in due o più anni differenti.
![istogramma](istogramma.png)
## Linguaggi utilizzati
I linguaggi utilizzati sono i seguenti:
* per il backend, è stato usato Node.js ed Express;
* per il frontend, HTML + CSS e Javascript;
* per la visualizzazione, la libreria Chart.js;
* per la base di dati, due file `.csv`.
## Architettura
All'avvio, siccome la quantità di dati è enorme, è stato scelto un preprocessing offline, che legge `dataset.csv` ed elabora un file `.json` temporaneo, che calcola i posti medi ed il numero di ricoveri. In particolare, il dataset è composto nel modo seguente.
| pl_id | subject_id | numero_pl | tipo | data | reparto | diagnosi
| :---: | :---: | :---: | :---: | :---: | :---: |:---: | 
| 1 | 19283977 | 1 | IN | 2009-01-01 01:32:20 | Medical/Surgical Intensive Care Unit (MICU/SICU) | {"Pneumonitis due to inhalation of food or vomitus","Depressive disorder, ..."}
| Dashboard | Grafici in tempo reale | In corso |