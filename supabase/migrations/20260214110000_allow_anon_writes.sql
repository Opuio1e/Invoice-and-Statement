-- Allow anonymous writes so the UI can edit saved lists and invoices without sign-in.

GRANT INSERT, UPDATE, DELETE ON TABLE parties TO anon;
GRANT INSERT, UPDATE, DELETE ON TABLE invoices TO anon;
GRANT INSERT, UPDATE, DELETE ON TABLE invoice_items TO anon;
GRANT INSERT, UPDATE, DELETE ON TABLE lot_names TO anon;
GRANT INSERT, UPDATE, DELETE ON TABLE shapes TO anon;
GRANT INSERT, UPDATE, DELETE ON TABLE sizes TO anon;
GRANT INSERT, UPDATE, DELETE ON TABLE descriptions TO anon;
GRANT INSERT, UPDATE, DELETE ON TABLE grades TO anon;

DO $$
DECLARE
  tbl text;
  op text;
  auth_policy text;
  anon_policy text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY['parties', 'invoices', 'invoice_items', 'lot_names', 'shapes', 'sizes', 'descriptions', 'grades'])
  LOOP
    FOR op IN SELECT unnest(ARRAY['INSERT', 'UPDATE', 'DELETE']) LOOP
      auth_policy := format('Authenticated users can %s %s', lower(op), replace(tbl, '_', ' '));
      anon_policy := format('Anonymous users can %s %s', lower(op), replace(tbl, '_', ' '));

      EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', auth_policy, tbl);

      IF op = 'INSERT' THEN
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', anon_policy, tbl);
        EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO anon WITH CHECK (true);', anon_policy, tbl);
      ELSIF op = 'UPDATE' THEN
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', anon_policy, tbl);
        EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO anon USING (true) WITH CHECK (true);', anon_policy, tbl);
      ELSE
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', anon_policy, tbl);
        EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO anon USING (true);', anon_policy, tbl);
      END IF;
    END LOOP;
  END LOOP;
END
$$;
