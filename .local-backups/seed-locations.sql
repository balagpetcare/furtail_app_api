-- Seed Upazilas
INSERT INTO "bd_upazilas" ("code", "nameEn", "nameBn", "districtId", "latitude", "longitude", "createdAt", "updatedAt") VALUES
('BD-DH-DA-DA', 'Dhaka Sadar', 'ঢাকা সদর', 1, 23.7104, 90.4073, NOW(), NOW()),
('BD-DH-DA-AD', 'Adabor', 'আদাবর', 1, 23.8000, 90.3500, NOW(), NOW()),
('BD-DH-GA-GA', 'Gazipur Sadar', 'গাজীপুর সদর', 2, 24.0041, 90.4256, NOW(), NOW()),
('BD-DH-NR-NR', 'Narayanganj Sadar', 'নারায়ণগঞ্জ সদর', 3, 23.6127, 90.4949, NOW(), NOW()),
('BD-CH-CT-CT', 'Chittagong Sadar', 'চট্টগ্রাম সদর', 6, 22.3384, 91.8265, NOW(), NOW()),
('BD-CH-CX-CX', 'Cox''s Bazar Sadar', 'কক্সবাজার সদর', 7, 21.4515, 91.9680, NOW(), NOW()),
('BD-KH-KH-KH', 'Khulna Sadar', 'খুলনা সদর', 10, 22.8138, 89.1713, NOW(), NOW()),
('BD-RJ-RJ-RJ', 'Rajshahi Sadar', 'রাজশাহী সদর', 13, 24.3745, 88.6042, NOW(), NOW()),
('BD-SY-SY-SY', 'Sylhet Sadar', 'সিলেট সদর', 16, 24.8949, 91.8687, NOW(), NOW()),
('BD-BR-BR-BR', 'Barisal Sadar', 'বরিশাল সদর', 18, 22.7010, 90.3535, NOW(), NOW()),
('BD-RN-RN-RN', 'Rangpur Sadar', 'রংপুর সদর', 20, 25.7459, 89.2500, NOW(), NOW()),
('BD-MY-MY-MY', 'Mymensingh Sadar', 'ময়মনসিংহ সদর', 22, 24.7465, 90.4081, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Seed Unions
INSERT INTO "bd_unions" ("code", "nameEn", "nameBn", "upazilaId", "latitude", "longitude", "createdAt", "updatedAt") VALUES
('BD-DH-DA-DA-MO', 'Motijheel', 'মতিঝিল', 1, 23.7613, 90.3818, NOW(), NOW()),
('BD-DH-DA-DA-PA', 'Paltan', 'পল্টন', 1, 23.7550, 90.4000, NOW(), NOW()),
('BD-DH-DA-AD-AD', 'Adabor Union', 'আদাবর ইউনিয়ন', 2, 23.8000, 90.3500, NOW(), NOW()),
('BD-DH-GA-GA-GA', 'Gazipur Sadar Union', 'গাজীপুর সদর ইউনিয়ন', 3, 24.0041, 90.4256, NOW(), NOW()),
('BD-DH-NR-NR-NR', 'Narayanganj Sadar Union', 'নারায়ণগঞ্জ সদর ইউনিয়ন', 4, 23.6127, 90.4949, NOW(), NOW()),
('BD-CH-CT-CT-CT', 'Chittagong Sadar Union', 'চট্টগ্রাম সদর ইউনিয়ন', 5, 22.3384, 91.8265, NOW(), NOW()),
('BD-CH-CX-CX-CX', 'Cox''s Bazar Sadar Union', 'কক্সবাজার সদর ইউনিয়ন', 6, 21.4515, 91.9680, NOW(), NOW()),
('BD-KH-KH-KH-KH', 'Khulna Sadar Union', 'খুলনা সদর ইউনিয়ন', 7, 22.8138, 89.1713, NOW(), NOW()),
('BD-RJ-RJ-RJ-RJ', 'Rajshahi Sadar Union', 'রাজশাহী সদর ইউনিয়ন', 8, 24.3745, 88.6042, NOW(), NOW()),
('BD-SY-SY-SY-SY', 'Sylhet Sadar Union', 'সিলেট সদর ইউনিয়ন', 9, 24.8949, 91.8687, NOW(), NOW()),
('BD-BR-BR-BR-BR', 'Barisal Sadar Union', 'বরিশাল সদর ইউনিয়ন', 10, 22.7010, 90.3535, NOW(), NOW()),
('BD-RN-RN-RN-RN', 'Rangpur Sadar Union', 'রংপুর সদর ইউনিয়ন', 11, 25.7459, 89.2500, NOW(), NOW()),
('BD-MY-MY-MY-MY', 'Mymensingh Sadar Union', 'ময়মনসিংহ সদর ইউনিয়ন', 12, 24.7465, 90.4081, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Seed Areas (wards/neighborhoods)
INSERT INTO "bd_areas" ("code", "nameEn", "nameBn", "type", "unionId", "upazilaId", "districtId", "parentId", "latitude", "longitude", "createdAt", "updatedAt") VALUES
('BD-DH-DA-DA-MO-W01', 'Motijheel Ward 1', 'মতিঝিল ওয়ার্ড ১', 'WARD', 1, 1, 1, NULL, 23.7620, 90.3820, NOW(), NOW()),
('BD-DH-DA-DA-MO-W02', 'Motijheel Ward 2', 'মতিঝিল ওয়ার্ড ২', 'WARD', 1, 1, 1, NULL, 23.7650, 90.3850, NOW(), NOW()),
('BD-DH-DA-DA-PA-W01', 'Paltan Ward 1', 'পল্টন ওয়ার্ড ১', 'WARD', 2, 1, 1, NULL, 23.7560, 90.4010, NOW(), NOW()),
('BD-DH-DA-AD-AD-A01', 'Adabor Area 1', 'আদাবর এলাকা ১', 'AREA', 3, 2, 1, NULL, 23.8010, 90.3510, NOW(), NOW()),
('BD-DH-GA-GA-GA-A01', 'Gazipur Area 1', 'গাজীপুর এলাকা ১', 'AREA', 4, 3, 2, NULL, 24.0050, 90.4260, NOW(), NOW()),
('BD-DH-NR-NR-NR-A01', 'Narayanganj Area 1', 'নারায়ণগঞ্জ এলাকা ১', 'AREA', 5, 4, 3, NULL, 23.6130, 90.4950, NOW(), NOW()),
('BD-CH-CT-CT-CT-A01', 'Chittagong Area 1', 'চট্টগ্রাম এলাকা ১', 'AREA', 6, 5, 6, NULL, 22.3390, 91.8270, NOW(), NOW()),
('BD-CH-CX-CX-CX-A01', 'Cox''s Bazar Area 1', 'কক্সবাজার এলাকা ১', 'AREA', 7, 6, 7, NULL, 21.4520, 91.9685, NOW(), NOW()),
('BD-KH-KH-KH-KH-A01', 'Khulna Area 1', 'খুলনা এলাকা ১', 'AREA', 8, 7, 10, NULL, 22.8140, 89.1715, NOW(), NOW()),
('BD-RJ-RJ-RJ-RJ-A01', 'Rajshahi Area 1', 'রাজশাহী এলাকা ১', 'AREA', 9, 8, 13, NULL, 24.3750, 88.6045, NOW(), NOW()),
('BD-SY-SY-SY-SY-A01', 'Sylhet Area 1', 'সিলেট এলাকা ১', 'AREA', 10, 9, 16, NULL, 24.8950, 91.8690, NOW(), NOW()),
('BD-BR-BR-BR-BR-A01', 'Barisal Area 1', 'বরিশাল এলাকা ১', 'AREA', 11, 10, 18, NULL, 22.7010, 90.3540, NOW(), NOW()),
('BD-RN-RN-RN-RN-A01', 'Rangpur Area 1', 'রংপুর এলাকা ১', 'AREA', 12, 11, 20, NULL, 25.7460, 89.2505, NOW(), NOW()),
('BD-MY-MY-MY-MY-A01', 'Mymensingh Area 1', 'ময়মনসিংহ এলাকা ১', 'AREA', 13, 12, 22, NULL, 24.7470, 90.4085, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;
