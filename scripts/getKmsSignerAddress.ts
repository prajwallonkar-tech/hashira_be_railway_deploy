import 'reflect-metadata';
import { createKmsClient } from '../src/config/kms.config';
import { BlockchainSigningService } from '../src/services/BlockchainSigningService';

async function main(): Promise<void> {
  const kmsClient = createKmsClient();
  const signingService = new BlockchainSigningService(kmsClient);

  console.log('\nDeriving EVM signer address from KMS public key...');
  const address = await signingService.getSignerAddress();

  console.log('\n=== KMS SIGNER ADDRESS ===');
  console.log(`EVM Address:  ${address}`);
  console.log(`KMS Key ID:   ${process.env.KMS_SIGNING_KEY_ID}`);
  console.log(`AWS Region:   ${process.env.AWS_REGION}`);
  console.log('\nNext steps:');
  console.log(
    '  1. Fund this address with ETH on Base Sepolia (testnet) for gas fees',
  );
  console.log(
    '  2. Grant ANCHOR_ROLE on the Hashira smart contract to this address',
  );
  console.log(
    '     → Via Gnosis Safe multisig transaction on the target network',
  );
  console.log(
    '  3. Set ANCHOR_RECEIPT_ADDRESS env var to the deployed contract address\n',
  );
}

main().catch((err: unknown) => {
  console.error('Failed to derive signer address:', err);
  process.exit(1);
});
