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

type EventRow = {
  event_id: number;               // PK, DESC 커서
  kind: "LISTED" | "SOLD" | "CANCELLED" | "TRANSFER_IN" | "TRANSFER_OUT";
  tx_hash: string;
  block_number: number | null;
  ts_sec: number | null;          // seconds
  nft_address: string;
  token_id: string;               // decimal string
  price_wei: string | null;       // 일부 이벤트는 null 가능
  actor?: string | null;          // 이벤트 주체(있다면)
  from?: string | null;
  to?: string | null;
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
    const account = url.searchParams.get("account");      // 내 주소(관여 이벤트)
    const nftAddress = url.searchParams.get("nft_address");
    const kind = url.searchParams.get("kind");            // LISTED | SOLD | CANCELLED | TRANSFER_IN | TRANSFER_OUT
    const cursor = url.searchParams.get("cursor");        // numeric event_id
    const limitParam = url.searchParams.get("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? 50) || 50, 200));

    // Validate
    if (account && !ETH_ADDR_RE.test(account)) {
      return jsonWithCors({ error: "유효하지 않은 account 주소" }, 400);
    }
    if (nftAddress && !ETH_ADDR_RE.test(nftAddress)) {
      return jsonWithCors({ error: "유효하지 않은 nft_address" }, 400);
    }
    if (cursor && !/^\d+$/.test(cursor)) {
      return jsonWithCors({ error: "유효하지 않은 cursor" }, 400);
    }
    if (kind && !["LISTED", "SOLD", "CANCELLED", "TRANSFER_IN", "TRANSFER_OUT"].includes(kind)) {
      return jsonWithCors({ error: "유효하지 않은 kind" }, 400);
    }

    // ===== WHERE / Binds =====
    const where: string[] = [];
    const binds: (string | number)[] = [];

    if (account) {
      // from / to / actor 중 하나로 관여한 이벤트
      where.push("(from = ? OR to = ? OR actor = ?)");
      binds.push(account, account, account);
    }
    if (nftAddress) {
      where.push("nft_address = ?");
      binds.push(nftAddress);
    }
    if (kind) {
      where.push("kind = ?");
      binds.push(kind);
    }
    if (cursor) {
      where.push("event_id < ?");
      binds.push(Number(cursor));
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // ===== Query =====
    // 테이블 가정: nft_marketplace_events
    // 컬럼 가정: event_id, kind, tx_hash, block_number, ts_sec, nft_address, token_id, price_wei, actor, from, to
    const sql = `
      SELECT
        event_id, kind, tx_hash, block_number, ts_sec,
        nft_address, token_id, price_wei, actor, \`from\`, \`to\`
      FROM nft_marketplace_events
      ${whereSql}
      ORDER BY event_id DESC
      LIMIT ?
    `;
    binds.push(limit);

    const statement = env.DB.prepare(sql).bind(...binds);
    const { results } = await statement.all<EventRow>();

    // ===== NFT metadata batch =====
    const pairs: { collection: string; tokenId: number }[] = [];
    const keys: string[] = [];
    for (const r of results) {
      const coll = ADDR_TO_COLLECTION[r.nft_address];
      if (!coll) continue;
      const tid = Number(r.token_id);
      if (!Number.isFinite(tid)) continue;
      pairs.push({ collection: coll, tokenId: tid });
      keys.push(`${coll}:${tid}`);
    }

    const metaMap = pairs.length ? await getBulkNftData(env, pairs) : {};

    // ===== Build response items =====
    const items = results.map((r) => {
      const coll = ADDR_TO_COLLECTION[r.nft_address];
      const tid = Number(r.token_id);
      const key = coll && Number.isFinite(tid) ? `${coll}:${tid}` : "";
      const nft = key ? (metaMap[key] ?? null) : null;

      return {
        event_id: r.event_id,
        kind: r.kind,
        tx_hash: r.tx_hash,
        block_number: r.block_number,
        ts_sec: r.ts_sec,
        nft_address: r.nft_address,
        token_id: r.token_id,
        price_wei: r.price_wei,
        actor: r.actor ?? null,
        from: r.from ?? null,
        to: r.to ?? null,
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
    return jsonWithCors(
      { error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}
