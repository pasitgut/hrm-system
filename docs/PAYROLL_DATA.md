# Payroll data source

The Payroll page reads salary-slip records stored in the HRM database. Users add or update those records through the salary-slip Excel import workflow. The import preview and committed payroll data live in the database; the original upload archive is temporary on Vercel.

The Social Security `.xlsx` export joins the selected salary-slip period to the employee profile. Columns A–F are citizen ID, prefix, first name, last name, wage, and social contribution. Wage comes from `data.incomes.salary`; contribution comes from `data.deductions.social_security`. Slip amounts are stored as integer satang and converted to baht in the workbook. Citizen ID, prefix, first name, and last name come from the employee record.

The export route uses the Node.js runtime and creates the workbook in memory. Deployments need the database and application session environment variables from `.env.example`. On Vercel, source uploads use the function's temporary directory unless `SALARY_SLIPS_STORAGE_DIR` is set.
