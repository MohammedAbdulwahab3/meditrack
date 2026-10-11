-- Set when an admin issues a temporary password; the user must choose a new one at next sign-in.
ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
