with top_malattie as (
    select diagnosi_principali 
    from mv_analisi_stagionale
    where ($4::varchar[] is null or reparto = any($4::varchar[]))
    group by diagnosi_principali
    order by sum(numero_ricoveri) desc
    limit 5
)
select * from mv_analisi_stagionale
where 1 = 1
    and ($1::date is null or mese_riferimento >= $1::date)
    and ($2::date is null or mese_riferimento <= $2::date)
    and ($4::varchar[] is null or reparto = any($4::varchar[]))
    and (
        -- Se l'array di tag scritti a mano NON è vuoto, confrontali tutti in modalità ILIKE
        ($3::varchar[] is not null and diagnosi_principali ilike any($3::varchar[]))
        or
        -- Se non hai scritto nessun tag, mostra le top 5 di default
        ($3::varchar[] is null and diagnosi_principali in (select diagnosi_principales from top_malattie))
    )
order by mese_riferimento asc, numero_ricoveri desc;