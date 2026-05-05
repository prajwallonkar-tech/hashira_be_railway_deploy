import HashiraAnchorRegistryAbi from '../abi/HashiraAnchorRegistry.json';
import type { BlockchainConfig } from '../config/blockchain.config';
import {
  updateEventToAnchored,
  updateEventToAnchorFailed,
} from '../repositories/event.repository';
import { EventStatus } from '../types/enums';
import { withExponentialBackoff } from '../utils/withExponentialBackoff';
import { logger } from '../logger';

interface IWalletClient {
  writeContract(args: {
    address: `0x${string}`;
    abi: typeof HashiraAnchorRegistryAbi;
    functionName: 'anchorHash';
    args: readonly [`0x${string}`, `0x${string}`];
  }): Promise<`0x${string}`>;
}

interface IPublicClient {
  waitForTransactionReceipt(args: {
    hash: `0x${string}`;
    confirmations?: number;
  }): Promise<{ blockNumber: bigint }>;
}

export interface AnchorInput {
  event_id: string;
  org_id: string;
  canonical_hash: string;
}

export class BlockchainAnchoringService {
  constructor(
    private readonly walletClient: IWalletClient,
    private readonly publicClient: IPublicClient,
    private readonly config: BlockchainConfig,
  ) {}

  async anchorEvent(input: AnchorInput): Promise<void> {
    const canonicalHashBytes32 = this.encodeCanonicalHash(input.canonical_hash);
    const eventIdBytes32 = this.encodeEventId(input.event_id);
    const startMs = Date.now();

    logger.info(
      {
        event: 'anchor.submit',
        event_id: input.event_id,
        org_id: input.org_id,
      },
      'Submitting anchor transaction',
    );

    try {
      const txHash = await withExponentialBackoff(
        () =>
          this.walletClient.writeContract({
            address: this.config.contractAddress,
            abi: HashiraAnchorRegistryAbi,
            functionName: 'anchorHash',
            args: [canonicalHashBytes32, eventIdBytes32],
          }),
        {
          onRetry: (attempt, error) => {
            logger.warn(
              {
                event: 'anchor.retry',
                event_id: input.event_id,
                org_id: input.org_id,
                attempt,
                error: error instanceof Error ? error.message : String(error),
              },
              'Retrying anchor transaction',
            );
          },
        },
      );

      const receipt = await withExponentialBackoff(() =>
        this.publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations: this.config.confirmationDepth,
        }),
      );

      await updateEventToAnchored({
        event_id: input.event_id,
        org_id: input.org_id,
        tx_hash: txHash,
        block_number: receipt.blockNumber,
        chain_id: this.config.chainId,
        anchored_at: new Date(),
        status: EventStatus.ANCHORED,
      });

      logger.info(
        {
          event: 'anchor.confirmed',
          event_id: input.event_id,
          org_id: input.org_id,
          tx_hash: txHash,
          block_number: receipt.blockNumber.toString(),
          chain_id: this.config.chainId,
          duration_ms: Date.now() - startMs,
        },
        'Anchor confirmed on-chain',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error(
        {
          event: 'anchor.failed',
          event_id: input.event_id,
          org_id: input.org_id,
          error: message,
        },
        'Anchor transaction failed',
      );

      await updateEventToAnchorFailed({
        event_id: input.event_id,
        org_id: input.org_id,
        anchor_error: message,
      });
      throw error;
    }
  }

  encodeCanonicalHash(hash: string): `0x${string}` {
    return `0x${hash}`;
  }

  encodeEventId(eventId: string): `0x${string}` {
    const hex = eventId.replace(/-/g, '');
    return `0x${hex.padStart(64, '0')}`;
  }
}
