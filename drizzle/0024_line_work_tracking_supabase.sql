CREATE TABLE IF NOT EXISTS "line_webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"source_id" text,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"lease_until" timestamp with time zone,
	"sheet_committed" boolean DEFAULT false NOT NULL,
	"response_payload" jsonb,
	"error_code" text,
	"push_retry_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "line_webhook_events_status_valid" CHECK ("line_webhook_events"."status" IN ('processing', 'committed', 'completed', 'failed_notified', 'failed_unnotified', 'ignored')),
	CONSTRAINT "line_webhook_events_attempts_positive" CHECK ("line_webhook_events"."attempts" > 0)
);
--> statement-breakpoint
CREATE TABLE "work_tracking_activities" (
	"activity_id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"work_tracking_record_id" uuid,
	"overtime_request_id" uuid,
	"employee_id" uuid,
	"employee_code" varchar(20) NOT NULL,
	"employee_name" varchar(255) NOT NULL,
	"event_date" date NOT NULL,
	"work_date" date NOT NULL,
	"start_time" varchar(10) NOT NULL,
	"end_time" varchar(10) NOT NULL,
	"house_no" varchar(120) NOT NULL,
	"round" varchar(40) NOT NULL,
	"inspect_no" varchar(64),
	"project_short_name" text DEFAULT '' NOT NULL,
	"developer_note" text DEFAULT '' NOT NULL,
	"action" text DEFAULT '' NOT NULL,
	"status" varchar(20) NOT NULL,
	"status_source" varchar(20) NOT NULL,
	"is_ot" boolean DEFAULT false NOT NULL,
	"event_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_tracking_activities_status_valid" CHECK ("work_tracking_activities"."status" IN ('in_progress', 'completed', 'delivered')),
	CONSTRAINT "work_tracking_activities_status_source_valid" CHECK ("work_tracking_activities"."status_source" IN ('checker', 'line', 'tracking', 'default', 'hrm'))
);
--> statement-breakpoint
CREATE TABLE "work_tracking_requests" (
	"request_id" text PRIMARY KEY NOT NULL,
	"work_tracking_record_id" uuid,
	"event_date" date NOT NULL,
	"work_date" date NOT NULL,
	"house_no" varchar(120) NOT NULL,
	"round" varchar(40) NOT NULL,
	"inspect_no" varchar(64),
	"project_short_name" text DEFAULT '' NOT NULL,
	"developer_note" text DEFAULT '' NOT NULL,
	"latest_status" varchar(20) DEFAULT 'in_progress' NOT NULL,
	"status_source" varchar(20) DEFAULT 'default' NOT NULL,
	"checker_request_status" varchar(20),
	"latest_employee_id" uuid,
	"latest_employee_code" varchar(20) NOT NULL,
	"latest_employee_name" varchar(255) NOT NULL,
	"latest_start_time" varchar(10) NOT NULL,
	"latest_end_time" varchar(10) NOT NULL,
	"latest_action" text DEFAULT '' NOT NULL,
	"is_ot" boolean DEFAULT false NOT NULL,
	"last_event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_tracking_requests_latest_status_valid" CHECK ("work_tracking_requests"."latest_status" IN ('in_progress', 'completed', 'delivered')),
	CONSTRAINT "work_tracking_requests_status_source_valid" CHECK ("work_tracking_requests"."status_source" IN ('checker', 'line', 'tracking', 'default', 'hrm'))
);
--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD COLUMN "source" varchar(30) DEFAULT 'hrm' NOT NULL;--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD COLUMN "line_day_key" text;--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD COLUMN "line_request_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "work_tracking_activities" ADD CONSTRAINT "work_tracking_activities_request_id_work_tracking_requests_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."work_tracking_requests"("request_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_tracking_activities" ADD CONSTRAINT "work_tracking_activities_work_tracking_record_id_work_tracking_records_id_fk" FOREIGN KEY ("work_tracking_record_id") REFERENCES "public"."work_tracking_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_tracking_activities" ADD CONSTRAINT "work_tracking_activities_overtime_request_id_overtime_requests_id_fk" FOREIGN KEY ("overtime_request_id") REFERENCES "public"."overtime_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_tracking_activities" ADD CONSTRAINT "work_tracking_activities_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_tracking_requests" ADD CONSTRAINT "work_tracking_requests_work_tracking_record_id_work_tracking_records_id_fk" FOREIGN KEY ("work_tracking_record_id") REFERENCES "public"."work_tracking_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_tracking_requests" ADD CONSTRAINT "work_tracking_requests_latest_employee_id_employees_id_fk" FOREIGN KEY ("latest_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "line_webhook_events_status_lease_idx" ON "line_webhook_events" USING btree ("status","lease_until");--> statement-breakpoint
CREATE INDEX "work_tracking_activities_request_recorded_idx" ON "work_tracking_activities" USING btree ("request_id","recorded_at");--> statement-breakpoint
CREATE INDEX "work_tracking_activities_event_id_idx" ON "work_tracking_activities" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "work_tracking_activities_ot_request_id_idx" ON "work_tracking_activities" USING btree ("overtime_request_id");--> statement-breakpoint
CREATE INDEX "work_tracking_activities_record_id_idx" ON "work_tracking_activities" USING btree ("work_tracking_record_id");--> statement-breakpoint
CREATE INDEX "work_tracking_requests_house_round_date_idx" ON "work_tracking_requests" USING btree ("house_no","round","event_date");--> statement-breakpoint
CREATE INDEX "work_tracking_requests_record_id_idx" ON "work_tracking_requests" USING btree ("work_tracking_record_id");--> statement-breakpoint
CREATE INDEX "work_tracking_requests_work_date_idx" ON "work_tracking_requests" USING btree ("work_date");--> statement-breakpoint
CREATE INDEX "overtime_requests_source_line_day_status_idx" ON "overtime_requests" USING btree ("source","line_day_key","status_code");--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_source_valid" CHECK ("overtime_requests"."source" IN ('hrm', 'line_bot'));
--> statement-breakpoint
INSERT INTO "public"."request_statuses" ("code", "name") VALUES
  ('pending', 'รอจัดการ'),
  ('approved', 'อนุมัติแล้ว'),
  ('rejected', 'ไม่อนุมัติ'),
  ('cancelled', 'ยกเลิก')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.save_line_work_batch(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id text := btrim(COALESCE(payload->>'event_id', ''));
  v_now timestamptz := now();
  v_row jsonb;
  v_req_id text;
  v_house_no text;
  v_round text;
  v_event_date date;
  v_work_date date;
  v_delivered_date date;
  v_dev_note text;
  v_status text;
  v_project text;
  v_action text;
  v_rec record;
  v_sub_elem jsonb;
  v_new_sub_statuses jsonb;
  v_matched_sub boolean;
  v_overall_status text;
  v_inserted boolean;
  v_tracking_inserted integer := 0;
  v_tracking_updated integer := 0;
  v_ot_written integer := 0;
  v_activities_inserted integer := 0;
  v_record_ids jsonb := '{}'::jsonb;
  v_ot_ids_by_day jsonb := '{}'::jsonb;
  v_ot_ids jsonb := '[]'::jsonb;
  v_ot jsonb;
  v_ot_emp_id uuid;
  v_ot_work_date date;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_reason text;
  v_line_day_key text;
  v_day_ot_activity_ids text[];
  v_existing_activity_count integer;
  v_existing_ot_id uuid;
  v_pending_ot record;
  v_merged_reason text;
  v_merged_req_ids text[];
  v_target_ot_id uuid;
  v_hist jsonb;
  v_act_id text;
  v_record_id uuid;
  v_hist_ot_id uuid;
  v_is_ot boolean;
  v_inserted_act_id text;
  v_workers jsonb;
  v_emp_code text;
  v_sess_date text;
  v_sess_time text;
  v_emp_name text;
  v_emp_nick text;
  v_worker_label text;
  v_sessions jsonb;
  v_new_sessions jsonb;
  v_sess_elem jsonb;
  v_sess_matched boolean;
  v_items jsonb;
BEGIN
  IF v_event_id = '' THEN
    RAISE EXCEPTION 'event_id is required for an atomic work batch write' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'tracking_rows', '[]'::jsonb)) LOOP
    v_req_id := btrim(COALESCE(v_row->>'request_id', ''));
    IF v_req_id = '' THEN
      RAISE EXCEPTION 'Every tracking row must contain request_id' USING ERRCODE = '22023';
    END IF;

    v_house_no := btrim(COALESCE(v_row->>'house_no', ''));
    v_round := btrim(COALESCE(v_row->>'round', ''));
    IF v_house_no = '' OR v_round = '' THEN
      RAISE EXCEPTION 'house_no and round are required for request_id %', v_req_id USING ERRCODE = '22023';
    END IF;

    v_work_date := (v_row->>'work_date')::date;
    v_event_date := COALESCE(NULLIF(btrim(COALESCE(v_row->>'event_date', '')), '')::date, v_work_date);
    v_delivered_date := NULLIF(btrim(COALESCE(v_row->>'delivered_date', '')), '')::date;
    v_dev_note := btrim(COALESCE(v_row->>'developer_note', ''));
    v_status := btrim(COALESCE(v_row->>'status', 'in_progress'));
    v_project := COALESCE(v_row->>'project_short_name', '');
    v_action := COALESCE(v_row->>'text', '');

    INSERT INTO public.work_tracking_records (
      house_no, round, event_date, project_text, detail, status, delivered_date,
      report_statuses, sub_statuses, workers, created_at, updated_at
    )
    VALUES (
      v_house_no,
      v_round,
      v_event_date,
      v_project,
      CASE WHEN v_dev_note <> '' THEN v_dev_note ELSE v_action END,
      v_status,
      v_delivered_date,
      '{}'::jsonb,
      '[]'::jsonb,
      '{}'::jsonb,
      v_now,
      v_now
    )
    ON CONFLICT (house_no, round, event_date) DO NOTHING;

    SELECT id, project_text, detail, delivered_date, sub_statuses
    INTO v_rec
    FROM public.work_tracking_records
    WHERE house_no = v_house_no AND round = v_round AND event_date = v_event_date
    FOR UPDATE;

    v_new_sub_statuses := '[]'::jsonb;
    v_matched_sub := false;

    FOR v_sub_elem IN SELECT value FROM jsonb_array_elements(COALESCE(v_rec.sub_statuses, '[]'::jsonb)) LOOP
      IF NOT v_matched_sub AND btrim(COALESCE(v_sub_elem->>'detail', '')) = v_dev_note THEN
        v_matched_sub := true;
        v_new_sub_statuses := v_new_sub_statuses || jsonb_build_array(
          jsonb_build_object(
            'detail', COALESCE(NULLIF(v_sub_elem->>'detail', ''), v_dev_note),
            'status', v_status,
            'reportStatuses', COALESCE(v_sub_elem->'reportStatuses', '{}'::jsonb)
          )
        );
      ELSE
        v_new_sub_statuses := v_new_sub_statuses || jsonb_build_array(v_sub_elem);
      END IF;
    END LOOP;

    IF NOT v_matched_sub THEN
      v_new_sub_statuses := v_new_sub_statuses || jsonb_build_array(
        jsonb_build_object(
          'detail', v_dev_note,
          'status', v_status,
          'reportStatuses', '{}'::jsonb
        )
      );
    END IF;

    SELECT
      CASE
        WHEN jsonb_array_length(v_new_sub_statuses) = 0 THEN v_status
        WHEN bool_and((elem->>'status') = 'delivered') THEN 'delivered'
        WHEN bool_and((elem->>'status') IN ('completed', 'delivered')) THEN 'completed'
        ELSE 'in_progress'
      END
    INTO v_overall_status
    FROM jsonb_array_elements(v_new_sub_statuses) AS elem;

    UPDATE public.work_tracking_records
    SET
      project_text = CASE WHEN btrim(project_text) <> '' THEN project_text ELSE v_project END,
      detail = CASE WHEN btrim(detail) <> '' THEN detail WHEN v_dev_note <> '' THEN v_dev_note ELSE v_action END,
      delivered_date = COALESCE(delivered_date, v_delivered_date),
      sub_statuses = v_new_sub_statuses,
      status = v_overall_status,
      updated_at = v_now
    WHERE id = v_rec.id;

    INSERT INTO public.work_tracking_requests (
      request_id, work_tracking_record_id, event_date, work_date, house_no, round, inspect_no,
      project_short_name, developer_note, latest_status, status_source, checker_request_status,
      latest_employee_id, latest_employee_code, latest_employee_name,
      latest_start_time, latest_end_time, latest_action, is_ot, last_event_id,
      created_at, updated_at
    )
    VALUES (
      v_req_id,
      v_rec.id,
      v_event_date,
      v_work_date,
      v_house_no,
      v_round,
      NULLIF(btrim(COALESCE(v_row->>'inspect_no', '')), ''),
      v_project,
      v_dev_note,
      v_status,
      COALESCE(NULLIF(v_row->>'status_source', ''), 'default'),
      NULLIF(btrim(COALESCE(v_row->>'checker_request_status', '')), ''),
      NULLIF(btrim(COALESCE(v_row->>'employee_id', '')), '')::uuid,
      COALESCE(v_row->>'employee_code', ''),
      COALESCE(v_row->>'employee_name', ''),
      COALESCE(v_row->>'start_time', ''),
      COALESCE(v_row->>'end_time', ''),
      v_action,
      COALESCE((v_row->>'is_ot')::boolean, false),
      v_event_id,
      v_now,
      v_now
    )
    ON CONFLICT (request_id) DO UPDATE SET
      work_tracking_record_id = EXCLUDED.work_tracking_record_id,
      event_date = EXCLUDED.event_date,
      work_date = EXCLUDED.work_date,
      house_no = EXCLUDED.house_no,
      round = EXCLUDED.round,
      inspect_no = EXCLUDED.inspect_no,
      project_short_name = CASE WHEN EXCLUDED.project_short_name <> '' THEN EXCLUDED.project_short_name ELSE public.work_tracking_requests.project_short_name END,
      developer_note = CASE WHEN EXCLUDED.developer_note <> '' THEN EXCLUDED.developer_note ELSE public.work_tracking_requests.developer_note END,
      latest_status = EXCLUDED.latest_status,
      status_source = EXCLUDED.status_source,
      checker_request_status = EXCLUDED.checker_request_status,
      latest_employee_id = EXCLUDED.latest_employee_id,
      latest_employee_code = EXCLUDED.latest_employee_code,
      latest_employee_name = EXCLUDED.latest_employee_name,
      latest_start_time = EXCLUDED.latest_start_time,
      latest_end_time = EXCLUDED.latest_end_time,
      latest_action = EXCLUDED.latest_action,
      is_ot = EXCLUDED.is_ot,
      last_event_id = EXCLUDED.last_event_id,
      updated_at = EXCLUDED.updated_at
    RETURNING (xmax = 0) INTO v_inserted;

    IF v_inserted THEN
      v_tracking_inserted := v_tracking_inserted + 1;
    ELSE
      v_tracking_updated := v_tracking_updated + 1;
    END IF;

    v_record_ids := jsonb_set(v_record_ids, ARRAY[v_req_id], to_jsonb(v_rec.id::text));
  END LOOP;

  FOR v_ot IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'ot_rows', '[]'::jsonb)) LOOP
    v_ot_emp_id := NULLIF(btrim(COALESCE(v_ot->>'employee_id', '')), '')::uuid;
    v_ot_work_date := (v_ot->>'work_date')::date;
    v_start_at := (v_ot->>'start_at')::timestamptz;
    v_end_at := (v_ot->>'end_at')::timestamptz;
    v_reason := btrim(COALESCE(v_ot->>'reason', ''));
    v_line_day_key := btrim(COALESCE(v_ot->>'line_day_key', ''));

    IF v_ot_emp_id IS NULL OR v_start_at IS NULL OR v_end_at IS NULL OR v_end_at <= v_start_at OR v_reason = '' THEN
      RAISE EXCEPTION 'Invalid OT payload: employee_id, valid start_at < end_at, and reason are required' USING ERRCODE = '22023';
    END IF;
    IF v_line_day_key = '' THEN
      v_line_day_key := v_ot_emp_id::text || ':' || v_ot_work_date::text;
    END IF;

    SELECT array_agg(h->>'activity_id')
    INTO v_day_ot_activity_ids
    FROM jsonb_array_elements(COALESCE(payload->'history_rows', '[]'::jsonb)) AS h
    WHERE COALESCE((h->>'is_ot')::boolean, false) = true
      AND (h->>'work_date')::date = v_ot_work_date
      AND btrim(COALESCE(h->>'activity_id', '')) <> '';

    v_existing_activity_count := 0;
    v_existing_ot_id := NULL;
    IF v_day_ot_activity_ids IS NOT NULL AND cardinality(v_day_ot_activity_ids) > 0 THEN
      SELECT count(*), max(overtime_request_id::text)::uuid
      INTO v_existing_activity_count, v_existing_ot_id
      FROM public.work_tracking_activities
      WHERE activity_id = ANY(v_day_ot_activity_ids);
    END IF;

    IF v_day_ot_activity_ids IS NOT NULL AND cardinality(v_day_ot_activity_ids) > 0 AND v_existing_activity_count = cardinality(v_day_ot_activity_ids) THEN
      IF v_existing_ot_id IS NOT NULL THEN
        v_ot_ids_by_day := jsonb_set(v_ot_ids_by_day, ARRAY[v_ot_work_date::text], to_jsonb(v_existing_ot_id::text));
        v_ot_ids := v_ot_ids || jsonb_build_array(v_existing_ot_id::text);
      END IF;
      CONTINUE;
    END IF;

    v_pending_ot := NULL;
    SELECT id, start_at, end_at, reason, line_request_ids
    INTO v_pending_ot
    FROM public.overtime_requests
    WHERE source = 'line_bot'
      AND line_day_key = v_line_day_key
      AND status_code = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    SELECT string_agg(line, E'\n' ORDER BY first_pos)
    INTO v_merged_reason
    FROM (
      SELECT line, min(pos) AS first_pos
      FROM (
        SELECT btrim(u.line) AS line, u.ord AS pos
        FROM unnest(regexp_split_to_array(COALESCE(v_pending_ot.reason, ''), E'\\r?\\n')) WITH ORDINALITY AS u(line, ord)
        UNION ALL
        SELECT btrim(u.line) AS line, 1000000 + u.ord AS pos
        FROM unnest(regexp_split_to_array(v_reason, E'\\r?\\n')) WITH ORDINALITY AS u(line, ord)
      ) combined
      WHERE line <> ''
      GROUP BY line
    ) deduped;

    SELECT COALESCE(array_agg(req_id ORDER BY first_pos), '{}'::text[])
    INTO v_merged_req_ids
    FROM (
      SELECT req_id, min(pos) AS first_pos
      FROM (
        SELECT btrim(u.req_id) AS req_id, u.ord AS pos
        FROM unnest(COALESCE(v_pending_ot.line_request_ids, '{}'::text[])) WITH ORDINALITY AS u(req_id, ord)
        UNION ALL
        SELECT btrim(j.val) AS req_id, 1000000 + j.ord AS pos
        FROM jsonb_array_elements_text(COALESCE(v_ot->'request_ids', '[]'::jsonb)) WITH ORDINALITY AS j(val, ord)
      ) combined
      WHERE req_id <> ''
      GROUP BY req_id
    ) deduped;

    IF v_pending_ot.id IS NOT NULL THEN
      UPDATE public.overtime_requests
      SET
        start_at = LEAST(start_at, v_start_at),
        end_at = GREATEST(end_at, v_end_at),
        reason = COALESCE(NULLIF(v_merged_reason, ''), v_reason),
        line_request_ids = v_merged_req_ids,
        updated_at = v_now
      WHERE id = v_pending_ot.id;
      v_target_ot_id := v_pending_ot.id;
    ELSE
      INSERT INTO public.overtime_requests (
        employee_id, start_at, end_at, reason, status_code,
        source, line_day_key, line_request_ids, created_at, updated_at
      )
      VALUES (
        v_ot_emp_id, v_start_at, v_end_at, COALESCE(NULLIF(v_merged_reason, ''), v_reason), 'pending',
        'line_bot', v_line_day_key, v_merged_req_ids, v_now, v_now
      )
      RETURNING id INTO v_target_ot_id;
    END IF;

    v_ot_written := v_ot_written + 1;
    v_ot_ids_by_day := jsonb_set(v_ot_ids_by_day, ARRAY[v_ot_work_date::text], to_jsonb(v_target_ot_id::text));
    v_ot_ids := v_ot_ids || jsonb_build_array(v_target_ot_id::text);
  END LOOP;

  FOR v_hist IN SELECT value FROM jsonb_array_elements(COALESCE(payload->'history_rows', '[]'::jsonb)) LOOP
    v_act_id := btrim(COALESCE(v_hist->>'activity_id', ''));
    v_req_id := btrim(COALESCE(v_hist->>'request_id', ''));
    IF v_act_id = '' OR v_req_id = '' THEN
      RAISE EXCEPTION 'Every history row must contain activity_id and request_id' USING ERRCODE = '22023';
    END IF;

    v_work_date := (v_hist->>'work_date')::date;
    v_event_date := COALESCE(NULLIF(btrim(COALESCE(v_hist->>'event_date', '')), '')::date, v_work_date);
    v_is_ot := COALESCE((v_hist->>'is_ot')::boolean, false);
    v_record_id := NULLIF(v_record_ids->>v_req_id, '')::uuid;
    IF v_record_id IS NULL THEN
      SELECT work_tracking_record_id INTO v_record_id
      FROM public.work_tracking_requests
      WHERE request_id = v_req_id;
    END IF;
    v_hist_ot_id := CASE WHEN v_is_ot THEN NULLIF(v_ot_ids_by_day->>(v_work_date::text), '')::uuid ELSE NULL END;

    v_inserted_act_id := NULL;
    INSERT INTO public.work_tracking_activities (
      activity_id, request_id, work_tracking_record_id, overtime_request_id,
      employee_id, employee_code, employee_name, event_date, work_date,
      start_time, end_time, house_no, round, inspect_no,
      project_short_name, developer_note, action, status, status_source,
      is_ot, event_id, recorded_at
    )
    VALUES (
      v_act_id,
      v_req_id,
      v_record_id,
      v_hist_ot_id,
      NULLIF(btrim(COALESCE(v_hist->>'employee_id', '')), '')::uuid,
      COALESCE(v_hist->>'employee_code', ''),
      COALESCE(v_hist->>'employee_name', ''),
      v_event_date,
      v_work_date,
      COALESCE(v_hist->>'start_time', ''),
      COALESCE(v_hist->>'end_time', ''),
      COALESCE(v_hist->>'house_no', ''),
      COALESCE(v_hist->>'round', ''),
      NULLIF(btrim(COALESCE(v_hist->>'inspect_no', '')), ''),
      COALESCE(v_hist->>'project_short_name', ''),
      COALESCE(v_hist->>'developer_note', ''),
      COALESCE(v_hist->>'action', ''),
      COALESCE(v_hist->>'status', 'in_progress'),
      COALESCE(NULLIF(v_hist->>'status_source', ''), 'default'),
      v_is_ot,
      v_event_id,
      COALESCE(NULLIF(btrim(COALESCE(v_hist->>'recorded_at', '')), '')::timestamptz, v_now)
    )
    ON CONFLICT (activity_id) DO NOTHING
    RETURNING activity_id INTO v_inserted_act_id;

    IF v_inserted_act_id IS NOT NULL THEN
      v_activities_inserted := v_activities_inserted + 1;

      IF v_record_id IS NOT NULL THEN
        SELECT workers INTO v_workers
        FROM public.work_tracking_records
        WHERE id = v_record_id
        FOR UPDATE;

        v_emp_code := COALESCE(v_hist->>'employee_code', '');
        v_sess_date := COALESCE(NULLIF(v_hist->>'work_date_display', ''), to_char(v_work_date, 'DD/MM/YYYY'));
        v_sess_time := COALESCE(v_hist->>'start_time', '') || '-' || COALESCE(v_hist->>'end_time', '');
        v_emp_name := COALESCE(v_hist->>'employee_name', '');
        v_emp_nick := NULLIF(btrim(COALESCE(v_hist->>'employee_nickname', '')), '');
        v_worker_label := btrim(COALESCE(v_hist->>'worker_item_label', ''));

        v_sessions := COALESCE(v_workers->v_emp_code, '[]'::jsonb);
        v_new_sessions := '[]'::jsonb;
        v_sess_matched := false;

        FOR v_sess_elem IN SELECT value FROM jsonb_array_elements(v_sessions) LOOP
          IF NOT v_sess_matched AND v_sess_elem->>'date' = v_sess_date AND v_sess_elem->>'time' = v_sess_time THEN
            v_sess_matched := true;
            v_items := COALESCE(v_sess_elem->'items', '[]'::jsonb);
            IF v_worker_label <> '' AND NOT (v_items ? v_worker_label) THEN
              v_items := v_items || jsonb_build_array(v_worker_label);
            END IF;
            v_new_sessions := v_new_sessions || jsonb_build_array(
              jsonb_set(v_sess_elem, '{items}', v_items, true)
            );
          ELSE
            v_new_sessions := v_new_sessions || jsonb_build_array(v_sess_elem);
          END IF;
        END LOOP;

        IF NOT v_sess_matched THEN
          v_new_sessions := v_new_sessions || jsonb_build_array(
            jsonb_build_object(
              'date', v_sess_date,
              'time', v_sess_time,
              'name', v_emp_name,
              'items', CASE WHEN v_worker_label <> '' THEN jsonb_build_array(v_worker_label) ELSE '[]'::jsonb END
            ) || CASE WHEN v_emp_nick IS NOT NULL THEN jsonb_build_object('nickname', v_emp_nick) ELSE '{}'::jsonb END
          );
        END IF;

        v_workers := jsonb_set(COALESCE(v_workers, '{}'::jsonb), ARRAY[v_emp_code], v_new_sessions, true);
        UPDATE public.work_tracking_records
        SET workers = v_workers, updated_at = v_now
        WHERE id = v_record_id;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'transaction_id', v_event_id,
    'ot_written', v_ot_written,
    'tracking_inserted', v_tracking_inserted,
    'tracking_updated', v_tracking_updated,
    'activities_inserted', v_activities_inserted,
    'overtime_request_ids', v_ot_ids
  );
END;
$$;
--> statement-breakpoint
DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.save_line_work_batch(jsonb) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.save_line_work_batch(jsonb) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.save_line_work_batch(jsonb) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_line_work_batch(jsonb) TO service_role';
  END IF;
END $$;
--> statement-breakpoint
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'departments',
    'positions',
    'employment_statuses',
    'employment_types',
    'request_statuses',
    'ot_rate_settings',
    'leave_types',
    'skills',
    'employees',
    'employee_skills',
    'overtime_requests',
    'leave_requests',
    'users',
    'salary_slip_imports',
    'salary_slips',
    'salary_slip_versions',
    'employee_documents',
    'asset_requests',
    'asset_request_items',
    'asset_request_attachments',
    'asset_agreement_templates',
    'asset_agreements',
    'asset_agreement_signers',
    'asset_request_reads',
    'asset_request_events',
    'work_tracking_records',
    'line_webhook_events',
    'work_tracking_requests',
    'work_tracking_activities'
  ] LOOP
    IF to_regclass('public.' || quote_ident(tbl)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    END IF;
  END LOOP;
END $$;
