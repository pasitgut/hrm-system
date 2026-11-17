-- 0017 declared the salary-slip foreign keys inline, so PostgreSQL named them "<table>_<column>_fkey".
-- lib/db/schema.ts (and drizzle-kit) name them "<table>_<column>_<target>_<column>_fk". Rename them so
-- the database matches the schema. Guarded: a database that already has the new name is left alone.
DO $$
DECLARE
  renames text[][] := ARRAY[
    ['salary_slip_imports',  'salary_slip_imports_created_by_fkey',  'salary_slip_imports_created_by_users_id_fk'],
    ['salary_slips',         'salary_slips_employee_id_fkey',        'salary_slips_employee_id_employees_id_fk'],
    ['salary_slip_versions', 'salary_slip_versions_slip_id_fkey',    'salary_slip_versions_slip_id_salary_slips_id_fk'],
    ['salary_slip_versions', 'salary_slip_versions_import_id_fkey',  'salary_slip_versions_import_id_salary_slip_imports_id_fk'],
    ['salary_slip_versions', 'salary_slip_versions_created_by_fkey', 'salary_slip_versions_created_by_users_id_fk']
  ];
  item text[];
BEGIN
  FOREACH item SLICE 1 IN ARRAY renames LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = item[2] AND conrelid = to_regclass(item[1])) THEN
      EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', item[1], item[2], item[3]);
    END IF;
  END LOOP;
END $$;
