import { jsonWithCors } from "@gaiaprotocol/worker-common";
import { fetchHeldNftData } from "../services/nft";
import { getAddress } from "viem";

type NftData = {
  collection: string;
  id: number;         // rowsToData에서 token_id가 id로 들어옵니다
  name: string;
  description?: string;
  image: string;
  external_url?: string;
  animation_url?: string;
  traits?: Record<string, string | number>;
  parts?: Record<string, string | number>;
  holder: string;
  contract_addr: string;
};

export async function handleHeldNftsRequest(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const segments = url.pathname.split('/'); // "/{wallet}/nfts" => ["", "{wallet}", "nfts"]
    const walletAddress = segments[1];

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return jsonWithCors({ error: 'Invalid wallet address' }, 400);
    }

    // 쿼리 파라미터 파싱
    const collection = url.searchParams.get('collection') || undefined; // 슬러그 (예: "dogesoundclub-mates")
    const start = url.searchParams.has('start') ? Number(url.searchParams.get('start')) : undefined;
    const end = url.searchParams.has('end') ? Number(url.searchParams.get('end')) : undefined;
    const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined;
    const cursor = url.searchParams.has('cursor') ? Number(url.searchParams.get('cursor')) : undefined;

    // 숫자 파라미터 검증
    if ((start !== undefined && !Number.isFinite(start)) ||
        (end !== undefined && !Number.isFinite(end)) ||
        (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) ||
        (cursor !== undefined && !Number.isFinite(cursor))) {
      return jsonWithCors({ error: 'Invalid numeric query parameter' }, 400);
    }

    // 보유 NFT 전부 로드 (주소 체크섬화)
    const checksum = getAddress(walletAddress);
    const metadataMap = await fetchHeldNftData(env, checksum);

    // 객체 -> 배열
    let items: NftData[] = Object.values(metadataMap) as NftData[];

    // 1) 컬렉션 필터
    if (collection) {
      items = items.filter(it => it.collection === collection);
    }

    // 2) 토큰 ID 범위 필터
    if (start !== undefined) items = items.filter(it => Number(it.id) >= start);
    if (end !== undefined)   items = items.filter(it => Number(it.id) <= end);

    // 3) 정렬 (id 오름차순)
    items.sort((a, b) => Number(a.id) - Number(b.id));

    // 4) 커서 기반 페이지네이션 (cursor는 "마지막으로 본 token_id")
    if (cursor !== undefined) {
      items = items.filter(it => Number(it.id) > cursor);
    }

    // 5) limit 적용 및 nextCursor 계산
    let nextCursor: number | undefined;
    if (limit !== undefined && items.length > limit) {
      const sliced = items.slice(0, limit);
      const last = sliced[sliced.length - 1];
      nextCursor = Number(last.id);
      // 클라이언트는 배열/혹은 {items, nextCursor} 둘 다 처리하므로 객체로 응답
      return jsonWithCors({ items: sliced, nextCursor }, 200);
    }

    // limit이 없거나 남은게 limit 이하라면 배열로 반환 (클라가 둘 다 처리함)
    return jsonWithCors(items, 200);
  } catch (err) {
    console.error(err);
    return jsonWithCors(
      { error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}
