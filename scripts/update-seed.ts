import * as fs from 'fs';
import * as path from 'path';

const dncc = JSON.parse(fs.readFileSync('migration-reports/dhaka-urban-review/dncc.review-worksheet.json', 'utf8'));
const dscc = JSON.parse(fs.readFileSync('migration-reports/dhaka-urban-review/dscc.review-worksheet.json', 'utf8'));
const seedPath = 'prisma/seeds/data/bd.wards-and-cc.json';
const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

const recordMap = new Map();
for (const r of dncc.records) recordMap.set(r.proposedCode, r);
for (const r of dscc.records) recordMap.set(r.proposedCode, r);

for (const item of seedData) {
  const r = recordMap.get(item.code);
  if (r) {
    item.reviewStatus = r.reviewStatus;
    item.currentValidity = r.currentHistoricalSourceStatus;
  }
}

fs.writeFileSync(seedPath, JSON.stringify(seedData, null, 2));
console.log('Seed updated.');
