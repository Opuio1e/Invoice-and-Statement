/*
  # Invoice and Statement Management System

  1. New Tables
    - `parties`
      - `id` (uuid, primary key)
      - `name` (text, unique) - Party/client name
      - `created_at` (timestamptz)
    
    - `invoices`
      - `id` (uuid, primary key)
      - `invoice_number` (text, unique) - Generated invoice number
      - `party_id` (uuid, foreign key to parties)
      - `transaction_type` (text) - Sales/Approval
      - `date` (date) - Invoice date
      - `total_pcs` (integer) - Total pieces
      - `total_cts` (numeric) - Total carats
      - `total_amount` (numeric) - Total amount
      - `average_price` (numeric) - Average price per carat
      - `remarks` (text)
      - `created_at` (timestamptz)
    
    - `invoice_items`
      - `id` (uuid, primary key)
      - `invoice_id` (uuid, foreign key to invoices)
      - `lot_no` (text)
      - `description` (text)
      - `shape` (text)
      - `size` (text)
      - `grade` (text)
      - `pcs` (integer) - Number of pieces
      - `cts` (numeric) - Carats
      - `price` (numeric) - Price per carat
      - `amount` (numeric) - Total amount for this item
      - `remarks` (text)
      - `sort_order` (integer) - Order of items in invoice
    
    - `lot_names`
      - `id` (uuid, primary key)
      - `name` (text, unique)
      - `created_at` (timestamptz)
    
    - `shapes`
      - `id` (uuid, primary key)
      - `name` (text, unique)
      - `created_at` (timestamptz)
    
    - `sizes`
      - `id` (uuid, primary key)
      - `name` (text, unique)
      - `created_at` (timestamptz)
    
    - `descriptions`
      - `id` (uuid, primary key)
      - `name` (text, unique)
      - `created_at` (timestamptz)
    
    - `grades`
      - `id` (uuid, primary key)
      - `name` (text, unique)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for public access (since this appears to be a single-user/internal system)
    - All tables allow SELECT to everyone
    - All tables allow INSERT/UPDATE/DELETE to authenticated users

  3. Important Notes
    - Using numeric type for currency and measurements for precision
    - Foreign keys ensure referential integrity
    - Unique constraints prevent duplicate entries
    - Default timestamps track record creation
*/

-- Create parties table
CREATE TABLE IF NOT EXISTS parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view parties"
  ON parties FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert parties"
  ON parties FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update parties"
  ON parties FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete parties"
  ON parties FOR DELETE
  TO authenticated
  USING (true);

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  party_id uuid REFERENCES parties(id) ON DELETE RESTRICT,
  transaction_type text NOT NULL,
  date date NOT NULL,
  total_pcs integer DEFAULT 0,
  total_cts numeric(12, 2) DEFAULT 0,
  total_amount numeric(12, 2) DEFAULT 0,
  average_price numeric(12, 2) DEFAULT 0,
  remarks text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view invoices"
  ON invoices FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (true);

-- Create invoice_items table
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE CASCADE,
  lot_no text DEFAULT '',
  description text DEFAULT '',
  shape text DEFAULT '',
  size text DEFAULT '',
  grade text DEFAULT '',
  pcs integer DEFAULT 0,
  cts numeric(12, 2) DEFAULT 0,
  price numeric(12, 2) DEFAULT 0,
  amount numeric(12, 2) DEFAULT 0,
  remarks text DEFAULT '',
  sort_order integer DEFAULT 0
);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view invoice items"
  ON invoice_items FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert invoice items"
  ON invoice_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update invoice items"
  ON invoice_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete invoice items"
  ON invoice_items FOR DELETE
  TO authenticated
  USING (true);

-- Create lot_names table
CREATE TABLE IF NOT EXISTS lot_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE lot_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view lot names"
  ON lot_names FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert lot names"
  ON lot_names FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update lot names"
  ON lot_names FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete lot names"
  ON lot_names FOR DELETE
  TO authenticated
  USING (true);

-- Create shapes table
CREATE TABLE IF NOT EXISTS shapes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE shapes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view shapes"
  ON shapes FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert shapes"
  ON shapes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update shapes"
  ON shapes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete shapes"
  ON shapes FOR DELETE
  TO authenticated
  USING (true);

-- Create sizes table
CREATE TABLE IF NOT EXISTS sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view sizes"
  ON sizes FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert sizes"
  ON sizes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update sizes"
  ON sizes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete sizes"
  ON sizes FOR DELETE
  TO authenticated
  USING (true);

-- Create descriptions table
CREATE TABLE IF NOT EXISTS descriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE descriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view descriptions"
  ON descriptions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert descriptions"
  ON descriptions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update descriptions"
  ON descriptions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete descriptions"
  ON descriptions FOR DELETE
  TO authenticated
  USING (true);

-- Create grades table
CREATE TABLE IF NOT EXISTS grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view grades"
  ON grades FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert grades"
  ON grades FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update grades"
  ON grades FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete grades"
  ON grades FOR DELETE
  TO authenticated
  USING (true);

-- Seed pre-saved lists from the existing UI
INSERT INTO lot_names (name) VALUES
  ('LOT 65'),
  ('AJMZ 2'),
  ('AJMZ 3'),
  ('AJMZ 4'),
  ('MEH 1')
ON CONFLICT (name) DO NOTHING;

INSERT INTO shapes (name) VALUES
  ('OV/PS'),
  ('OVAL'),
  ('PEARS'),
  ('E/C'),
  ('ROUND'),
  ('HXA'),
  ('MIX'),
  ('OCT'),
  ('MQ')
ON CONFLICT (name) DO NOTHING;

INSERT INTO sizes (name) VALUES
  ('4X3'),
  ('5X3'),
  ('4.5X3.5'),
  ('5X4'),
  ('6X4'),
  ('7X5'),
  ('8X6'),
  ('9X7'),
  ('MIX'),
  ('3MM'),
  ('4MM'),
  ('5MM'),
  ('6MM'),
  ('7MM')
ON CONFLICT (name) DO NOTHING;

INSERT INTO descriptions (name) VALUES
  ('Brilliant cut'),
  ('Step cut'),
  ('Mixed cut'),
  ('Rose cut'),
  ('Cabochon')
ON CONFLICT (name) DO NOTHING;

INSERT INTO grades (name) VALUES
  ('#1'),
  ('#2'),
  ('#3'),
  ('#4'),
  ('#5')
ON CONFLICT (name) DO NOTHING;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_invoices_party_id ON invoices(party_id);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_sort_order ON invoice_items(invoice_id, sort_order);