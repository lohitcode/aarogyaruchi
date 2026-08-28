-- 000006_notification_states: last-reported browser notification permission
-- per subject (customer or admin).
--
-- The clients report Notification.permission on every app open (and after any
-- change), which is the only truthful signal for "did this person allow
-- notifications". Push subscription rows alone can't distinguish "never asked"
-- from "asked and blocked" — and browsers revoke permission silently while
-- the subscription row lingers until the next send prunes it.

BEGIN;

CREATE TABLE notification_states (
    id BIGSERIAL PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    admin_id BIGINT REFERENCES admins(id) ON DELETE CASCADE,
    permission TEXT NOT NULL CHECK (permission IN ('granted', 'denied', 'default', 'unsupported')),
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (role = 'user' AND user_id IS NOT NULL AND admin_id IS NULL) OR
        (role = 'admin' AND admin_id IS NOT NULL AND user_id IS NULL)
    ),
    -- One row per subject. NULLS NOT DISTINCT collapses the NULL half of the
    -- (user_id, admin_id) pair so ON CONFLICT (user_id, admin_id) works.
    CONSTRAINT notification_states_subject_uk UNIQUE NULLS NOT DISTINCT (user_id, admin_id)
);

COMMIT;
