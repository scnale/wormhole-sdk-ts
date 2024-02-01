import {
  Chain,
  ChainContext,
  CompletedTransferReceipt,
  Network,
  Signer,
  SourceInitiatedTransferReceipt,
  TokenId,
  TransactionId,
  TransferState,
  WormholeMessageId,
  encoding,
  nativeTokenId,
  amount,
} from "../..";
import { ManualRoute, StaticRouteMethods } from "../route";
import {
  Quote,
  Receipt,
  TransferParams,
  ValidatedTransferParams,
  ValidationResult,
} from "../types";

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Op = {};
type R = Receipt;
type Q = Quote;

export class ManualMockRoute<N extends Network>
  extends ManualRoute<N, Op, R, Q>
  implements StaticRouteMethods<typeof ManualMockRoute>
{
  static meta = {
    name: "ManualFauxBridge",
  };

  static supportedNetworks(): Network[] {
    return ["Mainnet", "Testnet"];
  }
  static supportedChains(network: Network): Chain[] {
    return ["Solana", "Ethereum"];
  }
  static async supportedSourceTokens(fromChain: ChainContext<Network>): Promise<TokenId[]> {
    await delay(250);
    return [nativeTokenId(fromChain.chain)];
  }
  static async supportedDestinationTokens<N extends Network>(
    sourceToken: TokenId,
    fromChain: ChainContext<N>,
    toChain: ChainContext<N>,
  ): Promise<TokenId[]> {
    await delay(250);
    return [nativeTokenId(toChain.chain)];
  }

  static isProtocolSupported<N extends Network>(chain: ChainContext<N>): boolean {
    return true;
  }

  async validate(params: TransferParams<Op>): Promise<ValidationResult<Op>> {
    await delay(250);
    return {
      valid: true,
      params: { ...params, options: this.getDefaultOptions() },
    };
  }

  async quote(params: ValidatedTransferParams<Op>): Promise<Q> {
    await delay(1000);
    const fakeQuote: Q = {
      sourceToken: {
        token: this.request.source.id,
        amount: amount.parse(params.amount, this.request.destination.decimals),
      },
      destinationToken: {
        token: this.request.destination!.id,
        amount: amount.parse(params.amount, this.request.destination.decimals),
      },
      relayFee: {
        token: this.request.source.id,
        amount: amount.parse("0.01", this.request.source.decimals),
      },
    };
    return fakeQuote;
  }

  async initiate(sender: Signer, params: ValidatedTransferParams<Op>): Promise<R> {
    await delay(1000);

    const fakeTxId =
      this.request.from.chain === "Solana"
        ? encoding.b58.encode(new Uint8Array(64))
        : encoding.hex.encode(new Uint8Array(32));

    const fakeReceipt: SourceInitiatedTransferReceipt = {
      from: this.request.from.chain,
      to: this.request.to.chain,
      state: TransferState.SourceInitiated,
      originTxs: [{ chain: sender.chain(), txid: fakeTxId }],
    };

    return fakeReceipt;
  }

  async *track(receipt: R, timeout?: number | undefined): AsyncGenerator<R> {
    await delay(1000);
    const fakeReceipt = {
      ...(receipt as SourceInitiatedTransferReceipt),
      state: TransferState.DestinationInitiated,
      attestation: {
        id: {} as WormholeMessageId,
      },
    } satisfies CompletedTransferReceipt<
      unknown,
      typeof this.request.from.chain,
      typeof this.request.to.chain
    >;
    yield fakeReceipt;
  }

  async complete(sender: Signer, receipt: R): Promise<TransactionId[]> {
    return [];
  }

  getDefaultOptions() {
    return {};
  }
}
