-- Reviewer score on submissions (optional numeric 0–10)
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS reviewer_score numeric(4,1);

-- AI system instruction (editable from Settings UI)
INSERT INTO app_settings (key, value)
VALUES (
  'ai_system_instruction',
  'You are a retail execution auditor for SuperK. Score the provided store execution photos against the reference images, instructions, and rubric. Respond ONLY with JSON: {"score": <number 0-10>, "assessment": [<3-5 short bullet strings>]}.'
)
ON CONFLICT (key) DO NOTHING;
