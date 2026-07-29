const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../prisma/seeds/data');

console.log('Generating SQL import statements from legacy seed files...\n');

// Start with cleanup
let sql = `
-- Clear existing sample data
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

`;

// Import divisions
console.log('Processing divisions...');
const divisions = JSON.parse(fs.readFileSync(path.join(dataDir, 'bd.divisions.json'), 'utf-8'));

sql += `-- Import BD Divisions (${divisions.length} records)\nINSERT INTO bd_divisions (code, "nameEn", "nameBn", "createdAt", "updatedAt") VALUES\n`;
sql += divisions
  .map((d, idx) => {
    const nameBn = d.nameBn ? `'${d.nameBn.replace(/'/g, "''")}'` : 'NULL';
    return `('${d.code}', '${d.nameEn.replace(/'/g, "''")}', ${nameBn}, NOW(), NOW())${idx < divisions.length - 1 ? ',' : ';'}`;
  })
  .join('\n');
sql += '\n\n';

// Import districts
console.log('Processing districts...');
const districts = JSON.parse(fs.readFileSync(path.join(dataDir, 'bd.districts.json'), 'utf-8'));

// Map division codes to IDs
const divisionMap = {};
divisions.forEach((d, idx) => {
  divisionMap[d.code] = idx + 1;
});

sql += `-- Import BD Districts (${districts.length} records)\nINSERT INTO bd_districts (code, "nameEn", "nameBn", "divisionId", latitude, longitude, "createdAt", "updatedAt") VALUES\n`;
sql += districts
  .map((d, idx) => {
    const divId = divisionMap[d.division] || 1;
    const nameBn = d.nameBn ? `'${d.nameBn.replace(/'/g, "''")}'` : 'NULL';
    const lat = d.latitude || 'NULL';
    const lng = d.longitude || 'NULL';
    return `('${d.code}', '${d.nameEn.replace(/'/g, "''")}', ${nameBn}, ${divId}, ${lat}, ${lng}, NOW(), NOW())${idx < districts.length - 1 ? ',' : ';'}`;
  })
  .join('\n');
sql += '\n\n';

// Import upazilas
console.log('Processing upazilas...');
const upazilas = JSON.parse(fs.readFileSync(path.join(dataDir, 'bd.upazilas.json'), 'utf-8'));

// Map district codes to IDs
const districtMap = {};
districts.forEach((d, idx) => {
  districtMap[d.code] = idx + 1;
});

sql += `-- Import BD Upazilas (${upazilas.length} records)\nINSERT INTO bd_upazilas (code, "nameEn", "nameBn", "districtId", latitude, longitude, "createdAt", "updatedAt") VALUES\n`;
sql += upazilas
  .map((u, idx) => {
    const distId = districtMap[u.district] || 1;
    const nameBn = u.nameBn ? `'${u.nameBn.replace(/'/g, "''")}'` : 'NULL';
    const lat = u.latitude || 'NULL';
    const lng = u.longitude || 'NULL';
    return `('${u.code}', '${u.nameEn.replace(/'/g, "''")}', ${nameBn}, ${distId}, ${lat}, ${lng}, NOW(), NOW())${idx < upazilas.length - 1 ? ',' : ';'}`;
  })
  .join('\n');
sql += '\n\n';

// Import areas (note: may need special handling if no unions exist yet)
console.log('Processing areas...');
const areas = JSON.parse(fs.readFileSync(path.join(dataDir, 'bd.areas.json'), 'utf-8'));

// Map upazila codes to IDs
const upazilaMap = {};
upazilas.forEach((u, idx) => {
  upazilaMap[u.code] = idx + 1;
});

sql += `-- Import BD Areas (${areas.length} records)\n`;
sql += `-- Note: Areas may have complex parent references - using partial insert\n`;
sql += `INSERT INTO bd_areas (code, "nameEn", "nameBn", type, "upazilaId", "districtId", latitude, longitude, "createdAt", "updatedAt") VALUES\n`;

// Only include first 500 areas to avoid SQL size limits, rest marked as deferred
const areasBatch = areas.slice(0, 500);
sql += areasBatch
  .map((a, idx) => {
    const nameBn = a.nameBn ? `'${a.nameBn.replace(/'/g, "''")}'` : 'NULL';
    const type = a.type ? `'${a.type}'` : "'AREA'";
    const upazilaId = a.upazilaId || 'NULL';
    const districtId = a.districtId || 'NULL';
    const lat = a.latitude || 'NULL';
    const lng = a.longitude || 'NULL';
    return `('${a.code}', '${a.nameEn.replace(/'/g, "''")}', ${nameBn}, ${type}, ${upazilaId}, ${districtId}, ${lat}, ${lng}, NOW(), NOW())${idx < areasBatch.length - 1 ? ',' : ';'}`;
  })
  .join('\n');
sql += '\n\n';

sql += `-- Note: ${areas.length - areasBatch.length} additional areas deferred due to SQL size limits\n`;
sql += `-- These will be imported in a separate batch\n`;

// Write to file
const outputFile = path.join(__dirname, 'import-legacy-complete.sql');
fs.writeFileSync(outputFile, sql);

console.log(`\n✓ SQL generated: ${outputFile}`);
console.log(
  `  Total records processed: ${divisions.length + districts.length + upazilas.length + areasBatch.length}`,
);
console.log(`  Deferred areas: ${areas.length - areasBatch.length}`);
console.log(`\nFile size: ${Math.round(fs.statSync(outputFile).size / 1024)} KB`);
