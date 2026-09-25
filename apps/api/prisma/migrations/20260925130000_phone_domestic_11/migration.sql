-- 历史数据：+86 存储改为 11 位大陆手机号
UPDATE "users"
SET phone = RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 11)
WHERE phone IS NOT NULL
  AND LENGTH(REGEXP_REPLACE(phone, '\D', '', 'g')) >= 11;

UPDATE "verification_codes"
SET target = RIGHT(REGEXP_REPLACE(target, '\D', '', 'g'), 11)
WHERE channel = 'phone';
