-- Neue Nutzer: can_upload_photos = 0 bis Freigabe durch Account-Approver.
-- Bestehende Zeilen: per DEFAULT 1 (Migration einmalig auf dem Server ausführen oder ensure_users_can_upload_photos in auth_helpers.php).

ALTER TABLE users
  ADD COLUMN can_upload_photos TINYINT(1) NOT NULL DEFAULT 1;
