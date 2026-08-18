import { PrismaClient } from '@prisma/client';
import { searchAll } from './src/modules/search/search.service';
const prisma = new PrismaClient();
async function run() {
  try {
    const res = await searchAll(prisma, 1, { query: 'bala g' });
    console.log(JSON.stringify(res, null, 2));
  } catch(e) {
    console.error(e);
  }
}
run();