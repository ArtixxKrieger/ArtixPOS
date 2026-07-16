-- Persist the last-selected branch per user so it survives logout/login.
-- After running this migration, switch-branch writes to this column and
-- the login endpoint returns the correct branch on the next sign-in.
ALTER TABLE users ADD COLUMN IF NOT EXISTS active_branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL;
