select * from mv_analisi_stagionale

where 1 = 1
	and ($1::date is null or mese_riferimento >= $1::date)
	and ($2::date is null or mese_riferimento <= $2::date)
	and ($3::varchar is null or diagnosi_principali ilike $3::varchar)
	and ($4::varchar is null or reparto = $4::varchar)

order by mese_riferimento asc, numero_ricoveri desc

limit 50 offset $5
