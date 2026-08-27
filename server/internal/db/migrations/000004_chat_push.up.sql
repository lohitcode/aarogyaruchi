-- 000004_chat_push: admin↔customer support chat + web-push subscriptions.
--
-- One support thread per customer (admin-side inbox model). Web-push
-- subscriptions are stored per role so both customers and admins can be
-- notified through the browser push service when their socket is down.

BEGIN;

CREATE TABLE chat_threads (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_by_user_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_by_admin_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_messages (
    id BIGSERIAL PRIMARY KEY,
    thread_id BIGINT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('user', 'admin')),
    sender_id BIGINT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_chat_messages_thread ON chat_messages(thread_id, id);

CREATE TABLE push_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    admin_id BIGINT REFERENCES admins(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (role = 'user' AND user_id IS NOT NULL) OR
        (role = 'admin' AND admin_id IS NOT NULL)
    )
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_admin ON push_subscriptions(admin_id);

COMMIT;
