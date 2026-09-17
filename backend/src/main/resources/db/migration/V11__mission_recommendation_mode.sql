ALTER TABLE app.recommendation_batch
 ADD COLUMN request_mode text NOT NULL DEFAULT 'interests'
 CHECK (request_mode IN ('interests','general'));
