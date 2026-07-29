-- Clear existing sample data (keep backup)
DELETE FROM bd_areas;
DELETE FROM bd_unions;
DELETE FROM bd_upazilas;
DELETE FROM bd_districts;
DELETE FROM bd_divisions;
ALTER SEQUENCE bd_divisions_id_seq RESTART WITH 1;
ALTER SEQUENCE bd_districts_id_seq RESTART WITH 1;
ALTER SEQUENCE bd_upazilas_id_seq RESTART WITH 1;
ALTER SEQUENCE bd_unions_id_seq RESTART WITH 1;
ALTER SEQUENCE bd_areas_id_seq RESTART WITH 1;

-- Import BD Divisions from legacy seed
-- Using raw SQL INSERT with legacy code format to maintain compatibility
INSERT INTO bd_divisions (code, "nameEn", "nameBn", "createdAt", "updatedAt") VALUES
('DIV-1', 'Chattagram', 'চট্টগ্রাম', NOW(), NOW()),
('DIV-2', 'Rajshahi', 'রাজশাহী', NOW(), NOW()),
('DIV-3', 'Khulna', 'খুলনা', NOW(), NOW()),
('DIV-4', 'Barisal', 'বরিশাল', NOW(), NOW()),
('DIV-5', 'Sylhet', 'সিলেট', NOW(), NOW()),
('DIV-6', 'Dhaka', 'ঢাকা', NOW(), NOW()),
('DIV-7', 'Rangpur', 'রংপুর', NOW(), NOW()),
('DIV-8', 'Mymensingh', 'ময়মনসিংহ', NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

