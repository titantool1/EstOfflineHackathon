CREATE TABLE app.condition_save_receipts(
 owner_id uuid NOT NULL REFERENCES app.users(id),
 attempt_id uuid NOT NULL,
 conversation_id uuid NOT NULL,
 payload_version smallint NOT NULL,
 key_id text NOT NULL,
 nonce bytea NOT NULL,
 ciphertext bytea NOT NULL,
 revision bigint NOT NULL CHECK(revision=1),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,attempt_id)
);
