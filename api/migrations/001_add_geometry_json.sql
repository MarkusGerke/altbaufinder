-- Einmalig auf dem Server ausführen (z. B. phpMyAdmin / mysql CLI), wenn die Tabelle bereits existiert.
ALTER TABLE classifications  MODIFY COLUMN building_id VARCHAR(128) NOT NULL,
  ADD COLUMN geometry_json LONGTEXT NULL COMMENT 'GeoJSON geometry for map overlay' AFTER year_of_construction;
