import { createPublicClient, http } from 'viem';
import { kaia } from 'viem/chains';

const kaiaClient = createPublicClient({ chain: kaia, transport: http() });

export { kaiaClient };
