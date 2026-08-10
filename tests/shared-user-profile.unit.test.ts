import { AppError } from '../src/core/errors/app-error';
import {
  buildProvisionedProfileSeed,
  repairEmailDerivedProfiles,
  sanitizePublicDisplayName,
  toPublicAuthor,
  toSharedProfilePayload,
  updateSharedProfile,
} from '../src/modules/profile/shared-user-profile';

describe('shared user profile helpers', () => {
  it('never derives the public display name from an email address', () => {
    expect(
      sanitizePublicDisplayName({
        displayName: 'balag00@gmail.com',
        username: null,
      }),
    ).toBe('Furtail Member');
  });

  it('provisions a neutral public profile seed from the subject when the identity name is an email', () => {
    const seed = buildProvisionedProfileSeed({
      subject: 'auth0|abc123',
      principalName: 'balag00@gmail.com',
    });

    expect(seed.displayName).toBe('Furtail Member');
    expect(seed.username).toMatch(/^member[a-z0-9]+$/);
    expect(seed.username).not.toContain('gmail');
  });

  it('builds a safe public author payload', () => {
    expect(
      toPublicAuthor({
        userId: 7,
        displayName: 'balag00@gmail.com',
        username: 'owner_seven',
        avatarUrl: 'https://cdn.example.test/avatar.jpg',
      }),
    ).toEqual({
      id: 7,
      publicId: 'usr_7',
      displayName: 'owner_seven',
      username: 'owner_seven',
      avatarUrl: 'https://cdn.example.test/avatar.jpg',
    });
  });

  it('sanitizes the shared profile payload for public/community use', () => {
    const payload = toSharedProfilePayload(
      {
        id: 11,
        auth: { email: 'owner@example.com', phone: '+8801' },
        profile: {
          displayName: 'owner@example.com',
          username: 'petlover',
          bio: 'Hello',
          visibility: 'PUBLIC',
          showEmail: false,
          showPhone: false,
          education: null,
          placeLive: 'Dhaka',
          from: null,
          profileType: null,
          workStatus: null,
          religiousStatus: null,
          gender: 'FEMALE',
          birthdate: new Date('1992-01-20T00:00:00.000Z'),
          maritalStatus: null,
          avatarMedia: null,
          coverMedia: null,
        },
      },
      false,
    );

    expect(payload.profile.displayName).toBe('petlover');
    expect(payload.auth.email).toBe('');
    expect(payload.publicAuthor.displayName).toBe('petlover');
    expect(payload.profile.gender).toBe('FEMALE');
    expect(payload.profile.birthdate).toBe('1992-01-20T00:00:00.000Z');
  });
});

describe('shared user profile persistence helpers', () => {
  it('returns USERNAME_TAKEN for a case-insensitive username conflict', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          profile: { username: 'member_zero' },
        }),
      },
      userProfile: {
        findFirst: jest.fn().mockResolvedValue({ userId: 2 }),
        update: jest.fn(),
      },
    } as unknown as Parameters<typeof updateSharedProfile>[0];

    await expect(
      updateSharedProfile(prisma, 1, {
        username: 'Member_One',
      }),
    ).rejects.toMatchObject({
      code: 'USERNAME_TAKEN',
      statusCode: 409,
      details: { field: 'username' },
    });
  });

  it('repairs email-derived public profile values idempotently', async () => {
    // Stateful fake: `update()` actually mutates the in-memory row, and
    // `findMany()` always reads the current state — so a second call to
    // repairEmailDerivedProfiles genuinely re-reads what the first call
    // wrote, the same way a second run against a real Postgres table would.
    // A jest.fn().mockResolvedValue(undefined) stub that never mutates
    // anything would make the "re-run is a no-op" idempotency assertion
    // meaningless (it would trivially "pass" even if the source's repair
    // condition weren't actually satisfied post-repair).
    const rows = [
      {
        id: 1,
        centralAuthLink: { subject: 'auth0|abc' },
        profile: {
          displayName: 'owner@example.com',
          username: 'owner@example.com',
          bio: 'Reach me at owner@example.com',
        },
      },
      {
        id: 2,
        centralAuthLink: { subject: 'auth0|ok' },
        profile: {
          displayName: 'Pet Parent',
          username: 'pet_parent',
          bio: 'Volunteer',
        },
      },
    ];
    const update = jest.fn().mockImplementation(async ({ where, data }) => {
      const row = rows.find((r) => r.id === where.userId);
      if (row) Object.assign(row.profile, data);
    });
    const prisma = {
      user: {
        findMany: jest
          .fn()
          .mockImplementation(async () => rows.map((r) => ({ ...r, profile: { ...r.profile } }))),
      },
      userProfile: {
        update,
      },
    } as unknown as Parameters<typeof repairEmailDerivedProfiles>[0];

    const dryRun = await repairEmailDerivedProfiles(prisma, { dryRun: true });
    expect(dryRun.scanned).toBe(2);
    expect(dryRun.changed).toBe(1);
    expect(update).not.toHaveBeenCalled();

    const applied = await repairEmailDerivedProfiles(prisma, { dryRun: false });
    expect(applied.repairable).toBe(1);
    expect(applied.skipped).toBe(1);
    expect(applied.conflicting).toBe(0);
    expect(applied.changed).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 1 },
        data: expect.objectContaining({
          displayName: 'Furtail Member',
          bio: null,
        }),
      }),
    );

    // Re-running against the now-actually-repaired rows must be a pure
    // no-op: nothing left to change, so the second pass is idempotent.
    update.mockClear();
    const rerun = await repairEmailDerivedProfiles(prisma, { dryRun: false });
    expect(rerun.changed).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('reports a conflicting outcome (and never applies) when the generated replacement username is already taken', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    // user 1's generated username would collide with user 2's real,
    // legitimately-held username — repair must flag this rather than
    // silently overwriting or crashing on a DB unique-constraint error.
    const collidingUsername = 'memberauth0abc';
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            centralAuthLink: { subject: 'auth0|abc' },
            profile: {
              displayName: 'owner@example.com',
              username: 'owner@example.com',
              bio: null,
            },
          },
          {
            id: 2,
            centralAuthLink: { subject: 'auth0|other' },
            profile: {
              displayName: 'Existing Holder',
              username: collidingUsername,
              bio: null,
            },
          },
        ]),
      },
      userProfile: {
        update,
      },
    } as unknown as Parameters<typeof repairEmailDerivedProfiles>[0];

    const dryRun = await repairEmailDerivedProfiles(prisma, { dryRun: true });
    expect(dryRun.scanned).toBe(2);
    expect(dryRun.changed).toBe(1);
    expect(dryRun.conflicting).toBe(1);
    expect(dryRun.repairable).toBe(0);
    const conflictingItem = dryRun.items.find((item) => item.userId === 1);
    expect(conflictingItem?.outcome).toBe('conflicting');
    // Username is left untouched — the repair must never invent a
    // different, unrequested username to work around the collision.
    expect(conflictingItem?.afterUsername).toBe('owner@example.com');

    const applied = await repairEmailDerivedProfiles(prisma, { dryRun: false });
    expect(applied.conflicting).toBe(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('never derives a repaired username from the email local-part', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 5,
            centralAuthLink: { subject: 'auth0|xyz789' },
            profile: {
              displayName: 'jane.doe.private@example.com',
              username: 'jane.doe.private@example.com',
              bio: null,
            },
          },
        ]),
      },
      userProfile: { update },
    } as unknown as Parameters<typeof repairEmailDerivedProfiles>[0];

    const result = await repairEmailDerivedProfiles(prisma, { dryRun: true });
    const item = result.items[0]!;
    expect(item.afterUsername).not.toContain('jane');
    expect(item.afterUsername).not.toContain('doe');
    expect(item.afterUsername).not.toContain('example');
    expect(item.afterUsername).toMatch(/^member[a-z0-9]+$/);
  });

  it('rejects an email-like display name with a typed 422 field error', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          profile: { username: 'member_one' },
        }),
      },
    } as unknown as Parameters<typeof updateSharedProfile>[0];

    await expect(
      updateSharedProfile(prisma, 1, {
        displayName: 'owner@example.com',
      }),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      updateSharedProfile(prisma, 1, {
        displayName: 'owner@example.com',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 422,
      details: { field: 'displayName' },
    });
  });

  it('persists shared profile detail fields in database mode updates', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 1, profile: { username: 'member_one' } }),
      },
      userProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
        update,
      },
      media: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      userAuth: {
        findFirst: jest.fn().mockResolvedValue({
          email: 'owner@example.com',
          phone: '+8801000000000',
        }),
      },
    } as unknown as Parameters<typeof updateSharedProfile>[0];

    // birthdate is included in the input to prove it is IGNORED — DOB is
    // owned by Central Auth, not the Furtail profile PATCH (see the
    // deprecation note in shared-user-profile.ts).
    await updateSharedProfile(prisma, 1, {
      education: 'Dhaka University',
      placeLive: 'Dhaka',
      from: 'Sylhet',
      workStatus: 'Creator',
      religiousStatus: 'Islam',
      gender: 'FEMALE',
      birthdate: '1992-01-20T00:00:00.000Z',
      maritalStatus: 'Single',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 1 },
        data: expect.objectContaining({
          education: 'Dhaka University',
          placeLive: 'Dhaka',
          from: 'Sylhet',
          workStatus: 'Creator',
          religiousStatus: 'Islam',
          gender: 'FEMALE',
          maritalStatus: 'Single',
        }),
      }),
    );
    const call = update.mock.calls[0][0];
    expect(call.data).not.toHaveProperty('birthdate');
  });
});
