const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function redactValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactValue);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    if (/password|secret|token|authorization|credential/i.test(key)) {
      output[key] = '[REDACTED]';
      continue;
    }
    output[key] = redactValue(nested);
  }
  return output;
}

function canonicalize(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalize(value[key]);
  }
  return out;
}

function checksumRows(rows) {
  const hash = crypto.createHash('sha256');
  for (const row of rows) {
    hash.update(JSON.stringify(canonicalize(row)));
    hash.update('\n');
  }
  return hash.digest('hex');
}

function readJson(filePath, fallback) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, data) {
  if (!filePath) return;
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function appendJsonl(filePath, data) {
  if (!filePath) return;
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(redactValue(data))}\n`, 'utf8');
}

function pickFirst(row, aliases) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias) && row[alias] !== undefined) {
      return row[alias];
    }
  }
  return undefined;
}

function normalizeRow(row, columns, aliases) {
  const normalized = {};
  for (const column of columns) {
    const names = Array.isArray(aliases?.[column]) ? aliases[column] : [column];
    normalized[column] = pickFirst(row, names);
  }
  return normalized;
}

function missingRequiredColumns(row, requiredColumns) {
  return requiredColumns.filter((column) => row[column] === undefined || row[column] === null);
}

function shouldCancel(options) {
  if (options.signal?.aborted) return true;
  if (options.cancelFilePath && fs.existsSync(options.cancelFilePath)) return true;
  return false;
}

function buildCheckpointShape(manifest, existing) {
  return {
    version: manifest.version ?? 1,
    jobs: { ...(existing?.jobs ?? {}) },
    cancelled: Boolean(existing?.cancelled),
  };
}

class FixtureStore {
  constructor(seed = {}) {
    this.tables = new Map();
    for (const [table, rows] of Object.entries(seed)) {
      this.tables.set(
        table,
        rows.map((row) => ({ ...row })),
      );
    }
  }

  async fetchBatch(job, cursor, limit) {
    const rows = [...(this.tables.get(job.table) ?? [])].sort((a, b) => {
      const left = Number(a[job.cursorColumn]);
      const right = Number(b[job.cursorColumn]);
      return left - right;
    });
    const filtered = rows.filter((row) => {
      if (cursor === null || cursor === undefined || cursor === '') return true;
      return Number(row[job.cursorColumn]) > Number(cursor);
    });
    return filtered.slice(0, limit).map((row) => ({ ...row }));
  }

  async upsertBatch(job, rows) {
    if (rows.length === 0) return;
    const table = [...(this.tables.get(job.table) ?? [])];
    for (const row of rows) {
      const key = job.keyColumns.map((column) => String(row[column])).join('::');
      const index = table.findIndex((candidate) =>
        job.keyColumns.every((column) => String(candidate[column]) === String(row[column])),
      );
      if (index >= 0) {
        table[index] = { ...table[index], ...row };
      } else {
        table.push({ ...row, _key: key });
      }
    }
    this.tables.set(job.table, table);
  }

  async snapshot(job) {
    return [...(this.tables.get(job.table) ?? [])].map((row) => ({ ...row }));
  }

  clone() {
    const snapshot = {};
    for (const [table, rows] of this.tables.entries()) {
      snapshot[table] = rows.map((row) => ({ ...row }));
    }
    return new FixtureStore(snapshot);
  }
}

function createPgStore(connectionString, role) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString });

  async function queryOnce(sql, params = []) {
    const client = await pool.connect();
    try {
      return await client.query(sql, params);
    } finally {
      client.release();
    }
  }

  return {
    async fetchBatch(job, cursor, limit) {
      const selectColumns = job.columns.map((column) => `"${column}"`).join(', ');
      const clauses = [];
      const params = [];
      if (cursor !== null && cursor !== undefined && cursor !== '') {
        params.push(cursor);
        clauses.push(`"${job.cursorColumn}" > $${params.length}`);
      }
      params.push(limit);
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const sql = `SELECT ${selectColumns} FROM "${job.table}" ${where} ORDER BY "${job.cursorColumn}" ASC LIMIT $${params.length}`;
      const result = await queryOnce(sql, params);
      return result.rows;
    },

    async upsertBatch(job, rows) {
      if (rows.length === 0) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const row of rows) {
          const values = job.columns.map((column) => row[column]);
          const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
          const updateColumns = job.columns.filter((column) => !job.keyColumns.includes(column));
          const updateSql = updateColumns
            .map((column) => `"${column}" = EXCLUDED."${column}"`)
            .join(', ');
          const conflictSql = job.keyColumns.map((column) => `"${column}"`).join(', ');
          const sql =
            `INSERT INTO "${job.table}" (${job.columns.map((column) => `"${column}"`).join(', ')}) ` +
            `VALUES (${placeholders}) ` +
            `ON CONFLICT (${conflictSql}) DO UPDATE SET ${updateSql}`;
          await client.query(sql, values);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async snapshot(job) {
      const result = await queryOnce(
        `SELECT ${job.columns.map((column) => `"${column}"`).join(', ')} FROM "${job.table}" ORDER BY "${job.cursorColumn}" ASC`,
      );
      return result.rows;
    },

    async close() {
      await pool.end();
    },

    role,
  };
}

async function runLegacyMigration(options) {
  const {
    source,
    destination,
    manifest,
    checkpointFilePath,
    rejectedFilePath,
    dryRun = false,
    batchSize = 500,
    reconcile = false,
    signal,
    cancelFilePath,
    onProgress,
  } = options;

  const checkpoint = buildCheckpointShape(manifest, readJson(checkpointFilePath, null));
  const summary = {
    dryRun,
    cancelled: false,
    batchSize,
    sourceRows: 0,
    migratedRows: 0,
    rejectedRows: 0,
    checksum: '',
    jobs: [],
    reconciliations: [],
  };
  const overallHash = crypto.createHash('sha256');

  for (const job of manifest.jobs) {
    const state = checkpoint.jobs[job.name] ?? {
      cursor: null,
      migrated: 0,
      rejected: 0,
      checksum: '',
      complete: false,
    };
    if (state.complete) {
      summary.jobs.push({ name: job.name, skipped: true, ...state });
      continue;
    }

    let cursor = state.cursor ?? null;
    let jobSourceRows = 0;
    let jobMigratedRows = state.migrated ?? 0;
    let jobRejectedRows = state.rejected ?? 0;
    const jobHashes = [];

    while (true) {
      if (shouldCancel({ signal, cancelFilePath })) {
        checkpoint.cancelled = true;
        checkpoint.jobs[job.name] = {
          cursor,
          migrated: jobMigratedRows,
          rejected: jobRejectedRows,
          checksum: jobHashes.join('|'),
          complete: false,
        };
        writeJsonAtomic(checkpointFilePath, checkpoint);
        summary.cancelled = true;
        summary.jobs.push({
          name: job.name,
          cursor,
          sourceRows: jobSourceRows,
          migratedRows: jobMigratedRows,
          rejectedRows: jobRejectedRows,
          checksum: checksumRows(jobHashes),
          complete: false,
          cancelled: true,
        });
        return summary;
      }

      const batch = await source.fetchBatch(job, cursor, batchSize);
      if (batch.length === 0) break;

      jobSourceRows += batch.length;
      summary.sourceRows += batch.length;

      const canonicalRows = [];
      for (const row of batch) {
        try {
          const normalized = normalizeRow(row, job.columns, job.aliases);
          const missing = missingRequiredColumns(normalized, job.requiredColumns ?? []);
          if (missing.length > 0) {
            throw new Error(`Missing required columns: ${missing.join(', ')}`);
          }
          canonicalRows.push(normalized);
        } catch (error) {
          jobRejectedRows += 1;
          summary.rejectedRows += 1;
          appendJsonl(rejectedFilePath, {
            job: job.name,
            table: job.table,
            cursor: row[job.cursorColumn],
            error: error instanceof Error ? error.message : String(error),
            row,
          });
        }
      }

      if (!dryRun && canonicalRows.length > 0) {
        await destination.upsertBatch(job, canonicalRows);
      }

      if (canonicalRows.length > 0) {
        const batchChecksum = checksumRows(canonicalRows);
        jobHashes.push(batchChecksum);
        overallHash.update(batchChecksum);
        jobMigratedRows += canonicalRows.length;
        summary.migratedRows += canonicalRows.length;
      }

      const tail = batch[batch.length - 1];
      cursor = tail ? tail[job.cursorColumn] : cursor;
      checkpoint.jobs[job.name] = {
        cursor,
        migrated: jobMigratedRows,
        rejected: jobRejectedRows,
        checksum: jobHashes.join('|'),
        complete: false,
      };
      writeJsonAtomic(checkpointFilePath, checkpoint);
      onProgress?.({
        job: job.name,
        cursor,
        sourceRows: jobSourceRows,
        migratedRows: jobMigratedRows,
        rejectedRows: jobRejectedRows,
      });
    }

    const jobSummary = {
      name: job.name,
      cursor,
      sourceRows: jobSourceRows,
      migratedRows: jobMigratedRows,
      rejectedRows: jobRejectedRows,
      checksum: checksumRows(jobHashes),
      complete: true,
    };

    if (reconcile) {
      const sourceRows = await source.snapshot(job);
      const destinationRows = dryRun ? sourceRows : await destination.snapshot(job);
      const sourceChecksum = checksumRows(sourceRows);
      const destinationChecksum = checksumRows(destinationRows);
      summary.reconciliations.push({
        job: job.name,
        sourceCount: sourceRows.length,
        destinationCount: destinationRows.length,
        sourceChecksum,
        destinationChecksum,
        match:
          sourceRows.length === destinationRows.length && sourceChecksum === destinationChecksum,
      });
    }

    checkpoint.jobs[job.name] = { ...jobSummary };
    writeJsonAtomic(checkpointFilePath, checkpoint);
    summary.jobs.push(jobSummary);
  }

  summary.checksum = overallHash.digest('hex');
  writeJsonAtomic(checkpointFilePath, checkpoint);
  return summary;
}

function loadManifest(manifestPath) {
  const resolved = manifestPath ?? path.join(__dirname, 'legacy-data.manifest.json');
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [name, inline] = arg.split('=');
    const key = name.slice(2);
    if (inline !== undefined) {
      args[key] = inline;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

async function runCli(argv) {
  const args = parseArgs(argv);
  const sourceUrl = args['source-url'] || process.env.SOURCE_DATABASE_URL;
  const destinationUrl = args['destination-url'] || process.env.DESTINATION_DATABASE_URL;
  if (!sourceUrl || !destinationUrl) {
    throw new Error('source-url and destination-url are required');
  }

  const manifest = loadManifest(args.manifest);
  const source = createPgStore(sourceUrl, 'source');
  const destination = createPgStore(destinationUrl, 'destination');
  const summary = await runLegacyMigration({
    source,
    destination,
    manifest,
    checkpointFilePath: args.checkpoint || path.join(process.cwd(), 'migration-checkpoint.json'),
    rejectedFilePath: args.rejected || path.join(process.cwd(), 'migration-rejected.jsonl'),
    dryRun: args['dry-run'] === true || args['dry-run'] === 'true',
    batchSize: Number(args['batch-size'] ?? 500),
    reconcile: args.reconcile === true || args.reconcile === 'true',
    cancelFilePath: args['cancel-file'] || undefined,
  });

  console.log(
    JSON.stringify(
      {
        sourceUrl: redactUrl(sourceUrl),
        destinationUrl: redactUrl(destinationUrl),
        summary,
      },
      null,
      2,
    ),
  );

  await source.close?.();
  await destination.close?.();
}

function redactUrl(value) {
  try {
    const url = new URL(value);
    if (url.password) url.password = '***';
    if (url.username) url.username = '***';
    return url.toString();
  } catch {
    return '[invalid-url]';
  }
}

module.exports = {
  FixtureStore,
  checksumRows,
  createPgStore,
  loadManifest,
  parseArgs,
  redactUrl,
  runCli,
  runLegacyMigration,
  writeJsonAtomic,
  readJson,
};
