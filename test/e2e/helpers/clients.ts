import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

// Anvil's first default account. Matches seed-local.sh so debugging behavior
// stays parallel across the shell-seeded and JS-seeded flows.
export const DEPLOYER_PRIVATE_KEY: Hex =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

export function makeClients(rpcUrl: string) {
  const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: foundry, transport });
  const walletClient = createWalletClient({
    chain: foundry,
    transport,
    account,
  });
  return { publicClient, walletClient, deployer: account.address };
}

// Derived from makeClients's inferred return so the chain-narrowed viem client
// types flow through. Annotating with the wide `PublicClient` / `WalletClient`
// types trips a "two different types with this name exist" check in TS server.
export type Clients = ReturnType<typeof makeClients>;
