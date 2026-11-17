import datetime as dt
import re
import unittest

from appsheet_migration.pipeline import convert
from appsheet_migration.report import Report
from appsheet_migration.sql import build_script
from appsheet_migration.sql import literals as lit

from .helpers import employee_row, serial, sheet, time_fraction

D = dt.date


def sample_sheets():
    return {
        "ข้อมูลพนักงาน": sheet(
            employee_row("2005", "ชาญธวัช เจริญธรรมโชติ", D(2020, 6, 25), department="ช่างตรวจ", position="หัวหน้างาน", holidays="Monday", email="max@x.com"),
        ),
        "ข้อมูลการทำโอที": sheet(
            {0: serial(D(2025, 11, 21)), 1: time_fraction(17), 2: time_fraction(19), 4: "ชาญธวัช เจริญธรรมโชติ", 5: "O'Neil's job", 6: "อนุมัติแล้ว"},
        ),
        "ข้อมูลการลา": sheet(
            {0: "ชาญธวัช เจริญธรรมโชติ", 1: "ลากิจ", 2: "ลาเต็มวัน", 3: serial(D(2026, 3, 5)), 4: serial(D(2026, 3, 5)), 7: "ยังไม่ได้ยืนยัน", 8: 2005.0},
        ),
        "ข้อมูลการยืมทรัพย์สิน": sheet(
            {0: "42d965e1-d3ca-454b-8562-295cc537a50e", 1: serial(D(2026, 9, 18), 8, 23), 3: "หัวหน้างาน", 4: 2005.0, 6: serial(D(2026, 9, 18)), 8: "เสื้อกั๊ก|1|", 10: "อนุมัติ"},
        ),
    }


def generate(conflict="update"):
    data = convert(sample_sheets(), Report())
    return build_script(data, conflict, "sample.xlsx"), data


class LiteralTests(unittest.TestCase):
    def test_text_escapes_quotes_and_null(self):
        self.assertEqual(lit.text("O'Neil"), "'O''Neil'")
        self.assertEqual(lit.text(None), "NULL")

    def test_dates_and_arrays(self):
        self.assertEqual(lit.date(D(2026, 3, 5)), "'2026-03-05'")
        self.assertEqual(lit.timestamptz(dt.datetime(2026, 3, 5, 17, 0)), "'2026-03-05 17:00:00+07'")
        self.assertEqual(lit.int_array([1, 2]), "ARRAY[1,2]::integer[]")
        self.assertEqual(lit.int_array([]), "ARRAY[]::integer[]")

    def test_inline_tuple(self):
        self.assertEqual(lit.inline_tuple("personal", "ลากิจ", 6), "('personal','ลากิจ',6)")


class ScriptTests(unittest.TestCase):
    def test_runs_in_one_transaction_with_every_section(self):
        sql, _ = generate()
        self.assertEqual((sql.count("BEGIN;"), sql.count("COMMIT;")), (1, 1))
        for table in ("employees", "overtime_requests", "leave_requests", "asset_requests", "asset_request_items", "asset_request_events"):
            self.assertIn(f"INSERT INTO {table}", sql)

    def test_is_deterministic_so_reimports_do_not_duplicate(self):
        self.assertEqual(generate()[0], generate()[0])

    def test_no_overtime_type_column_is_written(self):
        self.assertNotIn("overtime_type", generate()[0])

    def test_each_stage_table_checks_employees_before_inserting(self):
        sql, _ = generate()
        for label in ("OT", "Leave", "Asset"):
            self.assertIn(f"RAISE EXCEPTION '{label} import stopped", sql)

    def test_quotes_in_text_are_escaped(self):
        self.assertIn("'O''Neil''s job'", generate()[0])

    def test_conflict_mode_switches_the_employee_clause(self):
        self.assertIn("DO UPDATE SET", generate("update")[0])
        skip = generate("skip")[0]
        self.assertNotIn("DO UPDATE SET", skip)
        self.assertIn("ON CONFLICT (code) DO NOTHING", skip)

    def test_stage_rows_have_the_declared_number_of_columns(self):
        sql, _ = generate()
        expected = {"emp_stage": 16, "ot_stage": 8, "leave_stage": 11, "asset_stage": 14}
        for stage, columns in expected.items():
            block = re.search(rf"INSERT INTO {stage} VALUES\n(.*?);\n", sql, re.S).group(1)
            self.assertEqual(self._top_level_commas(block.strip().rstrip(",")) + 1, columns, stage)

    @staticmethod
    def _top_level_commas(tuple_sql: str) -> int:
        depth, in_string, commas, i = 0, False, 0, 0
        while i < len(tuple_sql):
            ch = tuple_sql[i]
            if in_string:
                if ch == "'":
                    if tuple_sql[i + 1:i + 2] == "'":
                        i += 1
                    else:
                        in_string = False
            elif ch == "'":
                in_string = True
            elif ch in "([":
                depth += 1
            elif ch in ")]":
                depth -= 1
            elif ch == "," and depth == 1:
                commas += 1
            i += 1
        return commas


if __name__ == "__main__":
    unittest.main()
