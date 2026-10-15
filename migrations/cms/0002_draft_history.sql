ALTER TABLE cms_drafts ADD COLUMN actor TEXT NOT NULL DEFAULT '';
CREATE TRIGGER IF NOT EXISTS cms_revision_insert AFTER INSERT ON cms_drafts
BEGIN
  INSERT INTO cms_revisions(path, source, base_sha, revision, saved_at, actor)
  VALUES (NEW.path, NEW.source, NEW.base_sha, NEW.revision, NEW.saved_at, NEW.actor);
END;
CREATE TRIGGER IF NOT EXISTS cms_revision_update AFTER UPDATE ON cms_drafts
BEGIN
  INSERT INTO cms_revisions(path, source, base_sha, revision, saved_at, actor)
  VALUES (NEW.path, NEW.source, NEW.base_sha, NEW.revision, NEW.saved_at, NEW.actor);
END;
