CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE asset_request_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'return_pending',
  'returned',
  'unknown'
);

CREATE TYPE asset_agreement_status AS ENUM (
  'waiting_handover',
  'waiting_employee',
  'waiting_admin',
  'completed'
);

CREATE TYPE asset_agreement_participant AS ENUM ('employee', 'handover', 'admin');
CREATE TYPE asset_signer_kind AS ENUM ('employee', 'admin', 'other');
CREATE TYPE asset_signature_status AS ENUM ('pending', 'signed', 'locked');
CREATE TYPE asset_return_condition AS ENUM ('original', 'damaged', 'lost');
CREATE TYPE asset_attachment_kind AS ENUM ('request', 'additional', 'return');

CREATE TABLE employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  department text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employees_code_not_blank CHECK (length(btrim(employee_code)) > 0),
  CONSTRAINT employees_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT employees_email_not_blank CHECK (length(btrim(email)) > 0)
);

CREATE UNIQUE INDEX employees_employee_code_ci_uq ON employees (lower(btrim(employee_code)));
CREATE UNIQUE INDEX employees_email_ci_uq ON employees (lower(btrim(email)));

-- Firebase users and employees are separate identities. A verified email can
-- establish the first link; later requests resolve through firebase_uid.
CREATE TABLE auth_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid text NOT NULL UNIQUE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_users_uid_not_blank CHECK (length(btrim(firebase_uid)) > 0),
  CONSTRAINT auth_users_email_not_blank CHECK (length(btrim(email)) > 0)
);

CREATE UNIQUE INDEX auth_users_email_ci_uq ON auth_users (lower(btrim(email)));

CREATE TABLE employee_auth_links (
  auth_user_id uuid PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL UNIQUE REFERENCES employees(id) ON DELETE RESTRICT,
  linked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE asset_permissions (
  employee_id uuid PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  can_manage_assets boolean NOT NULL DEFAULT false,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE asset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_sheet_id text UNIQUE,
  borrower_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  borrower_employee_code text NOT NULL,
  borrower_name text NOT NULL,
  borrower_department text NOT NULL DEFAULT '',
  borrower_position text NOT NULL DEFAULT '',
  form_date timestamptz NOT NULL DEFAULT now(),
  from_date date NOT NULL,
  to_date date,
  reason text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  status asset_request_status NOT NULL DEFAULT 'pending',
  status_label text NOT NULL DEFAULT 'รอ',
  approved_borrow_by_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  approved_borrow_by_name text NOT NULL DEFAULT '',
  approved_borrow_at timestamptz,
  return_inspector_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  return_inspector_name text NOT NULL DEFAULT '',
  approved_return_by_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  approved_return_by_name text NOT NULL DEFAULT '',
  return_inspection text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT asset_requests_date_order CHECK (to_date IS NULL OR to_date >= from_date),
  CONSTRAINT asset_requests_borrower_code_not_blank CHECK (length(btrim(borrower_employee_code)) > 0),
  CONSTRAINT asset_requests_borrower_name_not_blank CHECK (length(btrim(borrower_name)) > 0),
  CONSTRAINT asset_requests_version_positive CHECK (version > 0)
);

CREATE INDEX asset_requests_borrower_created_idx
  ON asset_requests (borrower_employee_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX asset_requests_status_created_idx
  ON asset_requests (status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE asset_request_items (
  request_id uuid NOT NULL REFERENCES asset_requests(id) ON DELETE CASCADE,
  position smallint NOT NULL,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  note text NOT NULL DEFAULT '',
  PRIMARY KEY (request_id, position),
  CONSTRAINT asset_request_items_position_nonnegative CHECK (position >= 0),
  CONSTRAINT asset_request_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT asset_request_items_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE TABLE asset_request_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES asset_requests(id) ON DELETE CASCADE,
  kind asset_attachment_kind NOT NULL,
  position smallint NOT NULL DEFAULT 0,
  url text NOT NULL,
  uploaded_by_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asset_request_attachments_position_nonnegative CHECK (position >= 0),
  CONSTRAINT asset_request_attachments_url_not_blank CHECK (length(btrim(url)) > 0),
  CONSTRAINT asset_request_attachments_position_uq UNIQUE (request_id, kind, position)
);

CREATE TABLE asset_agreements (
  request_id uuid PRIMARY KEY REFERENCES asset_requests(id) ON DELETE CASCADE,
  title text NOT NULL,
  header_html text NOT NULL DEFAULT '',
  body_html text NOT NULL,
  footer_html text NOT NULL DEFAULT '',
  status asset_agreement_status NOT NULL,
  created_by_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT '',
  created_by_employee_code text NOT NULL DEFAULT '',
  return_condition asset_return_condition,
  document_date date NOT NULL,
  updated_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT asset_agreements_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT asset_agreements_body_not_blank CHECK (length(btrim(body_html)) > 0),
  CONSTRAINT asset_agreements_version_positive CHECK (version > 0)
);

CREATE TABLE asset_agreement_signers (
  request_id uuid NOT NULL REFERENCES asset_agreements(request_id) ON DELETE CASCADE,
  box_id text NOT NULL,
  position smallint NOT NULL,
  participant asset_agreement_participant NOT NULL,
  label text NOT NULL,
  role text NOT NULL,
  signer_kind asset_signer_kind NOT NULL,
  signer_name text NOT NULL DEFAULT '',
  layout_position text NOT NULL,
  page smallint,
  x_percent numeric(5, 2),
  y_percent numeric(5, 2),
  signature_data text,
  signature_status asset_signature_status NOT NULL,
  signed_by_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  signed_by_name text NOT NULL DEFAULT '',
  signed_at timestamptz,
  return_signature_data text,
  return_signed_by_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  return_signed_by_name text NOT NULL DEFAULT '',
  return_signed_at timestamptz,
  PRIMARY KEY (request_id, box_id),
  CONSTRAINT asset_agreement_signers_position_nonnegative CHECK (position >= 0),
  CONSTRAINT asset_agreement_signers_page_valid CHECK (page IS NULL OR page IN (2, 3)),
  CONSTRAINT asset_agreement_signers_x_valid CHECK (x_percent IS NULL OR x_percent BETWEEN 0 AND 100),
  CONSTRAINT asset_agreement_signers_y_valid CHECK (y_percent IS NULL OR y_percent BETWEEN 0 AND 100),
  CONSTRAINT asset_agreement_signers_label_not_blank CHECK (length(btrim(label)) > 0),
  CONSTRAINT asset_agreement_signers_role_not_blank CHECK (length(btrim(role)) > 0)
);

CREATE INDEX asset_agreement_signers_actor_idx
  ON asset_agreement_signers (participant, lower(btrim(signer_name)), request_id);

CREATE TABLE asset_request_reads (
  request_id uuid NOT NULL REFERENCES asset_requests(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, employee_id)
);

CREATE TABLE asset_request_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES asset_requests(id) ON DELETE RESTRICT,
  actor_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_status asset_request_status,
  to_status asset_request_status,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asset_request_events_type_not_blank CHECK (length(btrim(event_type)) > 0),
  CONSTRAINT asset_request_events_details_object CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX asset_request_events_request_created_idx
  ON asset_request_events (request_id, created_at, id);
