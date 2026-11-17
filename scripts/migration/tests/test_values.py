import datetime as dt
import unittest

from appsheet_migration import values


class CleanTests(unittest.TestCase):
    def test_collapses_whitespace_and_blanks(self):
        self.assertEqual(values.clean("  ปุณฑริกา   เอี่ยมสำอางค์ "), "ปุณฑริกา เอี่ยมสำอางค์")
        self.assertIsNone(values.clean("   "))
        self.assertIsNone(values.clean(None))

    def test_whole_floats_lose_the_decimal(self):
        self.assertEqual(values.clean(2633.0), "2633")

    def test_multiline_keeps_line_breaks(self):
        self.assertEqual(values.clean_multiline(" a \r\n b \n"), "a\nb")
        self.assertIsNone(values.clean_multiline("\n \n"))


class EmployeeCodeTests(unittest.TestCase):
    def test_normalises_numbers_and_strings(self):
        self.assertEqual(values.employee_code(2633.0), "2633")
        self.assertEqual(values.employee_code("2633"), "2633")
        self.assertEqual(values.employee_code(633), "0633")
        self.assertEqual(values.employee_code("ABC"), "ABC")
        self.assertIsNone(values.employee_code(None))


class ExcelDateTests(unittest.TestCase):
    def test_serials(self):
        self.assertEqual(values.excel_date(45982.0), dt.date(2025, 11, 21))
        self.assertEqual(values.excel_datetime(45982.5), dt.datetime(2025, 11, 21, 12, 0))
        self.assertIsNone(values.excel_date("x"))

    def test_time_of_day_rounds_to_the_minute(self):
        date = dt.datetime(2025, 11, 21)
        self.assertEqual(values.excel_time_of_day(date, 0.7083333333333334), dt.datetime(2025, 11, 21, 17, 0))


class MiscTests(unittest.TestCase):
    def test_split_name(self):
        self.assertEqual(values.split_name("จักริน ศรีวรวงษ์"), ("จักริน", "ศรีวรวงษ์"))
        self.assertEqual(values.split_name("admin"), ("admin", ""))

    def test_deterministic_uuid_is_stable_and_input_sensitive(self):
        self.assertEqual(values.deterministic_uuid("ot", 1), values.deterministic_uuid("ot", 1))
        self.assertNotEqual(values.deterministic_uuid("ot", 1), values.deterministic_uuid("ot", 2))


if __name__ == "__main__":
    unittest.main()
