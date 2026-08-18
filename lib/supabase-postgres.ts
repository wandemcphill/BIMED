type DatabaseUrlKind = 'direct' | 'session' | 'transaction';
type DatabasePurpose = 'maintenance' | 'runtime' | 'transient';

type DatabaseUrlSelection = {
  kind: DatabaseUrlKind | null;
  url: string | null;
};

const preferenceByPurpose: Record<DatabasePurpose, DatabaseUrlKind[]> = {
  maintenance: ['direct', 'session', 'transaction'],
  runtime: ['direct', 'session', 'transaction'],
  transient: ['transaction', 'session', 'direct'],
};

export function getSupabaseDatabaseUrls() {
  return {
    direct: process.env.SUPABASE_DB_DIRECT_URL || null,
    session: process.env.SUPABASE_DB_SESSION_URL || null,
    transaction: process.env.SUPABASE_DB_TRANSACTION_URL || null,
  };
}

export function resolveSupabaseDatabaseUrl(purpose: DatabasePurpose = 'runtime'): DatabaseUrlSelection {
  const urls = getSupabaseDatabaseUrls();

  for (const kind of preferenceByPurpose[purpose]) {
    const url = urls[kind];
    if (url) {
      return { kind, url };
    }
  }

  return { kind: null, url: null };
}

export function requireSupabaseDatabaseUrl(purpose: DatabasePurpose = 'runtime') {
  const selection = resolveSupabaseDatabaseUrl(purpose);

  if (!selection.url) {
    throw new Error(
      'No Supabase Postgres connection URL is configured. Set SUPABASE_DB_DIRECT_URL, SUPABASE_DB_SESSION_URL, or SUPABASE_DB_TRANSACTION_URL.'
    );
  }

  return selection;
}
