import {
  encodeAbiParameters,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Subscriber identity bundle: the human-readable id, the on-chain address, the
// private key (needed for permit + cancel signing) and the precomputed bytes32
// hash. Build with `subscriber(id, pk)` so tests don't have to keep re-deriving.
export interface Subscriber {
  id: string;
  address: Address;
  pk: Hex;
  hash: Hex;
}

// keccak256(abi.encode(string, address)) — matches the contract's subscriber
// hash format (post-#120). Pure, no client.
export function subscriberHash(id: string, address: Address): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "string" }, { type: "address" }], [id, address]),
  );
}

export function subscriber(id: string, pk: Hex): Subscriber {
  const account = privateKeyToAccount(pk);
  return {
    id,
    address: account.address,
    pk,
    hash: subscriberHash(id, account.address),
  };
}
