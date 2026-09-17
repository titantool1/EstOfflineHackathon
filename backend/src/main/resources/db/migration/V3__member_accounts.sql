-- Existing UUID identities and personal facts remain untouched.
CREATE TABLE app.user_accounts (
 user_id uuid PRIMARY KEY REFERENCES app.users(id),
 email varchar(254) NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
 password_hash text NOT NULL,
 nickname varchar(20) NOT NULL CHECK (length(btrim(nickname)) > 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Nicknames are display labels, not unique account identifiers.
