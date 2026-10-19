CREATE TABLE acme.contact (
  id uuid PRIMARY KEY,
  -- @pii: basis=contract, retention=5y
  primary_email text NOT NULL,
  phone text, -- @pii: basis=consent, retention=2y
  label text NOT NULL
);

ALTER TABLE acme.contact
  ADD COLUMN cpf text; -- @pii: basis=legal-obligation, retention=10y
