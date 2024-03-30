/// <reference path="../../platforms/cosmwasm/src/index.ts" />
import type { Network, PlatformDefinition } from "./index.js";
/** Platform and protocol definitions for Cosmwasm */
const cosmwasm = async <N extends Network>(): Promise<PlatformDefinition<N, "Cosmwasm">> => {
  const _cosmwasm = await import("@wormhole-foundation/sdk-cosmwasm");
  return {
    Address: _cosmwasm.CosmwasmAddress,
    ChainContext: _cosmwasm.CosmwasmChain,
    Platform: _cosmwasm.CosmwasmPlatform,
    Signer: _cosmwasm.CosmwasmSigner,
    getSigner: _cosmwasm.getCosmwasmSigner,
    protocolLoaders: {
      core: () => import("@wormhole-foundation/sdk-cosmwasm-core"),
      tokenbridge: () => import("@wormhole-foundation/sdk-cosmwasm-tokenbridge"),
      ibc: () => import("@wormhole-foundation/sdk-cosmwasm-ibc"),
    },
  };
};
export default cosmwasm;
