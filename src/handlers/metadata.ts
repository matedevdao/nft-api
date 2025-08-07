import { jsonWithCors } from '@gaiaprotocol/worker-common';
import { metadataTransformer } from '../utils/metadata-transformer';
import { getBulkNftData } from '../services/nft';

export async function handleMetadataRequest(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');

    const collection = segments[2];
    const tokenIdStr = segments[3];

    if (!collection || !tokenIdStr) {
      return jsonWithCors({ error: 'Invalid request' }, 400);
    }

    const tokenId = parseInt(tokenIdStr);
    if (isNaN(tokenId) || tokenId < 0) {
      return jsonWithCors({ error: 'Invalid token ID' }, 400);
    }

    const data = await getBulkNftData(env, [{ collection, tokenId }]);

    const key = `${collection}:${tokenId}`;
    const nftData = data[key];

    if (!nftData) {
      return jsonWithCors({ error: 'Metadata not found' }, 404);
    }

    const metadata = metadataTransformer.toOpenSeaFormat(nftData);

    return jsonWithCors(metadata);
  } catch (err) {
    console.error(err);
    return jsonWithCors(
      { error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}
