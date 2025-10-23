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

type ListingRow = {
  list_id: number;
  owner: string;
  nft_address: string;
  token_id: string;   // uint256 -> decimal string
  price_wei: string;  // uint256 -> decimal string
  tx_listed: string;
  block_listed: number | null;
  ts_listed: number | null; // seconds
  status: string;           // 'LISTED' | 'CANCELLED' | 'SOLD' ...
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

type ListingItem = {
  list_id: number;
  owner: string;
  nft_address: string;
  token_id: string;
  price_wei: string;
  tx_listed: string;
  block_listed: number | null;
  ts_listed: number | null;
  nft: NftData | null;
};

// ✅ 단일 리스팅 상세 조회
export async function handleGetListingById(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);

    // Path 예: /listings/123
    const m = url.pathname.match(/\/listings\/(\d+)$/);
    const idStr = m?.[1];
    if (!idStr || !/^\d+$/.test(idStr)) {
      return jsonWithCors({ error: "유효하지 않은 list_id" }, 400);
    }
    const listId = Number(idStr);

    const includeInactive = url.searchParams.get("include_inactive") === "1";

    // 1) 레코드 읽기
    const where = [`list_id = ?`];
    if (!includeInactive) {
      where.push(`status = 'LISTED'`);
    }

    const sql = `
      SELECT
        list_id, owner, nft_address, token_id, price_wei,
        tx_listed, block_listed, ts_listed, status
      FROM nft_marketplace_listings
      WHERE ${where.join(" AND ")}
      LIMIT 1
    `;
    const { results } = await env.DB.prepare(sql).bind(listId).all<ListingRow>();

    if (!results?.length) {
      return jsonWithCors({ error: "Listing not found" }, 404);
    }
    const r = results[0];

    // 2) 메타데이터 주입
    const coll = ADDR_TO_COLLECTION[r.nft_address];
    let nftMeta: any | null = null;

    if (coll) {
      const tokenIdNum = Number(r.token_id);
      if (Number.isFinite(tokenIdNum)) {
        const metaMap = await getBulkNftData(env, [{ collection: coll, tokenId: tokenIdNum }]);
        nftMeta = metaMap?.[`${coll}:${tokenIdNum}`] ?? null;
      }
    }

    const item: ListingItem = {
      list_id: r.list_id,
      owner: r.owner,
      nft_address: r.nft_address,
      token_id: r.token_id,
      price_wei: r.price_wei,
      tx_listed: r.tx_listed,
      block_listed: r.block_listed,
      ts_listed: r.ts_listed,
      nft: nftMeta,
    };

    return jsonWithCors({ item });
  } catch (err) {
    console.error(err);
    return jsonWithCors(
      { error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}
