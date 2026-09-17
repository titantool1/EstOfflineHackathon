CREATE TABLE app.user_interests (
 user_id uuid NOT NULL REFERENCES app.users(id),
 interest_id text NOT NULL REFERENCES app.catalog_interest(interest_id),
 selected_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id, interest_id)
);
