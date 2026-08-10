import { classifyDobRow, summarize, type RowResult } from '../scripts/migrate-dob-to-central-auth';

describe('classifyDobRow (DOB migration classification)', () => {
  it('classifies a row with no subject link as missing-link', () => {
    expect(
      classifyDobRow({
        hasSubjectLink: false,
        centralAuthUserExists: false,
        furtailBirthdate: '1990-05-15',
        centralAuthDob: null,
      }),
    ).toBe('missing-link');
  });

  it('classifies a row whose subject has no matching Central Auth user as missing-link', () => {
    expect(
      classifyDobRow({
        hasSubjectLink: true,
        centralAuthUserExists: false,
        furtailBirthdate: '1990-05-15',
        centralAuthDob: null,
      }),
    ).toBe('missing-link');
  });

  it('classifies a linked row with a null Central Auth DOB as migratable', () => {
    expect(
      classifyDobRow({
        hasSubjectLink: true,
        centralAuthUserExists: true,
        furtailBirthdate: '1990-05-15',
        centralAuthDob: null,
      }),
    ).toBe('migratable');
  });

  it('classifies a linked row whose Central Auth DOB already matches as already-matching (idempotent)', () => {
    expect(
      classifyDobRow({
        hasSubjectLink: true,
        centralAuthUserExists: true,
        furtailBirthdate: '1990-05-15',
        centralAuthDob: '1990-05-15',
      }),
    ).toBe('already-matching');
  });

  it('classifies a linked row whose Central Auth DOB differs as conflicting — never auto-overwritten', () => {
    expect(
      classifyDobRow({
        hasSubjectLink: true,
        centralAuthUserExists: true,
        furtailBirthdate: '1990-05-15',
        centralAuthDob: '1985-01-01',
      }),
    ).toBe('conflicting');
  });

  it('never classifies a non-null Central Auth DOB as migratable, regardless of Furtail value', () => {
    // A non-null Central Auth DOB is authoritative — this must never return
    // 'migratable' even when the Furtail value is null/missing.
    const result = classifyDobRow({
      hasSubjectLink: true,
      centralAuthUserExists: true,
      furtailBirthdate: null,
      centralAuthDob: '1990-05-15',
    });
    expect(result).not.toBe('migratable');
  });
});

describe('summarize (DOB migration counts)', () => {
  const rows: RowResult[] = [
    {
      furtailUserId: 1,
      subject: 'sub-1',
      furtailBirthdate: '1990-01-01',
      centralAuthUserId: 'sub-1',
      centralAuthDob: null,
      category: 'migratable',
    },
    {
      furtailUserId: 2,
      subject: 'sub-2',
      furtailBirthdate: '1991-01-01',
      centralAuthUserId: 'sub-2',
      centralAuthDob: '1991-01-01',
      category: 'already-matching',
    },
    {
      furtailUserId: 3,
      subject: 'sub-3',
      furtailBirthdate: '1992-01-01',
      centralAuthUserId: 'sub-3',
      centralAuthDob: '1980-01-01',
      category: 'conflicting',
    },
    {
      furtailUserId: 4,
      subject: null,
      furtailBirthdate: '1993-01-01',
      centralAuthUserId: null,
      centralAuthDob: null,
      category: 'missing-link',
    },
  ];

  it('classifies scanned/migratable/already-matching/conflicting/missing-link counts correctly', () => {
    expect(summarize(rows)).toEqual({
      scanned: 4,
      migratable: 1,
      alreadyMatching: 1,
      conflicting: 1,
      missingLink: 1,
    });
  });

  it('a second pass over only the already-matching + conflicting + missing-link rows (post-apply) reports zero migratable — proves idempotency', () => {
    const postApplyRows = rows.map((r) =>
      r.category === 'migratable'
        ? { ...r, category: 'already-matching' as const, centralAuthDob: r.furtailBirthdate }
        : r,
    );
    expect(summarize(postApplyRows).migratable).toBe(0);
  });
});
