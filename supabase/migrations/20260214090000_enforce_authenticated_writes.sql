-- Enforce authenticated-only writes for invoice system tables.
-- Reads remain public, writes are restricted to the authenticated role.

REVOKE INSERT, UPDATE, DELETE ON TABLE parties FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE invoices FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE invoice_items FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE lot_names FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE shapes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE sizes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE descriptions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE grades FROM anon;

DO $$
DECLARE
  tbl text;
  op text;
  policy_name text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY['parties', 'invoices', 'invoice_items', 'lot_names', 'shapes', 'sizes', 'descriptions', 'grades'])
  LOOP
    FOR op IN SELECT unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) LOOP
      policy_name := format('Authenticated users can %s %s', lower(op), replace(tbl, '_', ' '));
      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = tbl
          AND policyname = policy_name
      ) THEN
        IF op = 'INSERT' THEN
          EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (true);', policy_name, tbl);
        ELSIF op = 'UPDATE' THEN
          EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true);', policy_name, tbl);
        ELSE
          EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (true);', policy_name, tbl);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END
$$;
