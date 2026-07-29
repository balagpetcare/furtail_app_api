import * as fs from 'fs';
import * as path from 'path';

type ReviewStatus =
  | 'APPROVED_CURRENT'
  | 'APPROVED_HISTORICAL'
  | 'NEEDS_REVIEW'
  | 'CONFLICTING_SOURCE'
  | 'REJECTED';

type SourceStatus = 'CURRENT_VERIFIED' | 'HISTORICAL_VERIFIED' | 'PARTIAL_CURRENT';
type LocationType = 'CITY_CORPORATION' | 'ZONE' | 'WARD' | 'AREA';

interface ReviewCandidate {
  candidateId: string;
  corporation: string;
  type: LocationType;
  englishName: string;
  bengaliName: string | null;
  proposedCode: string;
  proposedParentCode: string | null;
  exactOfficialSource: string;
  sourcePageTable: string;
  rawSourceText: string;
  extractionMethod: string;
  currentHistoricalSourceStatus: SourceStatus;
  confidence: string;
  reviewStatus: ReviewStatus;
  reviewerNotes: string;
}

interface ReviewWorksheet {
  generatedAt: string;
  corporation: string;
  sourceManifest: string;
  records: ReviewCandidate[];
}

interface ValidationResult {
  filesChecked: number;
  recordsChecked: number;
  duplicateProposedCodes: number;
  missingParentCandidates: number;
  invalidTypeHierarchy: number;
  missingSourceProvenance: number;
  accidentalApprovedCurrentWithoutVerifiedParentEvidence: number;
  statusMismatches: number;
  rejected: number;
  warnings: string[];
  errors: string[];
}

const REVIEW_DIR = path.join(__dirname, '..', 'migration-reports', 'dhaka-urban-review');
const FILES = [
  path.join(REVIEW_DIR, 'dncc.review-worksheet.json'),
  path.join(REVIEW_DIR, 'dscc.review-worksheet.json'),
] as const;

const allowedReviewStatuses = new Set<ReviewStatus>([
  'APPROVED_CURRENT',
  'APPROVED_HISTORICAL',
  'NEEDS_REVIEW',
  'CONFLICTING_SOURCE',
  'REJECTED',
]);

const allowedSourceStatuses = new Set<SourceStatus>([
  'CURRENT_VERIFIED',
  'HISTORICAL_VERIFIED',
  'PARTIAL_CURRENT',
]);

function readWorksheet(filePath: string): ReviewWorksheet {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as ReviewWorksheet;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validate(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byCode = new Map<string, ReviewCandidate>();
  const records = new Map<string, ReviewCandidate>();
  let filesChecked = 0;
  let recordsChecked = 0;
  let duplicateProposedCodes = 0;
  let missingParentCandidates = 0;
  let invalidTypeHierarchy = 0;
  let missingSourceProvenance = 0;
  let accidentalApprovedCurrentWithoutVerifiedParentEvidence = 0;
  let statusMismatches = 0;
  let rejected = 0;

  for (const filePath of FILES) {
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing review file: ${filePath}`);
      continue;
    }
    filesChecked += 1;
    const worksheet = readWorksheet(filePath);
    if (!Array.isArray(worksheet.records)) {
      errors.push(`Worksheet records missing or invalid: ${filePath}`);
      continue;
    }

    for (const candidate of worksheet.records) {
      recordsChecked += 1;
      records.set(candidate.candidateId, candidate);

      const fieldErrors: string[] = [];
      if (!hasText(candidate.candidateId)) fieldErrors.push('candidateId');
      if (!hasText(candidate.corporation)) fieldErrors.push('corporation');
      if (!hasText(candidate.englishName)) fieldErrors.push('englishName');
      if (candidate.bengaliName !== null && !hasText(candidate.bengaliName)) {
        fieldErrors.push('bengaliName');
      }
      if (!hasText(candidate.proposedCode)) fieldErrors.push('proposedCode');
      if (!hasText(candidate.exactOfficialSource)) fieldErrors.push('exactOfficialSource');
      if (!hasText(candidate.sourcePageTable)) fieldErrors.push('sourcePageTable');
      if (!hasText(candidate.rawSourceText)) fieldErrors.push('rawSourceText');
      if (!hasText(candidate.extractionMethod)) fieldErrors.push('extractionMethod');
      if (!hasText(candidate.confidence)) fieldErrors.push('confidence');
      if (!hasText(candidate.reviewerNotes)) fieldErrors.push('reviewerNotes');
      if (!allowedReviewStatuses.has(candidate.reviewStatus)) fieldErrors.push('reviewStatus');
      if (!allowedSourceStatuses.has(candidate.currentHistoricalSourceStatus)) {
        fieldErrors.push('currentHistoricalSourceStatus');
      }
      if (fieldErrors.length > 0) {
        errors.push(
          `${candidate.candidateId || '<unknown>'}: missing/invalid required field(s): ${fieldErrors.join(', ')}`,
        );
        missingSourceProvenance += 1;
      }

      const previous = byCode.get(candidate.proposedCode);
      if (previous) {
        duplicateProposedCodes += 1;
        errors.push(
          `Duplicate proposedCode ${candidate.proposedCode} used by ${previous.candidateId} and ${candidate.candidateId}`,
        );
      } else {
        byCode.set(candidate.proposedCode, candidate);
      }

      const parent = candidate.proposedParentCode ? byCode.get(candidate.proposedParentCode) : null;
      const sourceIsCurrent = candidate.currentHistoricalSourceStatus === 'CURRENT_VERIFIED';
      const sourceIsHistorical = candidate.currentHistoricalSourceStatus === 'HISTORICAL_VERIFIED';
      const sourceIsPartial = candidate.currentHistoricalSourceStatus === 'PARTIAL_CURRENT';
      const approvedCurrent = candidate.reviewStatus === 'APPROVED_CURRENT';
      const approvedHistorical = candidate.reviewStatus === 'APPROVED_HISTORICAL';
      const needsReview = candidate.reviewStatus === 'NEEDS_REVIEW';

      switch (candidate.type) {
        case 'CITY_CORPORATION':
          if (candidate.proposedParentCode !== null) {
            invalidTypeHierarchy += 1;
            errors.push(`${candidate.candidateId}: city corporation must not have a parent code`);
          }
          break;
        case 'ZONE':
          if (!candidate.proposedParentCode) {
            missingParentCandidates += 1;
            invalidTypeHierarchy += 1;
            errors.push(`${candidate.candidateId}: zone is missing a proposed parent code`);
          } else if (!parent || parent.type !== 'CITY_CORPORATION') {
            invalidTypeHierarchy += 1;
            errors.push(`${candidate.candidateId}: zone parent must be a city corporation`);
          }
          break;
        case 'WARD':
          if (!candidate.proposedParentCode) {
            missingParentCandidates += 1;
            invalidTypeHierarchy += 1;
            errors.push(`${candidate.candidateId}: ward is missing a proposed parent code`);
          } else if (!parent || parent.type !== 'ZONE') {
            invalidTypeHierarchy += 1;
            errors.push(`${candidate.candidateId}: ward parent must be a zone`);
          }
          break;
        case 'AREA':
          if (!candidate.proposedParentCode) {
            missingParentCandidates += 1;
            invalidTypeHierarchy += 1;
            errors.push(`${candidate.candidateId}: area is missing a proposed parent code`);
          } else if (!parent || parent.type !== 'WARD') {
            invalidTypeHierarchy += 1;
            errors.push(`${candidate.candidateId}: area parent must be a ward`);
          }
          break;
        default:
          invalidTypeHierarchy += 1;
          errors.push(`${candidate.candidateId}: unsupported type ${candidate.type}`);
      }

      if (sourceIsCurrent && !approvedCurrent) {
        statusMismatches += 1;
        errors.push(`${candidate.candidateId}: current-verified source must map to APPROVED_CURRENT`);
      }
      if (sourceIsHistorical && !approvedHistorical) {
        statusMismatches += 1;
        errors.push(`${candidate.candidateId}: historical-verified source must map to APPROVED_HISTORICAL`);
      }
      if (sourceIsPartial && !needsReview) {
        statusMismatches += 1;
        errors.push(`${candidate.candidateId}: partial-current source must map to NEEDS_REVIEW`);
      }

      if (approvedCurrent) {
        if (candidate.type !== 'CITY_CORPORATION') {
          if (!parent || parent.reviewStatus !== 'APPROVED_CURRENT') {
            accidentalApprovedCurrentWithoutVerifiedParentEvidence += 1;
            errors.push(
              `${candidate.candidateId}: APPROVED_CURRENT requires a verified current parent chain`,
            );
          }
        }
      }

      if (candidate.reviewStatus === 'REJECTED') rejected += 1;
    }
  }

  if (records.size === 0) {
    warnings.push('No review candidates were loaded.');
  }

  return {
    filesChecked,
    recordsChecked,
    duplicateProposedCodes,
    missingParentCandidates,
    invalidTypeHierarchy,
    missingSourceProvenance,
    accidentalApprovedCurrentWithoutVerifiedParentEvidence,
    statusMismatches,
    rejected,
    warnings,
    errors,
  };
}

const result = validate();

console.log(
  JSON.stringify(
    {
      filesChecked: result.filesChecked,
      recordsChecked: result.recordsChecked,
      duplicateProposedCodes: result.duplicateProposedCodes,
      missingParentCandidates: result.missingParentCandidates,
      invalidTypeHierarchy: result.invalidTypeHierarchy,
      missingSourceProvenance: result.missingSourceProvenance,
      accidentalApprovedCurrentWithoutVerifiedParentEvidence:
        result.accidentalApprovedCurrentWithoutVerifiedParentEvidence,
      statusMismatches: result.statusMismatches,
      rejected: result.rejected,
      warnings: result.warnings,
      errors: result.errors,
      ok: result.errors.length === 0,
    },
    null,
    2,
  ),
);

if (result.errors.length > 0) {
  process.exitCode = 1;
}
