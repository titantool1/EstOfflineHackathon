CREATE TABLE app.recommendation_batch (
 batch_id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES app.users(id),
 client_request_id uuid NOT NULL,
 requested_limit integer NOT NULL CHECK (requested_limit BETWEEN 1 AND 20),
 algorithm_version text NOT NULL,
 selection_basis text NOT NULL CHECK (selection_basis IN ('selected_interests','catalog_exploration')),
 created_at timestamptz NOT NULL,
 UNIQUE (user_id, client_request_id),
 UNIQUE (batch_id, user_id)
);

CREATE TABLE app.recommendation_item (
 item_id uuid PRIMARY KEY,
 batch_id uuid NOT NULL,
 user_id uuid NOT NULL,
 position integer NOT NULL CHECK (position >= 0),
 program_key text NOT NULL,
 action_id text NOT NULL,
 identity_basis text NOT NULL,
 program_title text NOT NULL,
 program_summary text NOT NULL,
 program_status_raw text NOT NULL,
 condition_count integer NOT NULL CHECK (condition_count >= 0),
 matched_interest_ids text[] NOT NULL,
 related_place_count integer NOT NULL CHECK (related_place_count >= 0),
 UNIQUE (batch_id, position),
 UNIQUE (batch_id, program_key, action_id),
 UNIQUE (batch_id, user_id, item_id),
 FOREIGN KEY (batch_id, user_id) REFERENCES app.recommendation_batch(batch_id, user_id),
 FOREIGN KEY (program_key, action_id) REFERENCES app.catalog_action(program_key, action_id)
);

CREATE TABLE app.mission_event (
 event_id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES app.users(id),
 client_event_id uuid NOT NULL,
 batch_id uuid NOT NULL,
 item_id uuid NOT NULL,
 event_type text NOT NULL CHECK (event_type IN
  ('impression','detail_view','accepted','self_reported_completed','map_open','route_open')),
 occurred_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL,
 UNIQUE (user_id, client_event_id),
 FOREIGN KEY (batch_id, user_id, item_id)
  REFERENCES app.recommendation_item(batch_id, user_id, item_id)
);

CREATE UNIQUE INDEX mission_event_one_impression
 ON app.mission_event(user_id, batch_id, item_id)
 WHERE event_type = 'impression';
