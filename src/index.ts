import { preflightResponse } from "@gaiaprotocol/worker-common";
import { WorkerEntrypoint } from "cloudflare:workers";
import { handleHeldNftsRequest } from "./handlers/held-nfts";
import { handleMetadataRequest } from "./handlers/metadata";
import { handleNftDataRequest } from "./handlers/nft";
import { handleNftDataByIds } from "./handlers/nft-by-ids";
import { fetchNftDataByIds } from "./services/nft";

export default class NftApiWorker extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') return preflightResponse();

    const url = new URL(request.url);
    if (url.pathname.startsWith('/metadata/')) return handleMetadataRequest(request, this.env);
    if (url.pathname.startsWith('/nft/')) return handleNftDataRequest(request, this.env);
    if (url.pathname.endsWith('/nfts')) return handleHeldNftsRequest(request, this.env);
    if (url.pathname === '/nfts/by-ids') return handleNftDataByIds(request, this.env);

    return new Response('Not Found', { status: 404 });
  };

  fetchNftDataByIds(ids: string[]): Promise<Record<string, any>> {
    return fetchNftDataByIds(this.env, ids)
  }
}