-- Imagini extrase din documente (capturi de ecran din .docx, cadre din video),
-- atașate fragmentelor în care apar. Fișierele stau pe disc în MEDIA_DIR.

CREATE TABLE media (
  id BIGSERIAL PRIMARY KEY,
  version_id BIGINT NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  file_path TEXT NOT NULL, -- relativ la MEDIA_DIR
  mime TEXT NOT NULL,
  UNIQUE (version_id, seq)
);

ALTER TABLE chunks ADD COLUMN media_ids BIGINT[] NOT NULL DEFAULT '{}';
