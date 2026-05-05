import {
  createPublicClient as viemCreatePublicClient,
  createWalletClient as viemCreateWalletClient,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import type { Chain, PublicClient, WalletClient } from 'viem';

export interface BlockchainConfig {
  rpcUrl: string;
  contractAddress: `0x${string}`;
  chainId: number;
  confirmationDepth: number;
}

function resolveChain(chainId: number): Chain {
  const chains: Record<number, Chain> = {
    8453: base,
    84532: baseSepolia,
  };
  const chain = chains[chainId];
  if (!chain) {
    throw new Error(
      `Unsupported chainId: ${chainId}. Add it to blockchain.config.ts`,
    );
  }
  return chain;
}

export function createBlockchainConfig(): BlockchainConfig {
  const rpcUrl = process.env.QUICKNODE_RPC_URL;
  if (!rpcUrl)
    throw new Error('QUICKNODE_RPC_URL environment variable is not set');

  const contractAddress = process.env.ANCHOR_CONTRACT_ADDRESS as `0x${string}`;
  if (!contractAddress)
    throw new Error('ANCHOR_CONTRACT_ADDRESS environment variable is not set');

  const chainId = parseInt(process.env.ANCHOR_CHAIN_ID ?? '84532', 10);
  const confirmationDepth = parseInt(
    process.env.ANCHOR_CONFIRMATION_DEPTH ?? '3',
    10,
  );

  return { rpcUrl, contractAddress, chainId, confirmationDepth };
}

export function createBlockchainPublicClient(
  config: BlockchainConfig,
): PublicClient {
  return viemCreatePublicClient({
    chain: resolveChain(config.chainId),
    transport: http(config.rpcUrl),
  });
}

export function createBlockchainWalletClient(
  config: BlockchainConfig,
): WalletClient {
  const privateKey = process.env.SIGNING_PRIVATE_KEY;
  if (!privateKey)
    throw new Error('SIGNING_PRIVATE_KEY environment variable is not set');

  const account = privateKeyToAccount(`0x${privateKey}`);

  return viemCreateWalletClient({
    account,
    chain: resolveChain(config.chainId),
    transport: http(config.rpcUrl),
  });
}
