WITH calendario_mensile AS (
    -- Genera tutti i mesi del periodo storico del tuo dataset.
    -- Modifica '2015-12-31' con l'anno massimo presente nei tuoi dati (es. 2019)
    SELECT 
        EXTRACT(YEAR FROM mese_anno)::INT AS anno,
        EXTRACT(MONTH FROM mese_anno)::INT AS mese,
        mese_anno::date AS inizio_mese,
        (mese_anno + INTERVAL '1 month' - INTERVAL '1 day')::date AS fine_mese
    FROM generate_series(
        '2009-01-01'::date, 
        '2025-12-31'::date, 
        '1 month'::interval
    ) mese_anno
),
letti_con_diagnosi AS (
    --Uniamo i letti alle diagnosi SENZA filtri hardcoded e SENZA DISTINCT precoce,
    -- perché ci serve mantenere l'associazione letto-malattia.
    SELECT 
        pl.numero_pl, 
        pl.reparto, 
        pl.entrata, 
        pl.uscita,
        ref.long_title AS diagnosi
    FROM public.posti_letto pl
    JOIN public.diagnoses_icd d ON pl.subject_id = d.subject_id
    JOIN public.d_icd_diagnoses ref ON d.icd_code = ref.icd_code AND d.icd_version = ref.icd_version
)
-- Calcolo finale includendo la colonna "diagnosi" nel GROUP BY.
-- In questo modo il file JSON conterrà la mappa completa per ogni malattia.
SELECT 
    c.anno,
    c.mese,
    ld.reparto,
    ld.diagnosi,
    ROUND(COUNT(DISTINCT ld.numero_pl)::NUMERIC / 30.0, 2) AS posti_medi,
    COUNT(DISTINCT ld.numero_pl) AS numero_ricoveri
FROM calendario_mensile c
JOIN letti_con_diagnosi ld ON ld.entrata::date <= c.fine_mese 
                          AND COALESCE(ld.uscita::date, '2030-12-31'::date) >= c.inizio_mese
GROUP BY c.anno, c.mese, ld.reparto, ld.diagnosi
ORDER BY c.anno, c.mese, ld.reparto;