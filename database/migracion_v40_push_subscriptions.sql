-- migracion_v40_push_subscriptions.sql
-- Web Push subscriptions (own VAPID-based push, no third-party service).
-- One row per browser/device a staff user opted in from; endpoint is unique
-- because the browser issues a fresh one per registration.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  staff_user_id  BIGINT UNSIGNED NOT NULL,
  endpoint       VARCHAR(500)    NOT NULL,
  p256dh         VARCHAR(255)    NOT NULL,
  auth           VARCHAR(255)    NOT NULL,
  user_agent     VARCHAR(255)    NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_subscriptions_endpoint (endpoint(255)),
  KEY ix_push_subscriptions_staff_user (staff_user_id),
  CONSTRAINT fk_push_subscriptions_staff_user
    FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
