import { db } from "ponder:api";
import { and, eq, asc, desc, count } from "ponder";
import { GraphQLScalarType, Kind } from "graphql";

// ── Scalars ───────────────────────────────────────────────────────────────────

export const BigIntScalar = new GraphQLScalarType({
  name: "BigInt",
  serialize: (v: unknown) => String(v),
  parseValue: (v: unknown) => BigInt(String(v)),
  parseLiteral: (ast) =>
    ast.kind === Kind.STRING || ast.kind === Kind.INT ? BigInt(ast.value) : null,
});

export const JSONScalar = new GraphQLScalarType({
  name: "JSON",
  serialize: (v) => v,
  parseValue: (v) => v,
  parseLiteral: (ast) => ast,
});

// ── Where-clause builder ──────────────────────────────────────────────────────

export const AddressScalar = new GraphQLScalarType({
  name: "Address",
  serialize: (v: unknown) => String(v),
  parseValue: (v: unknown) => String(v).toLowerCase(),
  parseLiteral: (ast) => ast.kind === Kind.STRING ? ast.value.toLowerCase() : null,
});

export function buildWhere(table: any, filter: any): any {
  if (!filter) return undefined;
  const conds = Object.entries(filter)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      const col = table[key];
      return col ? eq(col, value as any) : undefined;
    })
    .filter(Boolean);

  if (!conds.length) return undefined;
  return conds.length === 1 ? conds[0] : and(...(conds as any[]));
}

// ── Query helpers ─────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;

export async function queryList(
  table: any,
  filter: any,
  orderBy?: string,
  orderDirection?: string,
  limit?: number,
  offset?: number,
) {
  const where = buildWhere(table, filter);
  const n = Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const off = offset ?? 0;

  let q = (db as any).select().from(table).where(where);
  if (orderBy && table[orderBy]) {
    q = q.orderBy(orderDirection?.toLowerCase() === "desc" ? desc(table[orderBy]) : asc(table[orderBy]));
  }

  const [items, [{ total }]] = await Promise.all([
    q.limit(n).offset(off),
    (db as any).select({ total: count() }).from(table).where(where),
  ]);

  const totalCount = Number(total ?? 0);
  return {
    items,
    pageInfo: { hasNextPage: off + items.length < totalCount, hasPreviousPage: off > 0 },
    totalCount,
  };
}

export function byId(table: any, id: string): Promise<any> {
  return (db as any).select().from(table).where(eq(table.id, id)).limit(1)
    .then((rows: any[]) => rows[0] ?? null);
}

// ── Meta ──────────────────────────────────────────────────────────────────────

function decodeCheckpoint(cp: string) {
  return {
    blockTimestamp: Number(cp.slice(0, 10)),
    blockNumber: Number(cp.slice(26, 42)),
  };
}

export async function getMeta() {
  const rows = (await (db as any).execute(
    "SELECT chain_name, chain_id, latest_checkpoint FROM _ponder_checkpoint",
  )).rows as { chain_name: string; chain_id: string; latest_checkpoint: string }[];

  const status: Record<string, unknown> = {};
  for (const { chain_name, chain_id, latest_checkpoint } of rows) {
    const { blockNumber, blockTimestamp } = decodeCheckpoint(latest_checkpoint);
    status[chain_name] = { id: Number(chain_id), block: { number: blockNumber, timestamp: blockTimestamp } };
  }
  return { status };
}
