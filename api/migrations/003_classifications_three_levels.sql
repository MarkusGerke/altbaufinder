-- Drei Altbau-Stufen + optional kein_altbau; Migration von der alten 5er-Skala.
-- Vor Ausführung: Backup der DB.

ALTER TABLE classifications
  MODIFY COLUMN classification VARCHAR(32) NULL;

UPDATE classifications SET classification = 'altbau_gruen' WHERE classification IN ('stuck_perfekt', 'stuck_schoen');
UPDATE classifications SET classification = 'altbau_gelb' WHERE classification IN ('stuck_mittel', 'stuck_teilweise');
UPDATE classifications SET classification = 'altbau_rot' WHERE classification = 'entstuckt';

-- Hinweis: ältere Migrationen setzten 'kein_altbau' auf NULL; dort sind Daten nicht wiederherstellbar.
