import manifest from '../migration-reports/dhaka-urban-provenance-audit.json';
import seedRows from '../prisma/seeds/data/bd.wards-and-cc.json';

describe('Dhaka urban provenance audit', () => {
  it('keeps the canonical 74-row seed classified with current, historical, and partial-current records only', () => {
    expect(seedRows).toHaveLength(74);
    expect(manifest.totalRecords).toBe(74);

    expect(manifest.summary.byCorporation.DNCC).toBe(10);
    expect(manifest.summary.byCorporation.DSCC).toBe(62);
    expect(manifest.summary.byCorporation.NONE).toBe(2);
    expect(manifest.summary.CURRENT_VERIFIED).toBe(11);
    expect(manifest.summary.HISTORICAL_VERIFIED).toBe(61);
    expect(manifest.summary.PARTIAL_CURRENT).toBe(2);
    expect(manifest.summary.AMBIGUOUS).toBe(0);
    expect(manifest.summary.UNSUPPORTED).toBe(0);

    const codes = manifest.records.map((row: { code: string }) => row.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(seedRows.map((row) => row.code));

    const current = manifest.records.filter(
      (row: { currentValidity: string }) => row.currentValidity === 'CURRENT_VERIFIED',
    );
    const historical = manifest.records.filter(
      (row: { currentValidity: string }) => row.currentValidity === 'HISTORICAL_VERIFIED',
    );
    const partial = manifest.records.filter(
      (row: { currentValidity: string }) => row.currentValidity === 'PARTIAL_CURRENT',
    );

    expect(
      current.every(
        (row: { code: string }) =>
          row.code.startsWith('CC-') ||
          row.code.startsWith('ZONE-DNCC') ||
          row.code.startsWith('WARD-DNCC') ||
          row.code.startsWith('AREA-DNCC'),
      ),
    ).toBe(true);
    expect(current.map((row: { code: string }) => row.code)).toEqual(
      expect.arrayContaining(['ZONE-DNCC-03', 'WARD-DNCC-18']),
    );
    expect(
      historical.every(
        (row: { code: string }) =>
          row.code.startsWith('ZONE-DSCC') || row.code.startsWith('WARD-DSCC'),
      ),
    ).toBe(true);
    expect(partial.map((row: { code: string }) => row.code).sort()).toEqual([
      'AREA-AMINBAZAR-01',
      'AREA-ASHULIA-01',
    ]);
  });
});
