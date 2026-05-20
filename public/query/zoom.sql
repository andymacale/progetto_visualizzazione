with scarti as (
select subject_id,
	   (cast(substring(anchor_year_group from 1 for 4) as integer) + 1) - anchor_year::integer as scarto
from patients),

	ricoveri as (
	select p.subject_id,
			p.dod,
			i.first_careunit as reparto,
			i.stay_id,
			dc.long_title as diagnosi_principali,
			(i.intime + (s.scarto || ' years')::interval)::date as ingresso,
			(i.outtime + (s.scarto || ' years')::interval)::date as uscita,
			(p.dod + (s.scarto || ' years')::interval)::date as decesso
	from diagnoses_icd d
	join d_icd_diagnoses dc on d.icd_code = dc.icd_code and d.icd_version = dc.icd_version
	join icustays i on d.hadm_id = i.hadm_id and d.subject_id = i.subject_id
	join scarti s on s.subject_id = d.subject_id
	join patients p on p.subject_id = d.subject_id
	where d.seq_num = 1
),
calendario as (
	select stay_id,
			reparto,
			diagnosi_principali,
			ingresso,
			decesso,
			generate_series(ingresso, uscita, '1 day'::interval)::date as data_osservazione
	from ricoveri
)

select 	
	   data_osservazione,
	   reparto,
	   diagnosi_principali,
	   count(distinct stay_id) as letti_occupati,
	   sum(case when data_osservazione = ingresso then 1 else 0 end) as nuovi_ingressi,
	   sum(case when data_osservazione = decesso then 1 else 0 end) as decessi
	   
from calendario

where 1 = 1
	and data_osservazione between '2020-01-01' and '2020-03-31'
	and diagnosi_principali like 'COVID-19'

group by data_osservazione, reparto, diagnosi_principali

order by data_osservazione asc