DO $$
DECLARE
  employee_row RECORD;
  candidate INTEGER;
BEGIN
  FOR employee_row IN
    SELECT id, code FROM employees WHERE code ~ '^E[0-9]{3}$' ORDER BY code
  LOOP
    candidate := substring(employee_row.code FROM 2)::INTEGER;
    WHILE candidate <= 9999 AND EXISTS (
      SELECT 1 FROM employees e
      WHERE e.code = lpad(candidate::TEXT, 4, '0') AND e.id <> employee_row.id
    ) LOOP
      candidate := candidate + 1;
    END LOOP;
    IF candidate > 9999 THEN
      RAISE EXCEPTION 'Could not convert employee code % to a unique four-digit code', employee_row.code;
    END IF;
    UPDATE employees SET code = lpad(candidate::TEXT, 4, '0') WHERE id = employee_row.id;
  END LOOP;
END $$;
--> statement-breakpoint
INSERT INTO employment_types (code, name, is_active)
VALUES ('probation', 'ทดลองงาน', true)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = true;
--> statement-breakpoint
UPDATE employment_types
SET name = CASE code
  WHEN 'full_time' THEN 'ประจำ'
  WHEN 'contract' THEN 'สัญญา'
  WHEN 'daily' THEN 'รายวัน'
  WHEN 'probation' THEN 'ทดลองงาน'
  ELSE name
END,
is_active = true
WHERE code IN ('full_time', 'contract', 'daily', 'probation');
--> statement-breakpoint
INSERT INTO employment_statuses (name)
VALUES ('ปฏิบัติงาน'), ('พ้นสภาพ')
ON CONFLICT (name) DO NOTHING;
--> statement-breakpoint
UPDATE employees e
SET employment_type_id = probation.id
FROM employment_statuses old_status, employment_types probation
WHERE e.employment_status_id = old_status.id
  AND lower(old_status.name) IN ('ทดลองงาน', 'probation', 'trial', 'trial period')
  AND probation.code = 'probation';
--> statement-breakpoint
UPDATE employees e
SET deleted_at = COALESCE(e.deleted_at, now())
WHERE e.employment_status_id IN (
  SELECT id FROM employment_statuses
  WHERE lower(name) IN ('พ้นสภาพ', 'resigned', 'terminated', 'offboarded', 'ลาออก')
);
--> statement-breakpoint
UPDATE employees e
SET employment_status_id = CASE WHEN e.deleted_at IS NULL THEN active.id ELSE former.id END
FROM employment_statuses active, employment_statuses former
WHERE active.name = 'ปฏิบัติงาน' AND former.name = 'พ้นสภาพ';
--> statement-breakpoint
UPDATE users
SET is_active = false, updated_at = now()
WHERE employee_id IN (SELECT id FROM employees WHERE deleted_at IS NOT NULL);
--> statement-breakpoint
DELETE FROM employment_statuses
WHERE lower(name) IN ('ทดลองงาน', 'ลาพัก', 'probation', 'trial', 'trial period', 'on leave', 'leave');
--> statement-breakpoint
UPDATE employment_statuses SET is_active = true WHERE name IN ('ปฏิบัติงาน', 'พ้นสภาพ');
