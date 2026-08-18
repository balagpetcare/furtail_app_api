import { getPrisma } from '../src/infrastructure/db/prisma-client';
import { existsSync } from 'node:fs';
import { resolveStoredMediaPath } from '../src/modules/media/media-storage';

async function main() {
  const prisma = getPrisma();

  // Find posts with media relationships
  const postsWithMedia = await prisma.post.findMany({
    where: {
      media: { some: {} }
    },
    include: {
      author: {
        include: {
          profile: true
        }
      },
      media: {
        include: {
          media: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`=== ACTIVE POSTS WITH MEDIA: ${postsWithMedia.length} ===\n`);

  let validRelations = 0;
  let missingMediaRows = 0;
  let missingObjects = 0;

  for (const post of postsWithMedia) {
    const authorName = post.author?.profile?.displayName || 'Unknown Author';
    console.log(`Post ID: ${post.id} | Author: ${authorName} | Caption: "${post.caption?.slice(0, 40)}"`);

    for (const pm of post.media) {
      if (!pm.media) {
        console.log(`  -> [MISSING DB ROW] Link ID: ${pm.id} | Media ID: ${pm.mediaId}`);
        missingMediaRows++;
        continue;
      }
      validRelations++;

      const media = pm.media;
      const filePath = resolveStoredMediaPath(media.storageKey);
      const fileExists = existsSync(filePath);

      console.log(`  -> Media ID: ${media.id}`);
      console.log(`     Key: ${media.storageKey}`);
      console.log(`     URL: ${media.url}`);
      console.log(`     File Exists: ${fileExists ? 'YES' : 'NO'} (${filePath})`);

      if (!fileExists) {
        missingObjects++;
      }
    }
    console.log('');
  }

  console.log('=== AUDIT SUMMARY ===');
  console.log(`Total Posts with Media: ${postsWithMedia.length}`);
  console.log(`Valid Media Relations: ${validRelations}`);
  console.log(`Missing Media DB Rows: ${missingMediaRows}`);
  console.log(`Missing Disk Files: ${missingObjects}`);

  await prisma.$disconnect();
}

main().catch(console.error);
