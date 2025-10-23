import { jsonWithCors } from "@gaiaprotocol/worker-common";
import { getBulkNftData } from "../services/nft";

const ETH_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

// address → collection 슬러그 매핑 (services/nft의 NFT_ADDRESSES를 역으로 구성)
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
  nft: NftData | null; // ✅ 완성 메타데이터 주입
};

export async function handleGetActiveListings(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);

    // Optional filters
    const owner = url.searchParams.get("owner");
    const nftAddress = url.searchParams.get("nft_address");

    // Cursor-based pagination (use list_id as cursor)
    const cursor = url.searchParams.get("cursor"); // expect numeric list_id
    const limitParam = url.searchParams.get("limit");
    const limit = Math.max(1, Math.min(Number(limitParam ?? 50) || 50, 200));

    // Validate inputs
    if (owner && !ETH_ADDR_RE.test(owner)) {
      return jsonWithCors({ error: "유효하지 않은 owner 주소" }, 400);
    }
    if (nftAddress && !ETH_ADDR_RE.test(nftAddress)) {
      return jsonWithCors({ error: "유효하지 않은 nft_address" }, 400);
    }
    if (cursor && !/^\d+$/.test(cursor)) {
      return jsonWithCors({ error: "유효하지 않은 cursor" }, 400);
    }

    // Build WHERE and binds
    const where: string[] = [`status = 'LISTED'`];
    const binds: (string | number)[] = [];

    if (owner) {
      where.push(`owner = ?`);
      binds.push(owner);
    }
    if (nftAddress) {
      where.push(`nft_address = ?`);
      binds.push(nftAddress);
    }
    if (cursor) {
      // paginate descending by list_id
      where.push(`list_id < ?`);
      binds.push(Number(cursor));
    }

    // 1) 리스팅 먼저 읽기 (조인 없이 가볍게)
    const sql = `
      SELECT
        list_id, owner, nft_address, token_id, price_wei,
        tx_listed, block_listed, ts_listed
      FROM nft_marketplace_listings
      WHERE ${where.join(" AND ")}
      ORDER BY list_id DESC
      LIMIT ?
    `;
    binds.push(limit);

    const statement = env.DB.prepare(sql).bind(...binds);
    const { results } = await statement.all<ListingRow>();

    // 2) 메타데이터를 일괄 주입하기 위해 collection/tokenId 쌍 만들기
    const pairs: { collection: string; tokenId: number }[] = [];
    const keys: string[] = []; // `${collection}:${tokenId}` 키를 저장해 매핑에 사용
    for (const r of results) {
      const collection = ADDR_TO_COLLECTION[r.nft_address];
      if (!collection) continue; // 알 수 없는 컬렉션은 메타없이 진행
      // token_id가 매우 큰 경우 Number 변환이 안전하지 않을 수 있음 → 가능한 한 정수 범위 체크
      const tokenIdNum = Number(r.token_id);
      if (!Number.isFinite(tokenIdNum)) continue;
      pairs.push({ collection, tokenId: tokenIdNum });
      keys.push(`${collection}:${tokenIdNum}`);
    }

    // 3) services/nft의 getBulkNftData로 정적/동적 메타를 한 방에 로드
    const metaMap = pairs.length
      ? await getBulkNftData(env, pairs)
      : {};

    // 4) 결과 조립
    const items = results.map((r) => {
      const coll = ADDR_TO_COLLECTION[r.nft_address];
      const tokenIdNum = Number(r.token_id);
      const key = coll && Number.isFinite(tokenIdNum) ? `${coll}:${tokenIdNum}` : "";
      const nftMeta = key ? (metaMap[key] ?? null) : null;

      return {
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
    });

    const nextCursor =
      results.length === limit ? String(results[results.length - 1].list_id) : null;

    return jsonWithCors({
      items,
      nextCursor,
      // Echo filters for client convenience
      filters: { owner: owner ?? null, nft_address: nftAddress ?? null },
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
