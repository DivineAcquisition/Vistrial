-- Make business_id nullable on service_types so conversion engine can use org_id instead.
-- The original table was designed with business_id for the booking system.
-- The conversion engine uses org_id. Both can coexist.
ALTER TABLE service_types ALTER COLUMN business_id DROP NOT NULL;
