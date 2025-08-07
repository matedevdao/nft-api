import { kaiaClient } from '../kaia';

const PARSING_NFT_DATA_CONTRACT_ADDRESS =
  '0x8A98A038dcA75091225EE0a1A11fC20Aa23832A0';

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

async function getBalances(address: `0x${string}`, contracts: `0x${string}`[]): Promise<bigint[]> {
  return await kaiaClient.readContract({
    address: PARSING_NFT_DATA_CONTRACT_ADDRESS,
    abi: [{
      "inputs": [
        {
          "internalType": "address",
          "name": "holder",
          "type": "address"
        },
        {
          "internalType": "address[]",
          "name": "",
          "type": "address[]"
        }
      ],
      "name": "getERC721BalanceList_OneHolder",
      "outputs": [
        {
          "internalType": "uint256[]",
          "name": "balances",
          "type": "uint256[]"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }],
    functionName: 'getERC721BalanceList_OneHolder',
    args: [address as `0x${string}`, contracts],
  }) as bigint[];
}

async function getHolderCounts(
  env: Env,
  collections: { collection: string, address: string }[],
): Promise<Record<string, number>> {
  const holderCounts: Record<string, number> = {};

  for (const { collection, address } of collections) {
    const row = await env.DB.prepare(`
      SELECT COUNT(DISTINCT holder) as count
      FROM nfts
      WHERE nft_address = ?
    `).bind(address).first<{ count: number }>();

    holderCounts[collection] = row?.count ?? 0;
  }

  return holderCounts;
}

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
};

async function fetchStaticMetadata(collection: string, tokenId: number) {
  const res = await fetch(`https://matedevdao.github.io/static-kaia-nft-assets/${collection}/metadata/${tokenId}.json`);
  return await res.json<any>();
}

async function rowsToData(rows: NftRow[]) {
  const data: { [key: string]: NftData } = {};

  const promises: Promise<void>[] = [];

  for (const row of rows) {
    const collection = Object.keys(NFT_ADDRESSES).find((key) =>
      NFT_ADDRESSES[key] === row.nft_address
    );
    if (!collection) throw new Error(`Unknown collection address: ${row.nft_address}`);

    if (STATIC_METADATA_COLLECTIONS.includes(collection)) {
      /*promises.push((async () => {
        const metadata = await fetchStaticMetadata(collection, row.token_id);
        if (!metadata) throw new Error(`Static metadata not found for ${collection} #${row.token_id}`);
        data[`${collection}:${row.token_id}`] = {
          ...metadata,
          collection,
          id: row.token_id,
          holder: row.holder,
        };
      })());*/

      // 성능 향상을 위해 fetch 하지 않고 기본값으로 초기화
      data[`${collection}:${row.token_id}`] = {
        collection,
        id: row.token_id,
        name: `#${row.token_id}`,
        image: `https://matedevdao.github.io/static-kaia-nft-assets/${collection}/images/${row.token_id}.png`,
        holder: row.holder,
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
      };
    }
  }

  await Promise.all(promises);

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

    return await rowsToData(results);
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

  return await rowsToData(results);
}

export { fetchHeldNftData, getBalances, getBulkNftData, getHolderCounts };

