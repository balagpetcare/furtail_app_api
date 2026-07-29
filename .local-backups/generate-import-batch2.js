const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../prisma/seeds/data');

console.log('Generating SQL for remaining areas (batch 2)...\n');

const areas = JSON.parse(fs.readFileSync(path.join(dataDir, 'bd.areas.json'), 'utf-8'));

// Import remaining areas (already imported 500, import next batch)
let sql = `-- Import remaining BD Areas (Batch 2)\nINSERT INTO bd_areas (code, "nameEn", "nameBn", type, "upazilaId", "districtId", latitude, longitude, "createdAt", "updatedAt") VALUES\n`;

const startIdx = 500;
const endIdx = Math.min(1000, areas.length);
const batch = areas.slice(startIdx, endIdx);

sql += batch
  .map((a, idx) => {
    const nameBn = a.nameBn ? `'${a.nameBn.replace(/'/g, "''")}'` : 'NULL';
    const type = a.type ? `'${a.type}'` : "'AREA'";
    const upazilaId = a.upazilaId || 'NULL';
    const districtId = a.districtId || 'NULL';
    const lat = a.latitude || 'NULL';
    const lng = a.longitude || 'NULL';
    return `('${a.code}', '${a.nameEn.replace(/'/g, "''")}', ${nameBn}, ${type}, ${upazilaId}, ${districtId}, ${lat}, ${lng}, NOW(), NOW())${idx < batch.length - 1 ? ',' : ';'}`;
  })
  .join('\n');

sql += `\n-- Imported: ${endIdx} of ${areas.length} areas\n`;

const outputFile = path.join(__dirname, 'import-legacy-batch2.sql');
fs.writeFileSync(outputFile, sql);

console.log(`✓ SQL generated: ${outputFile}`);
console.log(`  Records: ${endIdx} of ${areas.length} total areas`);
