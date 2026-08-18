import { Prisma, PrismaClient } from '@prisma/client';

export interface TaxonomyOption {
  id: number;
  key: string;
  label: string;
  emoji?: string | null;
  category?: string | null;
  colorValue?: string | null;
  colorValueEnd?: string | null;
  textColor?: string | null;
  styleType?: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** Thrown when an admin create/update would violate a taxonomy's unique
 * stable `key` — a clean, typed signal the route layer maps to 409, instead
 * of a raw Prisma P2002 leaking to the client. */
export class TaxonomyDuplicateKeyError extends Error {
  constructor(public readonly key: string) {
    super(`A record with key "${key}" already exists`);
    this.name = 'TaxonomyDuplicateKeyError';
  }
}

export class TaxonomyNotFoundError extends Error {
  constructor(message = 'Taxonomy record not found') {
    super(message);
    this.name = 'TaxonomyNotFoundError';
  }
}

function isUniqueConstraintViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function isRecordNotFoundError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

/**
 * Admin-managed catalogs backing Create Post's Feeling/Activity/Category/
 * Tags/Background Style selectors. Read methods (getActive*) are the public,
 * client-facing contract: active-only, sorted, search-filterable. Admin
 * methods (create/update/delete/listAll*) require the caller to already have
 * enforced admin authorization — this service does not check roles itself.
 */
export class TaxonomyService {
  constructor(private prisma: PrismaClient) {}

  // ── Feelings ──────────────────────────────────────────────────────────

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
    return feelings.map(mapFeeling);
  }

  async listAllPostFeelings(search?: string): Promise<TaxonomyOption[]> {
    const feelings = await this.prisma.postFeeling.findMany({
      where: {
        ...(search && {
          OR: [
            { label: { contains: search, mode: 'insensitive' } },
            { key: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { sortOrder: 'asc' },
    });
    return feelings.map(mapFeeling);
  }

  async createFeeling(input: {
    key: string;
    label: string;
    emoji: string;
    sortOrder?: number;
  }): Promise<TaxonomyOption> {
    try {
      const feeling = await this.prisma.postFeeling.create({
        data: {
          key: input.key,
          label: input.label,
          emoji: input.emoji,
          sortOrder: input.sortOrder ?? 0,
          isActive: true,
        },
      });
      return mapFeeling(feeling);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw new TaxonomyDuplicateKeyError(input.key);
      throw error;
    }
  }

  async updateFeeling(
    id: number,
    data: { label?: string; emoji?: string; sortOrder?: number; isActive?: boolean },
  ): Promise<TaxonomyOption> {
    try {
      const feeling = await this.prisma.postFeeling.update({ where: { id }, data });
      return mapFeeling(feeling);
    } catch (error) {
      if (isRecordNotFoundError(error)) throw new TaxonomyNotFoundError();
      throw error;
    }
  }

  async deleteFeeling(id: number): Promise<void> {
    try {
      await this.prisma.postFeeling.delete({ where: { id } });
    } catch (error) {
      if (isRecordNotFoundError(error)) throw new TaxonomyNotFoundError();
      throw error;
    }
  }

  // ── Activities ────────────────────────────────────────────────────────

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
    return activities.map(mapActivity);
  }

  async listAllPostActivities(search?: string): Promise<TaxonomyOption[]> {
    const activities = await this.prisma.postActivity.findMany({
      where: {
        ...(search && {
          OR: [
            { label: { contains: search, mode: 'insensitive' } },
            { key: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { sortOrder: 'asc' },
    });
    return activities.map(mapActivity);
  }

  async createActivity(input: {
    key: string;
    label: string;
    emoji: string;
    category: string;
    sortOrder?: number;
  }): Promise<TaxonomyOption> {
    try {
      const activity = await this.prisma.postActivity.create({
        data: {
          key: input.key,
          label: input.label,
          emoji: input.emoji,
          category: input.category,
          sortOrder: input.sortOrder ?? 0,
          isActive: true,
        },
      });
      return mapActivity(activity);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw new TaxonomyDuplicateKeyError(input.key);
      throw error;
    }
  }

  async updateActivity(
    id: number,
    data: { label?: string; emoji?: string; category?: string; sortOrder?: number; isActive?: boolean },
  ): Promise<TaxonomyOption> {
    try {
      const activity = await this.prisma.postActivity.update({ where: { id }, data });
      return mapActivity(activity);
    } catch (error) {
      if (isRecordNotFoundError(error)) throw new TaxonomyNotFoundError();
      throw error;
    }
  }

  async deleteActivity(id: number): Promise<void> {
    try {
      await this.prisma.postActivity.delete({ where: { id } });
    } catch (error) {
      if (isRecordNotFoundError(error)) throw new TaxonomyNotFoundError();
      throw error;
    }
  }

  // ── Post Categories ───────────────────────────────────────────────────
  // Note: distinct from Post.type (TEXT/IMAGE/VIDEO/REEL) and Post.category
  // (the stable GENERAL/FUNDRAISING enum) — this is the admin-managed
  // content-category taxonomy, currently not yet wired to a Post field.

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
    return categories.map(mapPlain);
  }

  async listAllPostCategories(search?: string): Promise<TaxonomyOption[]> {
    const categories = await this.prisma.postCategoryTaxonomy.findMany({
      where: {
        ...(search && {
          OR: [
            { label: { contains: search, mode: 'insensitive' } },
            { key: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { sortOrder: 'asc' },
    });
    return categories.map(mapPlain);
  }

  async createCategory(input: { key: string; label: string; sortOrder?: number }): Promise<TaxonomyOption> {
    try {
      const category = await this.prisma.postCategoryTaxonomy.create({
        data: { key: input.key, label: input.label, sortOrder: input.sortOrder ?? 0, isActive: true },
      });
      return mapPlain(category);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw new TaxonomyDuplicateKeyError(input.key);
      throw error;
    }
  }

  async updateCategory(
    id: number,
    data: { label?: string; sortOrder?: number; isActive?: boolean },
  ): Promise<TaxonomyOption> {
    try {
      const category = await this.prisma.postCategoryTaxonomy.update({ where: { id }, data });
      return mapPlain(category);
    } catch (error) {
      if (isRecordNotFoundError(error)) throw new TaxonomyNotFoundError();
      throw error;
    }
  }

  async deleteCategory(id: number): Promise<void> {
    try {
      await this.prisma.postCategoryTaxonomy.delete({ where: { id } });
    } catch (error) {
      if (isRecordNotFoundError(error)) throw new TaxonomyNotFoundError();
      throw error;
    }
  }

  // ── Content Tags ──────────────────────────────────────────────────────

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
    return tags.map(mapPlain);
  }

  async listAllContentTags(search?: string): Promise<TaxonomyOption[]> {
    const tags = await this.prisma.contentTag.findMany({
      where: {
        ...(search && {
          OR: [
            { label: { contains: search, mode: 'insensitive' } },
            { key: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { sortOrder: 'asc' },
    });
    return tags.map(mapPlain);
  }

  async createContentTag(input: { key: string; label: string; sortOrder?: number }): Promise<TaxonomyOption> {
    try {
      const tag = await this.prisma.contentTag.create({
        data: { key: input.key, label: input.label, sortOrder: input.sortOrder ?? 0, isActive: true },
      });
      return mapPlain(tag);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw new TaxonomyDuplicateKeyError(input.key);
      throw error;
    }
  }

  async updateContentTag(
    id: number,
    data: { label?: string; sortOrder?: number; isActive?: boolean },
  ): Promise<TaxonomyOption> {
    try {
      const tag = await this.prisma.contentTag.update({ where: { id }, data });
      return mapPlain(tag);
    } catch (error) {
      if (isRecordNotFoundError(error)) throw new TaxonomyNotFoundError();
      throw error;
    }
  }

  /** Cascades to PostContentTag (onDelete: Cascade) — deleting a tag removes
   * it from any posts that used it. This is intentional admin behavior, not
   * an accident: an admin deleting a taxonomy entry should not leave
   * dangling references. */
  async deleteContentTag(id: number): Promise<void> {
    try {
      await this.prisma.contentTag.delete({ where: { id } });
    } catch (error) {
      if (isRecordNotFoundError(error)) throw new TaxonomyNotFoundError();
      throw error;
    }
  }

  // ── Background Styles ─────────────────────────────────────────────────
  // Keys are stable and shared with the Flutter app's own hardcoded preset
  // list (post_background_style.dart) — never change an existing key.

  async getActiveBackgroundStyles(): Promise<TaxonomyOption[]> {
    const styles = await this.prisma.backgroundStyle.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return styles.map(mapBackgroundStyle);
  }

  async listAllBackgroundStyles(): Promise<TaxonomyOption[]> {
    const styles = await this.prisma.backgroundStyle.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    return styles.map(mapBackgroundStyle);
  }

  async createBackgroundStyle(input: {
    key: string;
    label: string;
    styleType?: string;
    colorValue?: string | null;
    colorValueEnd?: string | null;
    textColor?: string;
    sortOrder?: number;
  }): Promise<TaxonomyOption> {
    try {
      const style = await this.prisma.backgroundStyle.create({
        data: {
          key: input.key,
          label: input.label,
          styleType: input.styleType ?? 'solid',
          colorValue: input.colorValue ?? null,
          colorValueEnd: input.colorValueEnd ?? null,
          textColor: input.textColor ?? '#000000',
          sortOrder: input.sortOrder ?? 0,
          isActive: true,
        },
      });
      return mapBackgroundStyle(style);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw new TaxonomyDuplicateKeyError(input.key);
      throw error;
    }
  }

  async updateBackgroundStyle(
    id: number,
    data: {
      label?: string;
      styleType?: string;
      colorValue?: string | null;
      colorValueEnd?: string | null;
      textColor?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ): Promise<TaxonomyOption> {
    try {
      const style = await this.prisma.backgroundStyle.update({ where: { id }, data });
      return mapBackgroundStyle(style);
    } catch (error) {
      if (isRecordNotFoundError(error)) throw new TaxonomyNotFoundError();
      throw error;
    }
  }

  /** Safe by design: BackgroundStyle.key is only ever referenced from
   * Post.backgroundStyle as a free-text string (no FK), so deleting a style
   * cannot violate referential integrity — old posts that used it simply
   * stop finding a matching style at render time (graceful degrade, not a
   * crash). Prefer disabling (isActive: false) for the 6 canonical
   * Flutter-shared keys; delete is intended for admin-created custom
   * styles. */
  async deleteBackgroundStyle(id: number): Promise<void> {
    try {
      await this.prisma.backgroundStyle.delete({ where: { id } });
    } catch (error) {
      if (isRecordNotFoundError(error)) throw new TaxonomyNotFoundError();
      throw error;
    }
  }
}

function mapFeeling(row: {
  id: number;
  key: string;
  label: string;
  emoji: string;
  sortOrder: number;
  isActive: boolean;
}): TaxonomyOption {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    emoji: row.emoji,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

function mapActivity(row: {
  id: number;
  key: string;
  label: string;
  emoji: string;
  category: string;
  sortOrder: number;
  isActive: boolean;
}): TaxonomyOption {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    emoji: row.emoji,
    category: row.category,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

function mapPlain(row: {
  id: number;
  key: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}): TaxonomyOption {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

function mapBackgroundStyle(row: {
  id: number;
  key: string;
  label: string;
  styleType: string;
  colorValue: string | null;
  colorValueEnd: string | null;
  textColor: string;
  sortOrder: number;
  isActive: boolean;
}): TaxonomyOption {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    styleType: row.styleType,
    colorValue: row.colorValue,
    colorValueEnd: row.colorValueEnd,
    textColor: row.textColor,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}
