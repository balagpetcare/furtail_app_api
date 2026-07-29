# Four-Candidate Dhaka Urban Evidence Review

Review scope: strict evidence-only assessment of the four newly added candidates. No database, canonical seed, or Flutter files were modified in this step.

## Final Status Summary

| Candidate | Final reviewStatus | Outcome |
| --- | --- | --- |
| DNCC Zone 3 - Mohakhali | APPROVED_CURRENT | Current DNCC administrative evidence supports Zone 3 as an active current zone. The Mohakhali alias is not independently verified and remains unapproved alias text only. |
| DNCC Ward 18 | APPROVED_CURRENT | Current DNCC administrative evidence independently corroborates Ward 18 and its parent Zone 3. |
| DSCC Ward 76 | NEEDS_REVIEW | Current official DSCC evidence reports 75 wards; the OCR row says Ward-55 under Zone 5, so Ward 76 is unsupported and conflicting. |
| DSCC Area 76A | NEEDS_REVIEW | OCR evidence says Area 55A, not Area 76A, and no current official DSCC source establishes the proposed numbering or parent chain. |

## Evidence Table

| Candidate | Exact source | Source date | Source type | Raw evidence | Proposed parent | Independent corroboration | Final reviewStatus | Reviewer rationale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DNCC Zone 3 - Mohakhali | `https://dncc.gov.bd/pages/static-pages/6922dba8933eb65569e0b9f9` (current official service-center page); `https://dncc.gov.bd/pages/static-pages/6922ded3933eb65569e1da8e` (current location page); auxiliary alias text from `https://dncc.gov.bd/pages/static-pages/tenders-and-zones` OCR PDF | Retrieved live on 2026-07-28; location page snippet published 6.4 years ago | Current official administrative source; OCR alias source is auxiliary only | `Administrative Zone-3: Nos. of Wards : 10, (Ward no-18,19, 20, 21, 22, 23,24, 25, 35,& 36)`; OCR alias text: `ZONE 3: Mohakhali Area` | `CC-DNCC` | DNCC ward-secretary page for Ward 18 and councilor page for Ward 18 confirm the Zone-3 chain is active; the alias itself is not independently verified | APPROVED_CURRENT | The current official DNCC page proves Zone 3 exists and is active. The Mohakhali alias is not independently corroborated, so it is not promoted as authoritative alias data. |
| DNCC Ward 18 | `https://dncc.gov.bd/views/councilors/-`; `https://dncc.gov.bd/pages/static-pages/6922dc3e933eb65569e0f38e`; corroborating zone page `https://dncc.gov.bd/pages/static-pages/6922dba8933eb65569e0b9f9` | Retrieved live on 2026-07-28 | Current official administrative source | Councilor page snippet: `ওয়ার্ড নং, ১৮`; ward-secretary page snippet: `১৮. জনাব শেখ একরামুল কবির (অ.দা).`; zone page snippet includes Ward 18 under Administrative Zone-3 | `ZONE-DNCC-03` | Zone-3 service page independently lists Ward 18 in the current active zone set | APPROVED_CURRENT | Ward 18 is directly corroborated by current DNCC pages and its parent zone chain is independently verified. |
| DSCC Ward 76 | `https://dscc.gov.bd/pages/static-pages/6922e104933eb65569e29a09` (current location page); OCR artifact `D:\wpa\furtail\furtail_app_api\.tmp-dscc-page-6.ocr.txt`; worksheet row `DSCC-063` | Retrieved live on 2026-07-28 | Current official page plus OCR-derived artifact | OCR row text in worksheet: `Ward-55 under Zone 5` | `ZONE-DSCC-05` | Current official DSCC summary says the corporation has 75 wards; no current official source explicitly establishes Ward 76 | NEEDS_REVIEW | The OCR evidence conflicts with the proposed 76 numbering, and the current official DSCC summary reports 75 wards. This is unresolved and must remain unapproved. |
| DSCC Area 76A | `https://dscc.gov.bd/pages/static-pages/6922e104933eb65569e29a09` (current location page); OCR artifact `D:\wpa\furtail\furtail_app_api\.tmp-dscc-page-6.ocr.txt`; worksheet row `DSCC-064` | Retrieved live on 2026-07-28 | Current official page plus OCR-derived artifact | OCR row text in worksheet: `Area 55A` | `WARD-DSCC-76` | No current official DSCC source explicitly establishes Area 76A or a verified Ward 76 parent | NEEDS_REVIEW | The OCR evidence names Area 55A, not 76A. Because Ward 76 is also unverified, the proposed area record remains unapproved. |

## Conflicting Official Statements

- DNCC: current official administrative pages support Zone 3 and Ward 18, but the `Mohakhali` alias itself only appears in OCR/tender-derived material and is not independently verified.
- DSCC: the current official summary page reports `75 wards`, and a notice page also references `10 zones` and `75 wards`. That conflicts with the proposed `Ward 76` and `Area 76A` candidates.
- DSCC OCR evidence for the staged candidates reads `Ward-55 under Zone 5` and `Area 55A`, which further conflicts with the proposed 76-series numbering.

## Counts

- Newly approved as current: 2
- Historical: 0
- Rejected: 0
- Still needing review: 2

## Validation

Command:

```bash
npx tsx scripts/validate-dhaka-urban-review.ts
```

Result:

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

## Changed Files

- `D:\wpa\furtail\furtail_app_api\migration-reports\dhaka-urban-review\dncc.review-worksheet.json`
- `D:\wpa\furtail\furtail_app_api\migration-reports\dhaka-urban-review\dscc.review-worksheet.json`
- `D:\wpa\furtail\furtail_app_api\migration-reports\dhaka-urban-review\four-candidate-evidence-review.md`

## Unchanged Systems

- Database: unchanged
- Canonical seed: unchanged
- Flutter: unchanged
