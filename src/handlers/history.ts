import { jsonWithCors } from "@gaiaprotocol/worker-common";
import { getBulkNftData } from "../services/nft";

const ETH_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

const ADDR_TO_COLLECTION: Record<string, string> = {
  "0xE47E90C58F8336A2f24Bcd9bCB530e2e02E1E8ae": "dogesoundclub-mates",
  "0x2B303fd0082E4B51e5A6C602F45545204bbbB4DC": "dogesoundclub-e-mates",
  "0xDeDd727ab86bce5D416F9163B2448860BbDE86d4": "dogesoundclub-biased-mates",
  "0x81b5C41Bac33ea696D9684D9aFdB6cd9f6Ee5CFF": "kingcrowndao-pixel-kongz",
  "0xF967431fb8F5B4767567854dE5448D2EdC21a482": "kingcrowndao-kongz",
  "0x7340a44AbD05280591377345d21792Cdc916A388": "sigor-sparrows",
  "0x455Ee7dD1fc5722A7882aD6B7B8c075655B8005B": "sigor-housedeeds",
  "0x595b299Db9d83279d20aC37A85D36489987d7660": "babyping",
};

export type HistoryEventKind = "LISTED" | "SOLD" | "CANCELLED";

type EventRow = {
  event_id: number;              // list_id*10 + code
  kind: HistoryEventKind;
  tx_hash: string | null;
  block_number: number | null;
  ts_sec: number | null;
  nft_address: string;
  token_id: string;
  price_wei: string | null;
  actor: string | null;
  from_addr: string | null;
  to_addr: string | null;
};

type NftData = {
  collection: string;
  id: number;
  name: string;
  description?: string;
  image: string;
  external_url?: string;
  animation_url?: string;
  traits?: Record<string, string | number>;
  parts?: Record<string, string | number>;
  holder: string;
  contract_addr: `0x${string}`;
  thumbnail?: string;
};

export async function handleGetHistory(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);

    // ===== Filters =====
    const account = url.searchParams.get("account") ?? undefined;     // 관여 주소 (owner/buyer)
    const nftAddress = url.searchParams.get("nft_address") ?? undefined;
    const kind = url.searchParams.get("kind") as HistoryEventKind | undefined; // LISTED | SOLD | CANCELLED
    const cursor = url.searchParams.get("cursor") ?? undefined;       // numeric event_id
    const limitParam = url.searchParams.get("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? 50) || 50, 200));

    // ===== Validate =====
    if (account && !ETH_ADDR_RE.test(account)) {
      return jsonWithCors({ error: "유효하지 않은 account 주소" }, 400);
    }
    if (nftAddress && !ETH_ADDR_RE.test(nftAddress)) {
      return jsonWithCors({ error: "유효하지 않은 nft_address" }, 400);
    }
    if (cursor && !/^\d+$/.test(cursor)) {
      return jsonWithCors({ error: "유효하지 않은 cursor" }, 400);
    }
    if (kind && !["LISTED", "SOLD", "CANCELLED"].includes(kind)) {
      return jsonWithCors({ error: "유효하지 않은 kind" }, 400);
    }

    // ===== Base filter for listings =====
    const baseWhere: string[] = [];
    const baseBinds: (string | number)[] = [];

    if (nftAddress) {
      baseWhere.push("nft_address = ?");
      baseBinds.push(nftAddress);
    }
    // account 필터는 UNION OUTER에서 actor/from/to 기준으로 걸 거라 여기선 생략

    // ===== UNION 으로 가상 이벤트 생성 =====
    // event_id = list_id*10 + code(1:LISTED,2:SOLD,3:CANCELLED)
    // LISTED: 항상 존재
    // SOLD: status='BOUGHT'
    // CANCELLED: status='CANCELLED'
    const baseWhereSql = baseWhere.length ? `WHERE ${baseWhere.join(" AND ")}` : "";

    let sql = `
      WITH events AS (
        -- LISTED
        SELECT
          (list_id * 10 + 1) AS event_id,
          'LISTED'           AS kind,
          tx_listed          AS tx_hash,
          block_listed       AS block_number,
          ts_listed          AS ts_sec,
          nft_address,
          token_id,
          price_wei,
          owner              AS actor,
          owner              AS from_addr,
          NULL               AS to_addr
        FROM nft_marketplace_listings
        ${baseWhereSql}

        UNION ALL

        -- SOLD
        SELECT
          (list_id * 10 + 2) AS event_id,
          'SOLD'             AS kind,
          tx_settled         AS tx_hash,
          block_settled      AS block_number,
          ts_settled         AS ts_sec,
          nft_address,
          token_id,
          price_wei,
          buyer              AS actor,
          owner              AS from_addr,
          buyer              AS to_addr
        FROM nft_marketplace_listings
        ${baseWhereSql.length ? baseWhereSql + " AND " : "WHERE "} status = 'BOUGHT' AND tx_settled IS NOT NULL

        UNION ALL

        -- CANCELLED
        SELECT
          (list_id * 10 + 3) AS event_id,
          'CANCELLED'        AS kind,
          tx_settled         AS tx_hash,
          block_settled      AS block_number,
          ts_settled         AS ts_sec,
          nft_address,
          token_id,
          price_wei,
          owner              AS actor,
          owner              AS from_addr,
          NULL               AS to_addr
        FROM nft_marketplace_listings
        ${baseWhereSql.length ? baseWhereSql + " AND " : "WHERE "} status = 'CANCELLED' AND tx_settled IS NOT NULL
      )
      SELECT *
      FROM events
    `;

    const outerWhere: string[] = [];
    const outerBinds: (string | number)[] = [];

    if (kind) {
      outerWhere.push(`kind = ?`);
      outerBinds.push(kind);
    }
    if (account) {
      outerWhere.push(`(actor = ? OR from_addr = ? OR to_addr = ?)`);
      outerBinds.push(account, account, account);
    }
    if (cursor) {
      outerWhere.push(`event_id < ?`);
      outerBinds.push(Number(cursor));
    }

    if (outerWhere.length) {
      sql += ` WHERE ${outerWhere.join(" AND ")}`;
    }

    sql += ` ORDER BY event_id DESC LIMIT ?`;

    const binds = [...baseBinds, ...baseBinds, ...baseBinds, ...outerBinds, limit];

    const stmt = env.DB.prepare(sql).bind(...binds);
    const { results } = await stmt.all<EventRow>();

    // ===== 메타 일괄 주입 =====
    const pairs: { collection: string; tokenId: number }[] = [];
    for (const r of results) {
      const coll = ADDR_TO_COLLECTION[r.nft_address];
      if (!coll) continue;
      const tokenIdNum = Number(r.token_id);
      if (!Number.isFinite(tokenIdNum)) continue;
      pairs.push({ collection: coll, tokenId: tokenIdNum });
    }
    const metaMap = pairs.length
      ? await getBulkNftData(env, pairs)
      : {};

    const items = results.map((r) => {
      const coll = ADDR_TO_COLLECTION[r.nft_address];
      const tokenIdNum = Number(r.token_id);
      const key = coll && Number.isFinite(tokenIdNum) ? `${coll}:${tokenIdNum}` : "";
      const nft = key ? metaMap[key] ?? null : null;

      return {
        event_id: r.event_id,
        kind: r.kind,
        tx_hash: r.tx_hash,
        block_number: r.block_number,
        ts_sec: r.ts_sec,
        nft_address: r.nft_address,
        token_id: r.token_id,
        price_wei: r.price_wei,
        actor: r.actor,
        from: r.from_addr,
        to: r.to_addr,
        nft
      };
    });

    const nextCursor =
      results.length === limit ? String(results[results.length - 1].event_id) : null;

    return jsonWithCors({
      items,
      nextCursor,
      filters: { account: account ?? null, nft_address: nftAddress ?? null, kind: kind ?? null },
      pageInfo: { limit }
    });
  } catch (err) {
    console.error(err);
    return jsonWithCors({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}
