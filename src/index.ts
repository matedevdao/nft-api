import { preflightResponse } from "@gaiaprotocol/worker-common";
import { handleHeldNftsRequest } from "./handlers/held-nfts";
import { handleMetadataRequest } from "./handlers/metadata";
import { handleNftDataRequest } from "./handlers/nft";
import { handleNftDataByIds } from "./handlers/nft-by-ids";

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (request.method === 'OPTIONS') return preflightResponse();

    const url = new URL(request.url);
    if (url.pathname.startsWith('/metadata/')) return handleMetadataRequest(request, env);
    if (url.pathname.startsWith('/nft/')) return handleNftDataRequest(request, env);
    if (url.pathname.endsWith('/nfts')) return handleHeldNftsRequest(request, env);
    if (url.pathname === '/nfts/by-ids') return handleNftDataByIds(request, env);

    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
