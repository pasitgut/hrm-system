import datetime as dt
import unittest

from appsheet_migration.report import Report
from appsheet_migration.sheets.assets import build_assets, parse_items
from appsheet_migration.sheets.employees import (
    add_former_employees, build_employees, make_approver_finder, parse_weekly_holidays,
)
from appsheet_migration.sheets.leave import build_leave, parse_approval, resolve_session
from appsheet_migration.sheets.overtime import build_overtime

from .helpers import employee_row, serial, sheet, time_fraction

D = dt.date


class EmployeeTests(unittest.TestCase):
    def build(self, *rows):
        report = Report()
        return build_employees(sheet(*rows), report), report

    def test_maps_a_row(self):
        employees, _ = self.build(employee_row(
            "2633", "นภัสปวัน ฉายสุริยะ", D(2024, 5, 1), department="ออฟฟิศ", position="หัวหน้างาน",
            email="Napas@Example.com", holidays="Sunday,Monday", prefix="น.ส.",
        ))
        e = employees["2633"]
        self.assertEqual((e.first_name, e.last_name, e.prefix), ("นภัสปวัน", "ฉายสุริยะ", "นางสาว"))
        self.assertEqual(e.email, "napas@example.com")
        self.assertEqual(e.weekly_holidays, [0, 1])
        self.assertEqual((e.department, e.position, e.start_date), ("ออฟฟิศ", "หัวหน้างาน", D(2024, 5, 1)))

    def test_skips_test_accounts_duplicates_and_missing_start_dates(self):
        employees, report = self.build(
            employee_row("7777", "ฝึกงาน", D(2026, 1, 1)),
            employee_row("1111", "เอ บี", D(2024, 1, 1)),
            employee_row("1111", "เอ ซ้ำ", D(2024, 1, 1)),
            {0: "ไม่มีวันที่", 1: "2222"},
        )
        self.assertEqual(list(employees), ["1111"])
        self.assertEqual(report.counts["employees skipped (test/system)"], 1)
        self.assertTrue(any("duplicate code 1111" in w for w in report.warnings))
        self.assertTrue(any("no start date" in w for w in report.warnings))

    def test_warns_about_placeholder_start_dates_and_duplicate_emails(self):
        _, report = self.build(
            employee_row("1801", "สุเมธ เจตธำรงชัย", D(2000, 1, 1), email="a@x.com"),
            employee_row("1802", "คนอื่น ใดๆ", D(2024, 1, 1), email="A@x.com"),
        )
        self.assertTrue(any("placeholder" in w for w in report.warnings))
        self.assertTrue(any("a@x.com used by 2" in w for w in report.warnings))

    def test_weekly_holidays_ignore_unknown_and_repeated_days(self):
        report = Report()
        self.assertEqual(parse_weekly_holidays("Monday, monday,Funday", "1111", report), [1])
        self.assertEqual(len(report.warnings), 1)

    def test_approver_finder_prefers_email_then_name_then_alias(self):
        employees, _ = self.build(
            employee_row("1904", "ปัญปัญ วันทนะ", D(2020, 1, 1), email="kute@x.com"),
            employee_row("2005", "ชาญธวัช เจริญธรรมโชติ", D(2020, 1, 1)),
        )
        find = make_approver_finder(employees)
        self.assertEqual(find("ใครก็ได้", "KUTE@x.com"), "1904")
        self.assertEqual(find("ชาญธวัช  เจริญธรรมโชติ"), "2005")
        self.assertEqual(find("Max Chantawat"), "2005")
        self.assertIsNone(find("Nobody"))


class OvertimeTests(unittest.TestCase):
    def setUp(self):
        self.report = Report()
        self.employees = build_employees(sheet(employee_row("2005", "ชาญธวัช เจริญธรรมโชติ", D(2020, 1, 1))), self.report)
        self.find = make_approver_finder(self.employees)

    def row(self, day=D(2025, 11, 21), start=(17, 0), end=(19, 0), status="อนุมัติแล้ว", note="งาน", approver=None, name="ชาญธวัช เจริญธรรมโชติ"):
        cells = {0: serial(day), 1: time_fraction(*start), 2: time_fraction(*end), 4: name, 5: note, 6: status}
        if approver:
            cells[8] = approver
        return cells

    def build(self, *rows):
        return build_overtime(sheet(*rows), self.employees, self.find, self.report)

    def test_combines_date_and_times_in_local_time(self):
        [r] = self.build(self.row(approver="max chantawat"))
        self.assertEqual((r.start_at, r.end_at), (dt.datetime(2025, 11, 21, 17, 0), dt.datetime(2025, 11, 21, 19, 0)))
        self.assertEqual((r.employee_code, r.status, r.decided_by_code), ("2005", "approved", "2005"))

    def test_overnight_shift_ends_next_day(self):
        [r] = self.build(self.row(start=(23, 0), end=(1, 0)))
        self.assertEqual(r.end_at, dt.datetime(2025, 11, 22, 1, 0))

    def test_only_decided_requests_keep_an_approver(self):
        [r] = self.build(self.row(status="ยังไม่ได้ยืนยัน", approver="ชาญธวัช เจริญธรรมโชติ"))
        self.assertEqual((r.status, r.decided_by_code), ("pending", None))

    def test_exact_duplicates_are_skipped_but_different_notes_are_kept(self):
        rows = self.build(self.row(), self.row(), self.row(note="อีกงาน"))
        self.assertEqual(len(rows), 2)
        self.assertEqual(self.report.counts["ot skipped (exact duplicate)"], 1)

    def test_blank_reason_gets_a_default_text(self):
        [r] = self.build(self.row(note=" "))
        self.assertEqual(r.reason_text, "ไม่ระบุ")

    def test_unknown_status_becomes_pending_with_a_warning(self):
        [r] = self.build(self.row(status="???"))
        self.assertEqual(r.status, "pending")
        self.assertTrue(self.report.warnings)


class LeaveTests(unittest.TestCase):
    def setUp(self):
        self.report = Report()
        self.employees = build_employees(sheet(employee_row("2213", "ศุภพัฒน์ เจริญธรรมโชติ", D(2022, 8, 25))), self.report)
        self.find = make_approver_finder(self.employees)

    def row(self, kind="ลากิจ", period="ลาเต็มวัน", start=D(2026, 3, 5), end=None, reason=None, status="อนุมัติแล้ว", code=2213.0, attachment=None):
        cells = {0: "ศุภพัฒน์ เจริญธรรมโชติ", 1: kind, 2: period, 3: serial(start), 4: serial(end or start), 7: status, 8: code}
        if reason:
            cells[5] = reason
        if attachment:
            cells[6] = attachment
        return cells

    def build(self, *rows):
        return build_leave(sheet(*rows), self.employees, self.find, self.report)

    def test_maps_types_and_codes(self):
        reqs = self.build(self.row("ลาป่วย"), self.row("ลาวันเกิด", start=D(2026, 4, 1)), self.row("ลาพักร้อน", start=D(2026, 5, 1)))
        self.assertEqual([r.leave_type_code for r in reqs], ["sick", "birthday", "vacation"])
        self.assertEqual({r.employee_code for r in reqs}, {"2213"})

    def test_half_day_session_comes_from_the_reason_text(self):
        pm, am_default = self.build(self.row(period="ลาครึ่งวัน", reason="ครึ่งบ่าย"), self.row(period="ลาครึ่งวัน", start=D(2026, 3, 6)))
        self.assertEqual((pm.session, pm.reason), ("pm", None))        # the cell only carried the marker
        self.assertEqual(am_default.session, "am")
        self.assertTrue(any("no เช้า/บ่าย hint" in w for w in self.report.warnings))

    def test_half_day_keeps_a_real_reason(self):
        self.assertEqual(resolve_session("ลาครึ่งวัน", D(2026, 1, 1), D(2026, 1, 1), "ครึ่งเช้า ไปธนาคาร", 2, "x", Report()),
                         ("am", "ครึ่งเช้า ไปธนาคาร"))

    def test_multi_day_half_day_falls_back_to_full(self):
        report = Report()
        self.assertEqual(resolve_session("ลาครึ่งวัน", D(2026, 1, 1), D(2026, 1, 2), None, 2, "x", report), ("full", None))
        self.assertEqual(len(report.warnings), 1)

    def test_decision_cell_gives_approver_and_midday_date(self):
        find = make_approver_finder(self.employees)
        approver, at = parse_approval("ศุภพัฒน์ เจริญธรรมโชติ|13/03/2026|", "approved", find, 2, Report())
        self.assertEqual((approver, at), ("2213", dt.datetime(2026, 3, 13, 12, 0)))
        self.assertEqual(parse_approval("x|13/03/2026|", "pending", find, 2, Report()), (None, None))

    def test_attachment_url_is_appended_to_the_reason(self):
        [r] = self.build(self.row(reason="ไข้", attachment="https://example.com/a.jpg"))
        self.assertEqual(r.reason, "ไข้\nแนบ: https://example.com/a.jpg")

    def test_skips_invalid_rows(self):
        reqs = self.build(
            self.row("ลาไม่รู้จัก"),
            self.row(start=D(2026, 3, 9), end=D(2026, 3, 5)),
            self.row(code=7777.0),
            self.row(),
        )
        self.assertEqual(len(reqs), 1)


class FormerEmployeeTests(unittest.TestCase):
    def test_unknown_people_become_former_stubs_and_ot_codes_come_from_leave(self):
        report = Report()
        employees = build_employees(sheet(employee_row("1111", "คนเก่า มีอยู่", D(2020, 1, 1))), report)
        find = make_approver_finder(employees)
        leave = build_leave(sheet({0: "ลาออก ไปแล้ว", 1: "ลาป่วย", 2: "ลาเต็มวัน", 3: serial(D(2026, 2, 3)), 4: serial(D(2026, 2, 3)), 7: "อนุมัติแล้ว", 8: 2321.0}), employees, find, report)
        overtime = build_overtime(sheet(
            {0: serial(D(2026, 1, 10)), 1: time_fraction(18), 2: time_fraction(20), 4: "ลาออก ไปแล้ว", 5: "x", 6: "อนุมัติแล้ว"},
            {0: serial(D(2026, 1, 11)), 1: time_fraction(18), 2: time_fraction(20), 4: "ไม่รู้จักใคร", 5: "x", 6: "อนุมัติแล้ว"},
        ), employees, find, report)

        add_former_employees(employees, overtime, leave, report)

        self.assertEqual([r.employee_code for r in overtime], ["2321"])  # the unmatched row was dropped
        stub = employees["2321"]
        self.assertTrue(stub.is_former_stub)
        self.assertEqual(stub.start_date, D(2026, 1, 10))                 # earliest OT/leave activity
        self.assertEqual(report.counts["employees created as former-staff stubs"], 1)


class AssetTests(unittest.TestCase):
    def test_parse_items(self):
        items = parse_items("เสื้อกั๊ก|1|\nไฟฉาย|2|ใหม่\n\nไม่มีจำนวน\nแย่|abc|")
        self.assertEqual([(i.name, i.quantity, i.note) for i in items],
                         [("เสื้อกั๊ก", 1, ""), ("ไฟฉาย", 2, "ใหม่"), ("ไม่มีจำนวน", 1, ""), ("แย่", 1, "")])

    def test_builds_a_request_and_skips_bad_ones(self):
        report = Report()
        employees = build_employees(sheet(employee_row("2209", "ชนม์สวัสดิ์ เชยชื่นกลิ่น", D(2022, 3, 1), department="ช่างตรวจ")), report)
        find = make_approver_finder(employees)
        good_id = "42d965e1-d3ca-454b-8562-295cc537a50e"
        rows = sheet(
            {0: good_id, 1: serial(D(2026, 9, 18), 8, 23), 3: "พนักงาน", 4: 2209.0, 6: serial(D(2026, 9, 18)), 8: "เสื้อกั๊ก|1|", 10: "อนุมัติ", 11: "ชนม์สวัสดิ์ เชยชื่นกลิ่น"},
            {0: "not-a-uuid", 4: 2209.0, 8: "x|1|"},
            {0: "0614931b-58fe-47a1-bf1a-8160762d2742", 4: 9999.0, 8: "x|1|"},
        )
        [request] = build_assets(rows, employees, find, report)
        self.assertEqual((request.sheet_id, request.status, request.department, request.approver_code),
                         (good_id, "approved", "ช่างตรวจ", "2209"))
        self.assertEqual(len(report.warnings), 2)


if __name__ == "__main__":
    unittest.main()
