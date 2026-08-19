/**
 * Minimal in-memory stand-in for the Supabase client, covering exactly the query shapes
 * used by lib/email/transport.ts and lib/admin-password-reset.ts.
 *
 * It is deliberately small: enough to exercise duplicate protection, delivery logging and
 * single-use reset tokens without a database or network.
 */

type Row = Record<string, any>;

type Filter = { kind: 'eq' | 'is'; column: string; value: unknown };

type Operation =
  | { kind: 'select' }
  | { kind: 'insert'; payload: Row | Row[] }
  | { kind: 'update'; payload: Row }
  | { kind: 'upsert'; payload: Row; onConflict?: string };

/** Columns with a unique constraint, mirroring supabase/schema.sql. */
const UNIQUE_COLUMNS: Record<string, string[]> = {
  recruitment_email_log: ['dedupe_key'],
  recruitment_admin_password_resets: ['token_hash'],
  recruitment_admin_users: ['email'],
};

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${String(idCounter).padStart(8, '0')}`;
}

export class FakeSupabase {
  tables: Record<string, Row[]>;

  constructor(seed: Record<string, Row[]> = {}) {
    this.tables = {};
    for (const [table, rows] of Object.entries(seed)) {
      this.tables[table] = rows.map((row) => ({ ...row }));
    }
  }

  rows(table: string): Row[] {
    if (!this.tables[table]) {
      this.tables[table] = [];
    }
    return this.tables[table];
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

class FakeQuery implements PromiseLike<{ data: any; error: any }> {
  private operation: Operation = { kind: 'select' };
  private filters: Filter[] = [];
  private singleMode: 'single' | 'maybeSingle' | null = null;
  private wantsSelect = false;

  constructor(
    private db: FakeSupabase,
    private table: string
  ) {}

  select(_columns?: string) {
    this.wantsSelect = true;
    return this;
  }

  insert(payload: Row | Row[]) {
    this.operation = { kind: 'insert', payload };
    return this;
  }

  update(payload: Row) {
    this.operation = { kind: 'update', payload };
    return this;
  }

  upsert(payload: Row, options?: { onConflict?: string }) {
    this.operation = { kind: 'upsert', payload, onConflict: options?.onConflict };
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: 'eq', column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ kind: 'is', column, value });
    return this;
  }

  order(_column: string, _options?: unknown) {
    return this;
  }

  limit(_count: number) {
    return this;
  }

  or(_expression: string) {
    return this;
  }

  single() {
    this.singleMode = 'single';
    return this;
  }

  maybeSingle() {
    this.singleMode = 'maybeSingle';
    return this;
  }

  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    let result: { data: any; error: any };

    try {
      result = this.execute();
    } catch (error) {
      return Promise.reject(error).then(onfulfilled as any, onrejected as any);
    }

    return Promise.resolve(result).then(onfulfilled as any, onrejected as any);
  }

  private matches(row: Row) {
    return this.filters.every((filter) => {
      if (filter.kind === 'is') {
        return filter.value === null ? row[filter.column] === null || row[filter.column] === undefined : row[filter.column] === filter.value;
      }
      return row[filter.column] === filter.value;
    });
  }

  private uniqueViolation(candidate: Row, ignoreRow?: Row) {
    for (const column of UNIQUE_COLUMNS[this.table] || []) {
      if (candidate[column] === undefined) {
        continue;
      }

      const clash = this.db
        .rows(this.table)
        .find((row) => row !== ignoreRow && row[column] === candidate[column]);

      if (clash) {
        return true;
      }
    }

    return false;
  }

  private shape(rows: Row[]) {
    if (this.singleMode === 'single') {
      if (rows.length === 0) {
        return { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
      }
      return { data: { ...rows[0] }, error: null };
    }

    if (this.singleMode === 'maybeSingle') {
      return { data: rows.length ? { ...rows[0] } : null, error: null };
    }

    return { data: rows.map((row) => ({ ...row })), error: null };
  }

  private execute(): { data: any; error: any } {
    const store = this.db.rows(this.table);

    if (this.operation.kind === 'select') {
      return this.shape(store.filter((row) => this.matches(row)));
    }

    if (this.operation.kind === 'insert') {
      const incoming = Array.isArray(this.operation.payload) ? this.operation.payload : [this.operation.payload];
      const created: Row[] = [];

      for (const candidate of incoming) {
        if (this.uniqueViolation(candidate)) {
          return {
            data: null,
            error: { code: '23505', message: `duplicate key value violates unique constraint on ${this.table}` },
          };
        }

        const row: Row = {
          id: candidate.id ?? nextId(this.table),
          created_at: candidate.created_at ?? new Date().toISOString(),
          updated_at: candidate.updated_at ?? new Date().toISOString(),
          ...candidate,
        };

        store.push(row);
        created.push(row);
      }

      return this.shape(created);
    }

    if (this.operation.kind === 'upsert') {
      const conflictColumn = this.operation.onConflict;
      const payload = this.operation.payload;

      if (conflictColumn) {
        const existing = store.find((row) => row[conflictColumn] === payload[conflictColumn]);
        if (existing) {
          Object.assign(existing, payload);
          return this.shape([existing]);
        }
      }

      const row: Row = {
        id: payload.id ?? nextId(this.table),
        created_at: payload.created_at ?? new Date().toISOString(),
        ...payload,
      };
      store.push(row);
      return this.shape([row]);
    }

    // update
    const targets = store.filter((row) => this.matches(row));
    for (const row of targets) {
      Object.assign(row, this.operation.payload);
    }

    if (!this.wantsSelect && this.singleMode === null) {
      return { data: null, error: null };
    }

    return this.shape(targets);
  }
}

export function createFakeSupabase(seed: Record<string, Row[]> = {}) {
  // Cast: the fake implements only the subset of SupabaseClient the code under test uses.
  return new FakeSupabase(seed) as unknown as FakeSupabase & Record<string, any>;
}
