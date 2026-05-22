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
    and ($1::integer is null or extract(year from mese_riferimento) >= $1::integer)
    and ($2::integer is null or extract(year from mese_riferimento) <= $2::integer)
    and ($4::varchar[] is null or reparto = any($4::varchar[]))
    and (
        -- Controlla se la colonna della vista contiene ALMENO UNA delle malattie digitate nei tag scritti a mano
        ($3::varchar[] is not null and diagnosi_principali ilike any($3::varchar[]))
        or
        -- Se non hai scritto nessun tag, mostra la selezione top 5 di default della vista
        ($3::varchar[] is null and diagnosi_principali in (select diagnosi_principali from top_malattie))
    )
order by mese_riferimento asc, numero_ricoveri desc;    