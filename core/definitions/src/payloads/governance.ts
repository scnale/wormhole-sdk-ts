import {
  platformToChains,
  Module,
  FixedConversion,
  column,
  constMap,
  ShallowMapping,
  Layout,
  ConcatStringLiterals,
  RoArray,
} from "@wormhole-foundation/sdk-base";

import {
  chainItem,
  universalAddressItem,
  guardianSetItem,
} from "../layout-items";
import { registerPayloadType } from "../vaa";

//One thing that's not captures by the payload itself is the fact that governance VAAs should
//  always have Solana as the emitter chain and address bytes32(4) as the emitter address.
//These values are actually magic values though, because governance VAAs are actually created and
//  signed off-chain and are not the result of on-chain observations.
//Additionally their sequence numbers are also chosen at random (and hence tend to be very large).
const actionTuples = [
  [
    "UpgradeContract",
    {
      allowNull: false,
      layout: [{ name: "newContract", ...universalAddressItem }],
    },
  ],
  [
    "RegisterChain",
    {
      allowNull: true,
      layout: [
        { name: "foreignChain", ...chainItem() },
        { name: "foreignAddress", ...universalAddressItem },
      ],
    },
  ],
  //a word on the chainId for RecoverChainId:
  //The implementation of the contracts accept an arbitrary number when recovering chain ids however
  //  I don't think you ever want to set the wormhole chain id of a contract (even on a fork) to 0
  //  since this would mean that afterwards all the checks that use `vaa.chainId == this.chainId` in
  //  the contract would suddenly accept "broadcast VAAs" which is almost certainly not what's
  //  intended.
  [
    "RecoverChainId",
    {
      //TODO should we define governance actions that are specific to a platform here?
      //     (reason against: we might want to deserialize types that are specific to the platform)
      allowNull: false,
      layout: [
        { name: "evmChainId", binary: "uint", size: 32 },
        {
          name: "newChainId",
          ...chainItem({ allowedChains: platformToChains("Evm") }),
        },
      ],
    },
  ],
  [
    "GuardianSetUpgrade",
    {
      allowNull: true,
      layout: [
        { name: "guardianSet", ...guardianSetItem },
        {
          name: "guardians",
          binary: "array",
          lengthSize: 1,
          layout: [
            { name: "address", binary: "bytes", size: 20 }, //TODO better (custom) type?
          ],
        },
      ],
    },
  ],
  [
    "SetMessageFee",
    {
      allowNull: false,
      layout: [{ name: "messageFee", binary: "uint", size: 32 }],
    },
  ],
  [
    "TransferFees",
    {
      allowNull: true,
      layout: [
        { name: "amount", binary: "uint", size: 32 },
        { name: "recipient", ...universalAddressItem },
      ],
    },
  ],
  [
    "UpdateDefaultProvider",
    {
      allowNull: false,
      layout: [{ name: "defaultProvider", ...universalAddressItem }],
    },
  ],
] as const satisfies RoArray<
  readonly [string, { allowNull: boolean; layout: Layout }]
>;

const actions = column(actionTuples, 0);
type Action = (typeof actions)[number];

const actionMapping = constMap(actionTuples);

const sdkModuleNameAndGovernanceVaaModuleEntries = [
  ["CoreBridge", "Core"],
  ["TokenBridge", "TokenBridge"],
  ["NftBridge", "NFTBridge"],
  ["Relayer", "WormholeRelayer"],
  // TODO: wat is this
  ["CCTP", "TokenBridge"],
] as const satisfies RoArray<readonly [Module, string]>;

const sdkModuleNameToGovernanceVaaModuleMapping = constMap(
  sdkModuleNameAndGovernanceVaaModuleEntries
);

const moduleConversion = <M extends Module>(module: M) =>
  ({
    to: module,
    from: ((): Uint8Array => {
      const moduleBytesSize = 32;
      const bytes = new Uint8Array(moduleBytesSize);
      const vaaModule = sdkModuleNameToGovernanceVaaModuleMapping(module);
      for (let i = 1; i <= vaaModule.length; ++i)
        bytes[moduleBytesSize - i] = vaaModule.charCodeAt(vaaModule.length - i);

      return bytes;
    })(),
  } as const satisfies FixedConversion<Uint8Array, M>);

const actionConversion = <A extends Action, N extends number>(
  action: A,
  num: N
) =>
  ({
    to: action,
    from: num,
  } as const satisfies FixedConversion<N, A>);

const headerLayout = <M extends Module, A extends Action, N extends number>(
  module: M,
  action: A,
  num: N
) =>
  [
    {
      name: "module",
      binary: "bytes",
      custom: moduleConversion(module),
    },
    {
      name: "action",
      binary: "uint",
      size: 1,
      custom: actionConversion(action, num),
    },
    { name: "chain", ...chainItem(actionMapping(action)) },
  ] as const satisfies Layout;

const governancePayload = <
  M extends Module,
  A extends Action,
  N extends number
>(
  module: M,
  action: A,
  num: N
) =>
  [
    (module + action) as ConcatStringLiterals<[M, A]>,
    [...headerLayout(module, action, num), ...actionMapping(action).layout],
  ] as const;

const governancePayloads = [
  //see https://github.com/wormhole-foundation/wormhole/blob/96c6cc2b325addc2125bb438b228921a4be6b7f3/ethereum/contracts/GovernanceStructs.sol#L64
  governancePayload("CoreBridge", "UpgradeContract", 1),
  governancePayload("CoreBridge", "GuardianSetUpgrade", 2),
  governancePayload("CoreBridge", "SetMessageFee", 3),
  governancePayload("CoreBridge", "TransferFees", 4),
  governancePayload("CoreBridge", "RecoverChainId", 5),
  //see https://github.com/wormhole-foundation/wormhole/blob/96c6cc2b325addc2125bb438b228921a4be6b7f3/ethereum/contracts/bridge/BridgeGovernance.sol#L115
  governancePayload("TokenBridge", "RegisterChain", 1),
  governancePayload("TokenBridge", "UpgradeContract", 2),
  governancePayload("TokenBridge", "RecoverChainId", 3),
  //see https://github.com/wormhole-foundation/wormhole/blob/96c6cc2b325addc2125bb438b228921a4be6b7f3/ethereum/contracts/nft/NFTBridgeGovernance.sol#L112
  governancePayload("NftBridge", "RegisterChain", 1),
  governancePayload("NftBridge", "UpgradeContract", 2),
  governancePayload("NftBridge", "RecoverChainId", 3),
  //see https://github.com/wormhole-foundation/wormhole/blob/96c6cc2b325addc2125bb438b228921a4be6b7f3/ethereum/contracts/relayer/wormholeRelayer/WormholeRelayerGovernance.sol#L60
  governancePayload("Relayer", "RegisterChain", 1),
  governancePayload("Relayer", "UpgradeContract", 2),
  governancePayload("Relayer", "UpdateDefaultProvider", 3),
] as const satisfies RoArray<readonly [string, Layout]>;

type GovernancePayloads = ShallowMapping<typeof governancePayloads>;

//side-effects! finally, register with factory:
declare global {
  namespace Wormhole {
    interface PayloadLiteralToDescriptionMapping extends GovernancePayloads {}
  }
}

for (const [payloadLiteral, layout] of governancePayloads)
  registerPayloadType(payloadLiteral, layout);