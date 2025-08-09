import DogeSoundClubBiasedMatesMetadata from './static-metadata/dogesoundclub-biased-mates-metadata.json' assert { type: 'json' };
import DogeSoundClubEMatesMetadata from './static-metadata/dogesoundclub-e-mates-metadata.json' assert { type: 'json' };
import DogeSoundClubMatesMetadata from './static-metadata/dogesoundclub-mates-metadata.json' assert { type: 'json' };
import KingCrownDAOPixelKongzMetadata from './static-metadata/kingcrowndao-pixel-kongz-metadata.json' assert { type: 'json' };

const NFT_ADDRESSES: Record<string, `0x${string}`> = {
  'dogesoundclub-mates': '0xE47E90C58F8336A2f24Bcd9bCB530e2e02E1E8ae',
  'dogesoundclub-e-mates': '0x2B303fd0082E4B51e5A6C602F45545204bbbB4DC',
  'dogesoundclub-biased-mates': '0xDeDd727ab86bce5D416F9163B2448860BbDE86d4',
  'sigor-sparrows': '0x7340a44AbD05280591377345d21792Cdc916A388',
  'sigor-housedeeds': '0x455Ee7dD1fc5722A7882aD6B7B8c075655B8005B',
  'kingcrowndao-kongz': '0xF967431fb8F5B4767567854dE5448D2EdC21a482',
  'kingcrowndao-pixel-kongz': '0x81b5C41Bac33ea696D9684D9aFdB6cd9f6Ee5CFF',
  'babyping': '0x595b299Db9d83279d20aC37A85D36489987d7660',
};

const STATIC_METADATA_COLLECTIONS = [
  'dogesoundclub-mates',
  'dogesoundclub-e-mates',
  'dogesoundclub-biased-mates',
  'kingcrowndao-pixel-kongz',
];

type NftRow = {
  nft_address: string;
  token_id: number;
  holder: string;
  style?: string;
  parts?: string;
  dialogue?: string;
  image?: string;
};

type NftData = {
  collection: string;
  id: number;
  name: string;
  description?: string;
  image: string;
  external_url?: string;
  animation_url?: string;
  traits?: { [traitName: string]: string | number };
  parts?: { [partName: string]: string | number };
  holder: string;
  contract_addr: string;
};

function getStaticMetadata(collection: string, tokenId: number) {
  let metadatas: any;
  if (collection === 'dogesoundclub-biased-mates') {
    metadatas = DogeSoundClubBiasedMatesMetadata;
  } else if (collection === 'dogesoundclub-e-mates') {
    metadatas = DogeSoundClubEMatesMetadata;
  } else if (collection === 'dogesoundclub-mates') {
    metadatas = DogeSoundClubMatesMetadata;
  } else if (collection === 'kingcrowndao-pixel-kongz') {
    metadatas = KingCrownDAOPixelKongzMetadata;
  }
  return metadatas?.find((item: any) => item.id === tokenId);
}

function rowsToData(rows: NftRow[]) {
  const data: { [key: string]: NftData } = {};

  for (const row of rows) {
    const collection = Object.keys(NFT_ADDRESSES).find((key) =>
      NFT_ADDRESSES[key] === row.nft_address
    );
    if (!collection) throw new Error(`Unknown collection address: ${row.nft_address}`);

    if (STATIC_METADATA_COLLECTIONS.includes(collection)) {
      const metadata = getStaticMetadata(collection, row.token_id);
      if (!metadata) throw new Error(`Static metadata not found for ${collection} #${row.token_id}`);

      data[`${collection}:${row.token_id}`] = {
        ...metadata,
        collection,
        id: row.token_id,
        holder: row.holder,
        contract_addr: row.nft_address,
      };
    }

    else {
      let name;
      let image;
      let description;
      let external_url;
      let traits: { [traitName: string]: string } | undefined;

      let parts: { [partName: string]: string } = {};
      if (row.parts) parts = JSON.parse(row.parts);

      if (collection === 'sigor-sparrows') {
        name = 'Sigor Sparrow #' + row.token_id;
        image =
          `https://pub-b5f5f68564ba4ce693328fe84e1a6c57.r2.dev/sigor-sparrows/${row.image}`;
        traits = {};
        if (row.style) traits['Style'] = row.style;
        if (row.dialogue) traits['Dialogue'] = row.dialogue;
        external_url = 'https://sigor.com/';
      } else if (collection === 'sigor-housedeeds') {
        name = 'Sigor House Deed #' + row.token_id;
        image =
          'https://matedevdao.github.io/static-kaia-nft-assets/sigor-housedeed-legacy.avif';
        external_url = 'https://sigor.com/';
      } else if (collection === 'kingcrowndao-kongz') {
        name = 'KCD Kong #' + row.token_id;
        image =
          `https://pub-b5f5f68564ba4ce693328fe84e1a6c57.r2.dev/kingcrowndao-kongz/${row.image}`;
        external_url = 'https://kingcrowndao.github.io/';
      } else if (collection === 'babyping') {
        name = 'BabyPing #' + row.token_id;
        image =
          `https://pub-b5f5f68564ba4ce693328fe84e1a6c57.r2.dev/babyping/${row.image}`;
      }

      data[`${collection}:${row.token_id}`] = {
        collection,
        id: row.token_id,
        name: name ? name : `#${row.token_id}`,
        description: description ? description : `#${row.token_id}`,
        image: image ? image : '',
        external_url: external_url ? external_url : '',
        traits,
        parts,
        holder: row.holder,
        contract_addr: row.nft_address,
      };
    }
  }

  return data;
}

async function getBulkNftData(env: Env, nfts: { collection: string; tokenId: number }[]) {
  const pairs: { address: string; tokenId: number }[] = [];
  for (const { collection, tokenId } of nfts) {
    const address = NFT_ADDRESSES[collection];
    if (!address) throw new Error(`Unknown collection: ${collection}`);
    pairs.push({ address, tokenId });
  }

  if (pairs.length > 0) {
    const placeholders = pairs.map(() => '(?, ?)').join(', ');
    const sql =
      `SELECT nft_address, token_id, holder, style, parts, dialogue, image \n` +
      `FROM nfts \n` +
      `WHERE (nft_address, token_id) IN (${placeholders})`;

    const bindValues: (string | number)[] = [];
    for (const { address, tokenId } of pairs) {
      bindValues.push(address, tokenId);
    }

    const stmt = env.DB.prepare(sql).bind(...bindValues);
    const { results } = await stmt.all<NftRow>();

    return rowsToData(results);
  }
  return {};
}


async function fetchHeldNftData(env: Env, address: string) {
  const sql =
    `SELECT nft_address, token_id, holder, style, parts, dialogue, image \n` +
    `FROM nfts \n` +
    `WHERE holder = ?`;

  const stmt = env.DB.prepare(sql).bind(address);
  const { results } = await stmt.all<NftRow>();

  return rowsToData(results);
}

type Pair = { key: string; collection: string; tokenId: number; nftAddress: `0x${string}` };

function parseIdsOrThrow(rawIds: string[]): Pair[] {
  const pairs: Pair[] = [];
  const seen = new Set<string>();

  for (const raw of rawIds) {
    const trimmed = raw.trim();
    const hasCollection = trimmed.includes(':');

    if (!hasCollection) {
      throw new Error(`Collection prefix is required (expected "collection:tokenId"): ${trimmed}`);
    }

    const collection = trimmed.split(':', 1)[0];
    const tokenPart = trimmed.slice(collection.length + 1);

    if (!NFT_ADDRESSES[collection]) {
      throw new Error(`Unknown collection: ${collection}`);
    }
    if (!/^\d+$/.test(tokenPart)) {
      throw new Error(`Invalid token id: ${tokenPart}`);
    }

    const tokenId = Number(tokenPart);
    const nftAddress = NFT_ADDRESSES[collection];

    const key = `${collection}:${tokenId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    pairs.push({ key, collection, tokenId, nftAddress });
  }

  return pairs;
}

async function fetchNftDataByIds(env: Env, ids: string[]) {
  const pairs = parseIdsOrThrow(ids);
  if (pairs.length === 0) return {};

  // WHERE (nft_address = ? AND token_id = ?) OR (...)
  const conditions = pairs.map(() => '(nft_address = ? AND token_id = ?)').join(' OR ');
  const binds: (string | number)[] = [];
  for (const p of pairs) {
    binds.push(p.nftAddress, p.tokenId);
  }

  // ✅ rowsToData가 기대하는 컬럼으로 통일
  const sql =
    `SELECT nft_address, token_id, holder, style, parts, dialogue, image \n` +
    `FROM nfts \n` +
    `WHERE ${conditions}`;

  const stmt = env.DB.prepare(sql).bind(...binds);
  const { results } = await stmt.all<NftRow>();

  // rowsToData는 전체 컬렉션의 키를 만들 수 있으므로,
  // 요청된 key만 필터링해서 반환
  const allMap = rowsToData(results ?? []);
  const requestedKeys = new Set(pairs.map(p => p.key));

  const filtered: Record<string, any> = {};
  for (const key of Object.keys(allMap)) {
    if (requestedKeys.has(key)) filtered[key] = allMap[key];
  }
  // 요청했지만 DB에 없었던 id는 명시적으로 null을 넣어줌
  for (const key of requestedKeys) {
    if (!(key in filtered)) filtered[key] = null;
  }

  return filtered;
}

export { fetchHeldNftData, fetchNftDataByIds, getBulkNftData };

