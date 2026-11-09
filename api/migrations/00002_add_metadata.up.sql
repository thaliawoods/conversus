ALTER TABLE users
    ADD metadata TEXT NOT NULL DEFAULT '';

ALTER TABLE channels
    ADD metadata TEXT NOT NULL DEFAULT '';

ALTER TABLE messages
    ADD metadata TEXT NOT NULL DEFAULT '';
