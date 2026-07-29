-- Seed Bangladesh Divisions
INSERT INTO "bd_divisions" ("code", "nameEn", "nameBn", "createdAt", "updatedAt") VALUES
('BD-DH', 'Dhaka', 'ঢাকা', NOW(), NOW()),
('BD-CH', 'Chittagong', 'চট্টগ্রাম', NOW(), NOW()),
('BD-KH', 'Khulna', 'খুলনা', NOW(), NOW()),
('BD-RJ', 'Rajshahi', 'রাজশাহী', NOW(), NOW()),
('BD-SY', 'Sylhet', 'সিলেট', NOW(), NOW()),
('BD-BR', 'Barisal', 'বরিশাল', NOW(), NOW()),
('BD-RN', 'Rangpur', 'রংপুর', NOW(), NOW()),
('BD-MY', 'Mymensingh', 'ময়মনসিংহ', NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Seed Districts
INSERT INTO "bd_districts" ("code", "nameEn", "nameBn", "divisionId", "latitude", "longitude", "createdAt", "updatedAt") VALUES
('BD-DH-DA', 'Dhaka', 'ঢাকা', 1, 23.8103, 90.4125, NOW(), NOW()),
('BD-DH-GA', 'Gazipur', 'গাজীপুর', 1, 24.0041, 90.4256, NOW(), NOW()),
('BD-DH-NR', 'Narayanganj', 'নারায়ণগঞ্জ', 1, 23.6127, 90.4949, NOW(), NOW()),
('BD-DH-SH', 'Shariatpur', 'শরীয়তপুর', 1, 23.2416, 90.2706, NOW(), NOW()),
('BD-DH-RJ', 'Rajbari', 'রাজবাড়ী', 1, 23.7461, 89.5498, NOW(), NOW()),
('BD-CH-CT', 'Chittagong', 'চট্টগ্রাম', 2, 22.3384, 91.8265, NOW(), NOW()),
('BD-CH-CX', 'Cox''s Bazar', 'কক্সবাজার', 2, 21.4515, 91.9680, NOW(), NOW()),
('BD-CH-KM', 'Khagrachhari', 'খাগ্রাছড়ি', 2, 22.4769, 91.9850, NOW(), NOW()),
('BD-CH-RN', 'Rangamati', 'রাঙ্গামাটি', 2, 22.6505, 92.1700, NOW(), NOW()),
('BD-KH-KH', 'Khulna', 'খুলনা', 3, 22.8138, 89.1713, NOW(), NOW()),
('BD-KH-BA', 'Bagerhat', 'বাগেরহাট', 3, 22.6514, 89.7839, NOW(), NOW()),
('BD-KH-SA', 'Satkhira', 'সাতক্ষীরা', 3, 22.7185, 89.0705, NOW(), NOW()),
('BD-RJ-RJ', 'Rajshahi', 'রাজশাহী', 4, 24.3745, 88.6042, NOW(), NOW()),
('BD-RJ-NW', 'Natore', 'নাটোর', 4, 24.4213, 88.9759, NOW(), NOW()),
('BD-RJ-NP', 'Naogaon', 'নওগাঁ', 4, 24.8625, 88.1381, NOW(), NOW()),
('BD-SY-SY', 'Sylhet', 'সিলেট', 5, 24.8949, 91.8687, NOW(), NOW()),
('BD-SY-MC', 'Moulvibazar', 'মৌলভীবাজার', 5, 24.4834, 91.5466, NOW(), NOW()),
('BD-BR-BR', 'Barisal', 'বরিশাল', 6, 22.7010, 90.3535, NOW(), NOW()),
('BD-BR-JP', 'Jhalokati', 'ঝালকাঠি', 6, 22.6344, 90.2006, NOW(), NOW()),
('BD-RN-RN', 'Rangpur', 'রংপুর', 7, 25.7459, 89.2500, NOW(), NOW()),
('BD-RN-DI', 'Dinajpur', 'দিনাজপুর', 7, 25.6282, 88.6390, NOW(), NOW()),
('BD-MY-MY', 'Mymensingh', 'ময়মনসিংহ', 8, 24.7465, 90.4081, NOW(), NOW()),
('BD-MY-JM', 'Jamalpur', 'জামালপুর', 8, 24.9144, 90.9469, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Seed Animal Categories
INSERT INTO "animal_categories" ("code", "name", "displayOrder", "isActive", "createdAt", "updatedAt") VALUES
('MAMMAL', 'Mammals', 1, true, NOW(), NOW()),
('BIRD', 'Birds', 2, true, NOW(), NOW()),
('REPTILE', 'Reptiles', 3, true, NOW(), NOW()),
('AQUATIC', 'Aquatic Animals', 4, true, NOW(), NOW()),
('INSECT', 'Insects', 5, true, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Seed Animal Types
INSERT INTO "animal_types" ("name", "categoryId", "code", "scientificName", "icon", "displayOrder", "isActive", "createdAt", "updatedAt") VALUES
('Dog', 1, 'DOG', 'Canis lupus familiaris', '🐕', 1, true, NOW(), NOW()),
('Cat', 1, 'CAT', 'Felis catus', '🐈', 2, true, NOW(), NOW()),
('Rabbit', 1, 'RABBIT', 'Oryctolagus cuniculus', '🐰', 3, true, NOW(), NOW()),
('Guinea Pig', 1, 'GUINEA_PIG', 'Cavia porcellus', '🐹', 4, true, NOW(), NOW()),
('Parrot', 2, 'PARROT', 'Psittacidae', '🦜', 5, true, NOW(), NOW()),
('Pigeon', 2, 'PIGEON', 'Columba livia', '🕊️', 6, true, NOW(), NOW()),
('Fish', 4, 'FISH', 'Actinopterygii', '🐠', 7, true, NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- Seed Animal Sizes
INSERT INTO "animal_sizes" ("code", "name", "minWeightKg", "maxWeightKg", "displayOrder", "isActive", "createdAt", "updatedAt") VALUES
('XS', 'Extra Small', 0, 2, 1, true, NOW(), NOW()),
('S', 'Small', 2, 5, 2, true, NOW(), NOW()),
('M', 'Medium', 5, 15, 3, true, NOW(), NOW()),
('L', 'Large', 15, 30, 4, true, NOW(), NOW()),
('XL', 'Extra Large', 30, NULL, 5, true, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Seed Animal Colors
INSERT INTO "animal_colors" ("code", "name", "hexPreview", "displayOrder", "isActive", "createdAt", "updatedAt") VALUES
('BLACK', 'Black', '#000000', 1, true, NOW(), NOW()),
('WHITE', 'White', '#FFFFFF', 2, true, NOW(), NOW()),
('BROWN', 'Brown', '#8B4513', 3, true, NOW(), NOW()),
('RED', 'Red', '#FF0000', 4, true, NOW(), NOW()),
('GRAY', 'Gray', '#808080', 5, true, NOW(), NOW()),
('ORANGE', 'Orange', '#FFA500', 6, true, NOW(), NOW()),
('YELLOW', 'Yellow', '#FFFF00', 7, true, NOW(), NOW()),
('TRI_COLOR', 'Tri-color', '#CCCCCC', 8, true, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Seed Coat Patterns
INSERT INTO "coat_patterns" ("code", "name", "displayOrder", "isActive", "createdAt", "updatedAt") VALUES
('SOLID', 'Solid', 1, true, NOW(), NOW()),
('SPOTTED', 'Spotted', 2, true, NOW(), NOW()),
('STRIPED', 'Striped', 3, true, NOW(), NOW()),
('PATCHED', 'Patched', 4, true, NOW(), NOW()),
('BRINDLE', 'Brindle', 5, true, NOW(), NOW()),
('MERLE', 'Merle', 6, true, NOW(), NOW()),
('TABBY', 'Tabby', 7, true, NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Seed Breeds
INSERT INTO "breeds" ("name", "animalTypeId", "code", "aliasNames", "originCountry", "defaultSizeId", "isMixed", "isOther", "displayOrder", "isActive", "createdAt", "updatedAt") VALUES
('German Shepherd', 1, 'GERMAN_SHEPHERD', '["GSD", "Alsatian"]'::jsonb, 'Germany', 4, false, false, 1, true, NOW(), NOW()),
('Labrador', 1, 'LABRADOR', '["Lab", "Labrador Retriever"]'::jsonb, 'Canada', 4, false, false, 2, true, NOW(), NOW()),
('Golden Retriever', 1, 'GOLDEN_RETRIEVER', '["Golden", "Goldie"]'::jsonb, 'Scotland', 4, false, false, 3, true, NOW(), NOW()),
('Poodle', 1, 'POODLE', '["Standard Poodle"]'::jsonb, 'France', 3, false, false, 4, true, NOW(), NOW()),
('Shih Tzu', 1, 'SHIH_TZU', '["Lion Dog"]'::jsonb, 'China', 2, false, false, 5, true, NOW(), NOW()),
('Mixed Breed', 1, 'MIXED', '["Mutt", "Crossbreed"]'::jsonb, NULL, NULL, true, false, 99, true, NOW(), NOW()),
('Other Dog', 1, 'OTHER_DOG', '["Unknown Breed"]'::jsonb, NULL, NULL, false, true, 100, true, NOW(), NOW()),
('Persian', 2, 'PERSIAN', '["Persian Cat"]'::jsonb, 'Iran', 2, false, false, 1, true, NOW(), NOW()),
('Siamese', 2, 'SIAMESE', '["Thai Cat"]'::jsonb, 'Thailand', 2, false, false, 2, true, NOW(), NOW()),
('Bengal', 2, 'BENGAL', '["Bengal Cat"]'::jsonb, 'United States', 2, false, false, 3, true, NOW(), NOW()),
('Mixed Cat', 2, 'MIXED_CAT', '["Crossbreed"]'::jsonb, NULL, NULL, true, false, 99, true, NOW(), NOW()),
('Other Cat', 2, 'OTHER_CAT', '["Unknown Breed"]'::jsonb, NULL, NULL, false, true, 100, true, NOW(), NOW())
ON CONFLICT (name, "animalTypeId") DO NOTHING;
