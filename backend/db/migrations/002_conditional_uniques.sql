-- Apply only after validateUniques.js confirms zero collisions.

-- ALTER TABLE petitions ADD CONSTRAINT petitions_petition_no_key UNIQUE (petition_no);
-- ALTER TABLE firs ADD CONSTRAINT firs_fir_no_key UNIQUE (fir_no);
-- If fir_no is not globally unique, use instead:
-- ALTER TABLE firs ADD CONSTRAINT firs_station_year_no_key UNIQUE (police_station, year, fir_no);
