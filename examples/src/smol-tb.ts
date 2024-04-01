import { TokenTransfer, Wormhole, amount, wormhole } from "@wormhole-foundation/sdk";
import evm from "@wormhole-foundation/sdk/evm";
import solana from "@wormhole-foundation/sdk/solana";

import { getSigner } from "./helpers/index.js";

(async function () {
  // Init Wormhole object, passing config for which network
  // Load the set of platforms  you want to support
  const wh = await wormhole("Testnet", [evm, solana]);

  // Grab chain Contexts -- these hold cached rpc and contract clients
  const sendChain = wh.getChain("Avalanche");
  const rcvChain = wh.getChain("Solana");

  // Use provided signers, or implement your own!
  const source = await getSigner(sendChain);
  const destination = await getSigner(rcvChain);

  // Shortcut to allow transferring native gas token
  const token = Wormhole.tokenId(sendChain.chain, "native");
  const decimals = sendChain.config.nativeTokenDecimals;
  const amt = amount.units(amount.parse("0.001", decimals));

  // Manual delivery for this example
  const automatic = false;

  // Create a TokenTransfer object to track the state of the transfer over time
  const xfer = await wh.tokenTransfer(token, amt, source.address, destination.address, automatic);

  console.log(
    "Quote: ",
    await TokenTransfer.quoteTransfer(wh, source.chain, destination.chain, xfer.transfer),
  );

  const srcTxids = await xfer.initiateTransfer(source.signer);
  console.log(`Started transfer: `, srcTxids);

  // If automatic, we're done, otherwise get the attestation
  // from guardians and deliver it to the destination
  if (!automatic) {
    const attestIds = await xfer.fetchAttestation(60_000);
    console.log(`Got Attestation: `, attestIds);
    const destTxids = await xfer.completeTransfer(destination.signer);
    console.log(`Completed Transfer: `, destTxids);
  }

  console.log(`Visit https://wormholescan.io/#/tx/${srcTxids.pop()}`);
})();
