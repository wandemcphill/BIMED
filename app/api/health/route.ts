import {NextResponse} from 'next/server';
import {db} from '@/lib/db';

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    const client = db();
    const {data, error} = await client.rpc('bimed_release_readiness_check');

    if (error || !data?.ok) {
      return NextResponse.json(
        {
          ok: false,
          service: 'bimed-recruitment-portal',
          timestamp,
          schema: {
            ok: false,
            ...(data || {}),
            error: error?.message || null,
          },
        },
        {
          status: 503,
          headers: {'Cache-Control': 'no-store'},
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        service: 'bimed-recruitment-portal',
        timestamp,
        schema: data,
      },
      {
        headers: {'Cache-Control': 'no-store'},
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: 'bimed-recruitment-portal',
        timestamp,
        schema: {
          ok: false,
          error: error instanceof Error ? error.message : 'Schema readiness check failed.',
        },
      },
      {
        status: 503,
        headers: {'Cache-Control': 'no-store'},
      }
    );
  }
}
