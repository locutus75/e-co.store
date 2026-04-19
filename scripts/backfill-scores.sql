UPDATE "ProductAiAnalysis"
SET score = (("structuredData"::jsonb)->>'score')::int
WHERE "structuredData" IS NOT NULL AND score IS NULL;
