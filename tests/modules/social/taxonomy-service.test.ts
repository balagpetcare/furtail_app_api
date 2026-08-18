import { PrismaClient } from '@prisma/client';
import { TaxonomyService } from '../../../src/modules/social/taxonomy-service';

describe('TaxonomyService', () => {
  let prisma: PrismaClient;
  let service: TaxonomyService;

  beforeAll(async () => {
    prisma = new PrismaClient();
    service = new TaxonomyService(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('getActivePostFeelings', () => {
    it('should return active feelings', async () => {
      const feelings = await service.getActivePostFeelings();
      expect(feelings).toBeDefined();
      expect(Array.isArray(feelings)).toBe(true);
      expect(feelings.length).toBeGreaterThan(0);
      expect(feelings.every(f => f.isActive === true)).toBe(true);
    });

    it('should support search by label', async () => {
      const feelings = await service.getActivePostFeelings('happy');
      expect(feelings.length).toBeGreaterThan(0);
      expect(feelings.some(f => f.label.toLowerCase().includes('happy'))).toBe(true);
    });

    it('should be sorted by sortOrder', async () => {
      const feelings = await service.getActivePostFeelings();
      for (let i = 1; i < feelings.length; i++) {
        expect(feelings[i].sortOrder).toBeGreaterThanOrEqual(feelings[i - 1].sortOrder);
      }
    });
  });

  describe('getActivePostActivities', () => {
    it('should return active activities', async () => {
      const activities = await service.getActivePostActivities();
      expect(activities).toBeDefined();
      expect(Array.isArray(activities)).toBe(true);
      expect(activities.length).toBeGreaterThan(0);
      expect(activities.every(a => a.isActive === true)).toBe(true);
    });

    it('should support search by label', async () => {
      const activities = await service.getActivePostActivities('walking');
      expect(activities.some(a => a.label.toLowerCase().includes('walking'))).toBe(true);
    });

    it('should filter by category', async () => {
      const petCare = await service.getActivePostActivities(undefined, 'Pet Care');
      expect(petCare.length).toBeGreaterThan(0);
      expect(petCare.every(a => a.category === 'Pet Care')).toBe(true);
    });
  });

  describe('getActiveBackgroundStyles', () => {
    it('should return active background styles with canonical keys', async () => {
      const styles = await service.getActiveBackgroundStyles();
      expect(styles).toBeDefined();
      expect(Array.isArray(styles)).toBe(true);
      expect(styles.length).toBeGreaterThan(0);
      expect(styles.every(s => s.isActive === true)).toBe(true);

      // Verify canonical Flutter IDs exist
      const styleKeys = styles.map(s => s.key);
      expect(styleKeys).toContain('none');
      expect(styleKeys).toContain('orange_red');
      expect(styleKeys).toContain('blue_purple');
      expect(styleKeys).toContain('dark_purple');
      expect(styleKeys).toContain('green_teal');
      expect(styleKeys).toContain('midnight');
    });

    it('should preserve canonical style IDs for backward compatibility', async () => {
      const styles = await service.getActiveBackgroundStyles();
      const canonicalIds = ['none', 'orange_red', 'blue_purple', 'dark_purple', 'green_teal', 'midnight'];
      const returnedIds = styles.map(s => s.key);

      for (const id of canonicalIds) {
        expect(returnedIds).toContain(id);
      }
    });
  });

  describe('Admin methods', () => {
    it('should create a new feeling', async () => {
      const feeling = await service.createFeeling('test_joy', 'Test Joy', '😄');
      expect(feeling).toBeDefined();
      expect(feeling.key).toBe('test_joy');
      expect(feeling.label).toBe('Test Joy');
      expect(feeling.emoji).toBe('😄');
      expect(feeling.isActive).toBe(true);

      // Cleanup
      await prisma.postFeeling.delete({ where: { id: feeling.id } });
    });

    it('should update a feeling', async () => {
      const created = await service.createFeeling('test_update', 'Old Label', '😊');
      const updated = await service.updateFeeling(created.id, { label: 'New Label' });
      expect(updated.label).toBe('New Label');

      // Cleanup
      await prisma.postFeeling.delete({ where: { id: created.id } });
    });

    it('should support toggling active state', async () => {
      const feeling = await service.createFeeling('test_toggle', 'Test', '😊');
      const disabled = await service.updateFeeling(feeling.id, { isActive: false });
      expect(disabled.isActive).toBe(false);

      // Verify inactive items don't appear in active list
      const active = await service.getActivePostFeelings();
      expect(active.map(f => f.key)).not.toContain('test_toggle');

      // Cleanup
      await prisma.postFeeling.delete({ where: { id: feeling.id } });
    });

    it('should support sort order management', async () => {
      const created = await service.createFeeling('test_sort', 'Test', '😊');
      const updated = await service.updateFeeling(created.id, { sortOrder: 999 });
      expect(updated.sortOrder).toBe(999);

      // Cleanup
      await prisma.postFeeling.delete({ where: { id: created.id } });
    });
  });
});
