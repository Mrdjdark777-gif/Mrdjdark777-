CREATE TABLE IF NOT EXISTS tt_members(id TEXT PRIMARY KEY,nickname TEXT NOT NULL,recovery_hash TEXT UNIQUE NOT NULL,created_at INTEGER NOT NULL,banned INTEGER NOT NULL DEFAULT 0,rules TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tt_member_sessions(hash TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES tt_members(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tt_comments(id TEXT PRIMARY KEY,live_id TEXT NOT NULL,member_id TEXT NOT NULL REFERENCES tt_members(id) ON DELETE CASCADE,body TEXT NOT NULL,created_at INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'published',reason TEXT);
CREATE INDEX IF NOT EXISTS tt_comments_live ON tt_comments(live_id,created_at);
CREATE TABLE IF NOT EXISTS tt_comment_reports(comment_id TEXT NOT NULL REFERENCES tt_comments(id) ON DELETE CASCADE,reporter_id TEXT NOT NULL REFERENCES tt_members(id) ON DELETE CASCADE,reason TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(comment_id,reporter_id));
CREATE TABLE IF NOT EXISTS tt_member_blocks(member_id TEXT NOT NULL REFERENCES tt_members(id) ON DELETE CASCADE,blocked_id TEXT NOT NULL REFERENCES tt_members(id) ON DELETE CASCADE,PRIMARY KEY(member_id,blocked_id));
CREATE TABLE IF NOT EXISTS tt_community_limits(key TEXT PRIMARY KEY,n INTEGER NOT NULL,expires INTEGER NOT NULL);
