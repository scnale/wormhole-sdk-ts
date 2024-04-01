import { Wormhole, canonicalAddress, routes, wormhole } from "@wormhole-foundation/sdk";

import evm from "@wormhole-foundation/sdk/evm";
import solana from "@wormhole-foundation/sdk/solana";
import { getSigner } from "./helpers/index.js";

(async function () {
  // Setup
  const wh = await wormhole("Testnet", [evm, solana]);

  // Get chain contexts
  const sendChain = wh.getChain("Avalanche");
  const destChain = wh.getChain("Solana");

  const sender = await getSigner(sendChain);
  const receiver = await getSigner(destChain);

  // create new resolver, passing the set of routes to consider
  const resolver = wh.resolver([
    routes.TokenBridgeRoute, // manual token bridge
    routes.AutomaticTokenBridgeRoute, // automatic token bridge
    routes.CCTPRoute, // manual CCTP
    routes.AutomaticCCTPRoute, // automatic CCTP
    routes.AutomaticPorticoRoute, // Native eth transfers
  ]);

  // Send gas token for this example
  const sendToken = Wormhole.tokenId(sendChain.chain, "native");

  // given the send token, what can we possibly get on the destination chain?
  const destTokens = await resolver.supportedDestinationTokens(sendToken, sendChain, destChain);
  console.log(
    "For the given source token and routes configured, the following tokens may be receivable: ",
    destTokens.map((t) => canonicalAddress(t)),
  );
  //grab the first one for the example
  const destinationToken = destTokens[0]!;

  // creating a transfer request fetches token details
  // since all routes will need to know about the tokens
  const tr = await routes.RouteTransferRequest.create(wh, {
    from: sender.address,
    to: receiver.address,
    source: sendToken,
    destination: destinationToken,
  });

  // resolve the transfer request to a set of routes that can perform it
  // and select one from the list
  const bestRoute = (await resolver.findRoutes(tr))[0]!;
  console.log("The best route offers the following default options", bestRoute.getDefaultOptions());

  // Create the transfer params for this request
  const transferParams = { amount: "0.001", options: { nativeGas: 0 } };

  // Validate transfer params, pass validated params to the next step
  const validated = await bestRoute.validate(transferParams);
  if (!validated.valid) throw validated.error;
  console.log("Validated parameters: ", validated.params);

  // Quote the transfer to determine output amounts and fees
  const quote = await bestRoute.quote(validated.params);
  if (!quote.success) throw quote.error;
  console.log("Best route quote: ", quote);

  // Finally, initiate the transfer
  const receipt = await bestRoute.initiate(sender.signer, quote);
  console.log("Initiated transfer with receipt: ", receipt);

  // Start watching the transfer, if there is an opportunity to complete, this function will do it
  await routes.checkAndCompleteTransfer(bestRoute, receipt, receiver.signer);
})();
