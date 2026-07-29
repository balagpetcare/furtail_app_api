const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../prisma/seeds/data');
const areas = JSON.parse(fs.readFileSync(path.join(dataDir, 'bd.areas.json'), 'utf-8'));

console.log(
  `Generating ${Math.ceil((areas.length - 1000) / 500)} more batches for remaining areas...`,
);

for (let batchNum = 2; batchNum * 500 < areas.length; batchNum++) {
  const startIdx = batchNum * 500;
  const endIdx = Math.min((batchNum + 1) * 500, areas.length);
  const batch = areas.slice(startIdx, endIdx);

  let sql = `-- Import BD Areas (Batch ${batchNum + 1})\nINSERT INTO bd_areas (code, "nameEn", "nameBn", type, "upazilaId", "districtId", latitude, longitude, "createdAt", "updatedAt") VALUES\n`;

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

  const outputFile = path.join(__dirname, `import-legacy-batch${batchNum + 1}.sql`);
  fs.writeFileSync(outputFile, sql);
  console.log(`  Batch ${batchNum + 1}: ${endIdx} of ${areas.length} areas`);
}
