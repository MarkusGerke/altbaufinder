CREATE TABLE IF NOT EXISTS classifications (
    building_id VARCHAR(128) NOT NULL PRIMARY KEY,
    classification ENUM('original', 'altbau_entstuckt', 'kein_altbau') NULL,
    year_of_construction INT NULL,
    geometry_json LONGTEXT NULL,
    last_modified BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
