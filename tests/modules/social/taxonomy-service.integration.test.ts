import { getTestPrisma } from '../../helpers/test-prisma';
import {
  TaxonomyService,
  TaxonomyDuplicateKeyError,
  TaxonomyNotFoundError,
} from '../../../src/modules/social/taxonomy-service';

/**
 * Real-database proof that every Create Post taxonomy (Feeling, Activity,
 * Category, ContentTag, BackgroundStyle) is genuinely database-backed:
 * active/inactive filtering, sort order, search, and full admin CRUD
 * (including duplicate-key and not-found rejection) against the dedicated
 * test database — not an in-memory stand-in.
 */
describe('TaxonomyService (Prisma-backed)', () => {
  const prisma = getTestPrisma();
  const service = new TaxonomyService(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  let counter = 0;
  function uniqueKey(prefix: string): string {
    counter += 1;
    return `${prefix}_${Date.now()}_${counter}`;
  }

  describe('getActivePostFeelings', () => {
    it('returns only active feelings, sorted by sortOrder', async () => {
      const feelings = await service.getActivePostFeelings();
      expect(Array.isArray(feelings)).toBe(true);
      expect(feelings.length).toBeGreaterThan(0);
      expect(feelings.every((f) => f.isActive === true)).toBe(true);
      for (let i = 1; i < feelings.length; i++) {
        const prev = feelings[i - 1];
        const curr = feelings[i];
        expect(prev).toBeDefined();
        expect(curr).toBeDefined();
        expect(curr!.sortOrder).toBeGreaterThanOrEqual(prev!.sortOrder);
      }
    });

    it('supports search by label', async () => {
      const feelings = await service.getActivePostFeelings('happy');
      expect(feelings.length).toBeGreaterThan(0);
      expect(feelings.some((f) => f.label.toLowerCase().includes('happy'))).toBe(true);
    });

    it('excludes a feeling once disabled, and listAll still includes it', async () => {
      const key = uniqueKey('feeling_toggle');
      const created = await service.createFeeling({ key, label: 'Toggle Test', emoji: '😊' });
      try {
        await service.updateFeeling(created.id, { isActive: false });
        const active = await service.getActivePostFeelings();
        expect(active.map((f) => f.key)).not.toContain(key);
        const all = await service.listAllPostFeelings();
        expect(all.map((f) => f.key)).toContain(key);
      } finally {
        await service.deleteFeeling(created.id);
      }
    });
  });

  describe('getActivePostActivities', () => {
    it('returns active activities filtered by category', async () => {
      const petCare = await service.getActivePostActivities(undefined, 'Pet Care');
      expect(petCare.length).toBeGreaterThan(0);
      expect(petCare.every((a) => a.category === 'Pet Care')).toBe(true);
    });

    it('supports search by label', async () => {
      const activities = await service.getActivePostActivities('walking');
      expect(activities.some((a) => a.label.toLowerCase().includes('walking'))).toBe(true);
    });
  });

  describe('getActivePostCategories', () => {
    it('returns the seeded canonical categories', async () => {
      const categories = await service.getActivePostCategories();
      expect(categories.length).toBeGreaterThan(0);
      expect(categories.map((c) => c.key)).toEqual(expect.arrayContaining(['general', 'fundraising']));
    });
  });

  describe('getActiveContentTags', () => {
    it('returns seeded content tags', async () => {
      const tags = await service.getActiveContentTags();
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.every((t) => t.isActive === true)).toBe(true);
    });
  });

  describe('getActiveBackgroundStyles', () => {
    it('returns the 6 stable Flutter-shared canonical keys with structured gradient + textColor fields', async () => {
      const styles = await service.getActiveBackgroundStyles();
      const canonicalIds = ['none', 'orange_red', 'blue_purple', 'dark_purple', 'green_teal', 'midnight'];
      const returnedIds = styles.map((s) => s.key);
      for (const id of canonicalIds) {
        expect(returnedIds).toContain(id);
      }

      const orangeRed = styles.find((s) => s.key === 'orange_red');
      expect(orangeRed).toBeDefined();
      expect(orangeRed!.styleType).toBe('gradient');
      expect(orangeRed!.colorValue).toBeTruthy();
      expect(orangeRed!.colorValueEnd).toBeTruthy();
      expect(orangeRed!.textColor).toBe('#FFFFFF');

      const none = styles.find((s) => s.key === 'none');
      expect(none).toBeDefined();
      expect(none!.textColor).toBe('#000000');
    });
  });

  describe('Admin: Feeling CRUD', () => {
    it('creates, updates, and deletes a feeling', async () => {
      const key = uniqueKey('feeling');
      const created = await service.createFeeling({ key, label: 'Test Joy', emoji: '😄' });
      expect(created.key).toBe(key);
      expect(created.label).toBe('Test Joy');
      expect(created.emoji).toBe('😄');
      expect(created.isActive).toBe(true);

      const updated = await service.updateFeeling(created.id, { label: 'Renamed', sortOrder: 999 });
      expect(updated.label).toBe('Renamed');
      expect(updated.sortOrder).toBe(999);

      await service.deleteFeeling(created.id);
      const all = await service.listAllPostFeelings();
      expect(all.map((f) => f.id)).not.toContain(created.id);
    });

    it('rejects creating a feeling with a duplicate key', async () => {
      const key = uniqueKey('feeling_dup');
      const created = await service.createFeeling({ key, label: 'First', emoji: '😊' });
      try {
        await expect(service.createFeeling({ key, label: 'Second', emoji: '😢' })).rejects.toBeInstanceOf(
          TaxonomyDuplicateKeyError,
        );
      } finally {
        await service.deleteFeeling(created.id);
      }
    });

    it('rejects updating a feeling that does not exist', async () => {
      await expect(service.updateFeeling(999_999_999, { label: 'x' })).rejects.toBeInstanceOf(
        TaxonomyNotFoundError,
      );
    });
  });

  describe('Admin: Activity CRUD', () => {
    it('creates, updates, and deletes an activity', async () => {
      const key = uniqueKey('activity');
      const created = await service.createActivity({ key, label: 'Test Activity', emoji: '🎯', category: 'Test' });
      expect(created.key).toBe(key);
      expect(created.category).toBe('Test');

      const updated = await service.updateActivity(created.id, { category: 'Renamed Category' });
      expect(updated.category).toBe('Renamed Category');

      await service.deleteActivity(created.id);
      const all = await service.listAllPostActivities();
      expect(all.map((a) => a.id)).not.toContain(created.id);
    });

    it('rejects a duplicate activity key', async () => {
      const key = uniqueKey('activity_dup');
      const created = await service.createActivity({ key, label: 'A', emoji: '🎯', category: 'Test' });
      try {
        await expect(
          service.createActivity({ key, label: 'B', emoji: '🎯', category: 'Test' }),
        ).rejects.toBeInstanceOf(TaxonomyDuplicateKeyError);
      } finally {
        await service.deleteActivity(created.id);
      }
    });
  });

  describe('Admin: Category CRUD', () => {
    it('creates, updates, and deletes a category', async () => {
      const key = uniqueKey('category');
      const created = await service.createCategory({ key, label: 'Test Category' });
      expect(created.key).toBe(key);

      const updated = await service.updateCategory(created.id, { label: 'Renamed' });
      expect(updated.label).toBe('Renamed');

      const disabled = await service.updateCategory(created.id, { isActive: false });
      expect(disabled.isActive).toBe(false);
      const active = await service.getActivePostCategories();
      expect(active.map((c) => c.key)).not.toContain(key);

      await service.deleteCategory(created.id);
    });

    it('rejects a duplicate category key', async () => {
      const key = uniqueKey('category_dup');
      const created = await service.createCategory({ key, label: 'A' });
      try {
        await expect(service.createCategory({ key, label: 'B' })).rejects.toBeInstanceOf(
          TaxonomyDuplicateKeyError,
        );
      } finally {
        await service.deleteCategory(created.id);
      }
    });
  });

  describe('Admin: ContentTag CRUD', () => {
    it('creates, updates, and deletes a content tag', async () => {
      const key = uniqueKey('tag');
      const created = await service.createContentTag({ key, label: '#TestTag' });
      expect(created.key).toBe(key);

      const updated = await service.updateContentTag(created.id, { label: '#Renamed' });
      expect(updated.label).toBe('#Renamed');

      await service.deleteContentTag(created.id);
      const all = await service.listAllContentTags();
      expect(all.map((t) => t.id)).not.toContain(created.id);
    });

    it('rejects a duplicate tag key', async () => {
      const key = uniqueKey('tag_dup');
      const created = await service.createContentTag({ key, label: 'A' });
      try {
        await expect(service.createContentTag({ key, label: 'B' })).rejects.toBeInstanceOf(
          TaxonomyDuplicateKeyError,
        );
      } finally {
        await service.deleteContentTag(created.id);
      }
    });
  });

  describe('Admin: BackgroundStyle CRUD', () => {
    it('creates a style with gradient colors and textColor, updates, and deletes it', async () => {
      const key = uniqueKey('bg');
      const created = await service.createBackgroundStyle({
        key,
        label: 'Test Gradient',
        styleType: 'gradient',
        colorValue: '#111111',
        colorValueEnd: '#222222',
        textColor: '#FFFFFF',
      });
      expect(created.styleType).toBe('gradient');
      expect(created.colorValue).toBe('#111111');
      expect(created.colorValueEnd).toBe('#222222');
      expect(created.textColor).toBe('#FFFFFF');

      const updated = await service.updateBackgroundStyle(created.id, { textColor: '#000000' });
      expect(updated.textColor).toBe('#000000');

      await service.deleteBackgroundStyle(created.id);
      const all = await service.listAllBackgroundStyles();
      expect(all.map((s) => s.id)).not.toContain(created.id);
    });

    it('rejects a duplicate background style key', async () => {
      const key = uniqueKey('bg_dup');
      const created = await service.createBackgroundStyle({ key, label: 'A' });
      try {
        await expect(service.createBackgroundStyle({ key, label: 'B' })).rejects.toBeInstanceOf(
          TaxonomyDuplicateKeyError,
        );
      } finally {
        await service.deleteBackgroundStyle(created.id);
      }
    });

    it('disabling a style removes it from the active list without deleting the row', async () => {
      const key = uniqueKey('bg_disable');
      const created = await service.createBackgroundStyle({ key, label: 'Disable Test' });
      try {
        await service.updateBackgroundStyle(created.id, { isActive: false });
        const active = await service.getActiveBackgroundStyles();
        expect(active.map((s) => s.key)).not.toContain(key);
        const all = await service.listAllBackgroundStyles();
        expect(all.map((s) => s.key)).toContain(key);
      } finally {
        await service.deleteBackgroundStyle(created.id);
      }
    });
  });

  describe('Seed idempotency', () => {
    it('running the post-taxonomy seed twice produces the same row counts (no duplicates)', async () => {
      const { seedPostTaxonomies } = await import('../../../prisma/seed/taxonomies/post-taxonomies');
      const countsBefore = await Promise.all([
        prisma.postFeeling.count(),
        prisma.postActivity.count(),
        prisma.postCategoryTaxonomy.count(),
        prisma.contentTag.count(),
        prisma.backgroundStyle.count(),
      ]);

      await seedPostTaxonomies(prisma);

      const countsAfter = await Promise.all([
        prisma.postFeeling.count(),
        prisma.postActivity.count(),
        prisma.postCategoryTaxonomy.count(),
        prisma.contentTag.count(),
        prisma.backgroundStyle.count(),
      ]);

      expect(countsAfter).toEqual(countsBefore);
    });
  });
});
