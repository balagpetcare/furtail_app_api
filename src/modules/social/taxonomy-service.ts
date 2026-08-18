import { PrismaClient } from '@prisma/client';

export interface TaxonomyOption {
  id: number;
  key: string;
  label: string;
  emoji?: string;
  category?: string;
  colorValue?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export class TaxonomyService {
  constructor(private prisma: PrismaClient) {}

  async getActivePostFeelings(search?: string): Promise<TaxonomyOption[]> {
    const feelings = await this.prisma.postFeeling.findMany({
      where: {
        isActive: true,
        ...(search && {
          OR: [
            { label: { contains: search, mode: 'insensitive' } },
            { key: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { sortOrder: 'asc' },
    });

    return feelings.map(f => ({
      id: f.id,
      key: f.key,
      label: f.label,
      emoji: f.emoji,
      sortOrder: f.sortOrder,
      isActive: f.isActive,
    }));
  }

  async getActivePostActivities(search?: string, category?: string): Promise<TaxonomyOption[]> {
    const activities = await this.prisma.postActivity.findMany({
      where: {
        isActive: true,
        ...(search && {
          OR: [
            { label: { contains: search, mode: 'insensitive' } },
            { key: { contains: search, mode: 'insensitive' } },
          ],
        }),
        ...(category && { category }),
      },
      orderBy: { sortOrder: 'asc' },
    });

    return activities.map(a => ({
      id: a.id,
      key: a.key,
      label: a.label,
      emoji: a.emoji,
      category: a.category,
      sortOrder: a.sortOrder,
      isActive: a.isActive,
    }));
  }

  async getActivePostCategories(search?: string): Promise<TaxonomyOption[]> {
    const categories = await this.prisma.postCategoryTaxonomy.findMany({
      where: {
        isActive: true,
        ...(search && {
          OR: [
            { label: { contains: search, mode: 'insensitive' } },
            { key: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { sortOrder: 'asc' },
    });

    return categories.map(c => ({
      id: c.id,
      key: c.key,
      label: c.label,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
    }));
  }

  async getActiveContentTags(search?: string): Promise<TaxonomyOption[]> {
    const tags = await this.prisma.contentTag.findMany({
      where: {
        isActive: true,
        ...(search && {
          OR: [
            { label: { contains: search, mode: 'insensitive' } },
            { key: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { sortOrder: 'asc' },
    });

    return tags.map(t => ({
      id: t.id,
      key: t.key,
      label: t.label,
      sortOrder: t.sortOrder,
      isActive: t.isActive,
    }));
  }

  async getActiveBackgroundStyles(): Promise<TaxonomyOption[]> {
    const styles = await this.prisma.backgroundStyle.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return styles.map(s => ({
      id: s.id,
      key: s.key,
      label: s.label,
      colorValue: s.colorValue,
      sortOrder: s.sortOrder,
      isActive: s.isActive,
    }));
  }

  // Admin methods
  async createFeeling(key: string, label: string, emoji: string): Promise<TaxonomyOption> {
    const feeling = await this.prisma.postFeeling.create({
      data: { key, label, emoji, isActive: true },
    });
    return {
      id: feeling.id,
      key: feeling.key,
      label: feeling.label,
      emoji: feeling.emoji,
      sortOrder: feeling.sortOrder,
      isActive: feeling.isActive,
    };
  }

  async updateFeeling(
    id: number,
    data: { label?: string; emoji?: string; sortOrder?: number; isActive?: boolean }
  ): Promise<TaxonomyOption> {
    const feeling = await this.prisma.postFeeling.update({
      where: { id },
      data,
    });
    return {
      id: feeling.id,
      key: feeling.key,
      label: feeling.label,
      emoji: feeling.emoji,
      sortOrder: feeling.sortOrder,
      isActive: feeling.isActive,
    };
  }

  async createActivity(
    key: string,
    label: string,
    emoji: string,
    category: string
  ): Promise<TaxonomyOption> {
    const activity = await this.prisma.postActivity.create({
      data: { key, label, emoji, category, isActive: true },
    });
    return {
      id: activity.id,
      key: activity.key,
      label: activity.label,
      emoji: activity.emoji,
      category: activity.category,
      sortOrder: activity.sortOrder,
      isActive: activity.isActive,
    };
  }

  async updateActivity(
    id: number,
    data: { label?: string; emoji?: string; category?: string; sortOrder?: number; isActive?: boolean }
  ): Promise<TaxonomyOption> {
    const activity = await this.prisma.postActivity.update({
      where: { id },
      data,
    });
    return {
      id: activity.id,
      key: activity.key,
      label: activity.label,
      emoji: activity.emoji,
      category: activity.category,
      sortOrder: activity.sortOrder,
      isActive: activity.isActive,
    };
  }

  async createBackgroundStyle(
    key: string,
    label: string,
    colorValue?: string
  ): Promise<TaxonomyOption> {
    const style = await this.prisma.backgroundStyle.create({
      data: {
        key,
        label,
        colorValue,
        styleType: 'solid',
        isActive: true,
      },
    });
    return {
      id: style.id,
      key: style.key,
      label: style.label,
      colorValue: style.colorValue,
      sortOrder: style.sortOrder,
      isActive: style.isActive,
    };
  }

  async updateBackgroundStyle(
    id: number,
    data: { label?: string; colorValue?: string; sortOrder?: number; isActive?: boolean }
  ): Promise<TaxonomyOption> {
    const style = await this.prisma.backgroundStyle.update({
      where: { id },
      data,
    });
    return {
      id: style.id,
      key: style.key,
      label: style.label,
      colorValue: style.colorValue,
      sortOrder: style.sortOrder,
      isActive: style.isActive,
    };
  }
}
