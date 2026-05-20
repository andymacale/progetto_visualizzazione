select distinct first_careunit as reparto
from icustays
--where first_careunit is not null
order by first_careunit asc