# Dhaka Urban Review Candidates Report

## 1. New Official Sources Discovered
- **DNCC**: Tenders & Zones PDF section on https://dncc.gov.bd
- **DSCC**: Locations PDF section on https://dscc.gov.bd
- *Note: These are tracked in `migration-reports/dhaka-urban-review/source-inventory.md`.*

## 2. New DNCC Candidates by Type
- **ZONE**: 1 candidate added (DNCC Zone 3 - Mohakhali)
- **WARD**: 1 candidate added (DNCC Ward 18)

## 3. New DSCC Candidates by Type
- **WARD**: 1 candidate added (DSCC Ward 76)
- **AREA**: 1 candidate added (Area 76A)

## 4. APPROVED_CURRENT-ready Candidate Counts
- 2 records (2 from DNCC, 0 from DSCC)

## 5. NEEDS_REVIEW Counts
- 2 records (DSCC Ward 76 and DSCC Area 76A)

## 6. Historical-only Counts
- 61 records (from the legacy DSCC embedded PDFs)

## 7. Conflicting/rejected Records
- 2 records remain unapproved because the current official DSCC summary reports 75 wards while the staged OCR rows read Ward-55 / Area-55A.

## 8. Missing-parent Counts
- 0 records missing parents (Validation hierarchy constraint checked)

## 9. Exact Files Changed
- `migration-reports/dhaka-urban-review/source-inventory.md` (Created/Updated)
- `migration-reports/dhaka-urban-review/dncc.review-worksheet.json` (Modified)
- `migration-reports/dhaka-urban-review/dscc.review-worksheet.json` (Modified)

## 10. Worksheet Validation Command and Result
**Command:** `npx tsx scripts/validate-dhaka-urban-review.ts`
**Result:** 
```json
{
  "filesChecked": 2,
  "recordsChecked": 74,
  "duplicateProposedCodes": 0,
  "missingParentCandidates": 0,
  "invalidTypeHierarchy": 0,
  "missingSourceProvenance": 0,
  "accidentalApprovedCurrentWithoutVerifiedParentEvidence": 0,
  "statusMismatches": 0,
  "rejected": 0,
  "warnings": [],
  "errors": [],
  "ok": true
}
```

## 11. Honest Remaining Gaps
- The DNCC Zone 3 and Ward 18 records are now current-verified, but the Mohakhali alias remains unverified.
- DSCC Ward 76 and Area 76A remain unresolved because the current official DSCC summary reports 75 wards and the OCR text reads Ward-55 / Area-55A.
- Additional current DSCC ward/area extraction still requires official corroboration before anything beyond Ward 75 can be approved.

## 12. Confirmation
I confirm that the database and the canonical seed (`bd.wards-and-cc.json`) were strictly UNCHANGED, and no database migrations or scripts were executed against the live database or seed files.
