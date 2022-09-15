import { CosmWasmSigner, Link, testutils } from "@confio/relayer";
import { toBinary } from "@cosmjs/cosmwasm-stargate";
import { fromUtf8 } from "@cosmjs/encoding";
import { assert } from "@cosmjs/utils";
import test from "ava";
import { Order } from "cosmjs-types/ibc/core/channel/v1/channel";

import { Bot } from "./bot";
import {
  assertPacketsFromA,
  assertPacketsFromB,
  NoisProtocolIbcVersion,
  setupContracts,
  setupOsmosisClient,
  setupWasmClient,
} from "./utils";

const { osmosis: oldOsmo, setup, wasmd } = testutils;
const osmosis = { ...oldOsmo, minFee: "0.025uosmo" };

let wasmCodeIds: Record<string, number> = {};
let osmosisCodeIds: Record<string, number> = {};

test.before(async (t) => {
  t.log("Upload contracts to wasmd...");
  const wasmContracts = {
    proxy: "./internal/nois_proxy.wasm",
    demo: "./internal/nois_demo.wasm",
  };
  const wasmSign = await setupWasmClient();
  wasmCodeIds = await setupContracts(t, wasmSign, wasmContracts);

  t.log("Upload contracts to osmosis...");
  const osmosisContracts = {
    oracle: "./internal/nois_oracle.wasm",
  };
  const osmosisSign = await setupOsmosisClient();
  osmosisCodeIds = await setupContracts(t, osmosisSign, osmosisContracts);

  t.pass();
});

test.serial("Bot can submit to Oracle", async (t) => {
  // Instantiate Oracle on osmosis
  const osmoClient = await setupOsmosisClient();
  const { contractAddress: oracleAddress } = await osmoClient.sign.instantiate(
    osmoClient.senderAddress,
    osmosisCodeIds.oracle,
    { test_mode: true },
    "Oracle instance",
    "auto"
  );
  t.truthy(oracleAddress);

  const before = await osmoClient.sign.queryContractSmart(oracleAddress, {
    beacon: { round: 2183666 },
  });
  t.deepEqual(before, { beacon: null });

  const bot = await Bot.connect(oracleAddress);
  await bot.submitRound(2183666);

  const after = await osmoClient.sign.queryContractSmart(oracleAddress, {
    beacon: { round: 2183666 },
  });
  t.regex(after.beacon.published, /^1660941000000000000$/);
  t.regex(after.beacon.verified, /^1[0-9]{18}$/);
  t.is(after.beacon.randomness, "768bd188a948f1f2959d15c657f159dd34bdf741b7d4b17a29b877eb36c04dcf");
});

test.serial("set up channel", async (t) => {
  // Instantiate proxy on appchain
  const wasmClient = await setupWasmClient();
  const { contractAddress: proxyAddress } = await wasmClient.sign.instantiate(
    wasmClient.senderAddress,
    wasmCodeIds.proxy,
    {},
    "Proxy instance",
    "auto"
  );
  t.truthy(proxyAddress);
  const { ibcPortId: proxyPort } = await wasmClient.sign.getContract(proxyAddress);
  t.log(`Proxy port: ${proxyPort}`);
  assert(proxyPort);

  // Instantiate Oracle on osmosis
  const osmoClient = await setupOsmosisClient();
  const { contractAddress: oracleAddress } = await osmoClient.sign.instantiate(
    osmoClient.senderAddress,
    osmosisCodeIds.oracle,
    { test_mode: true },
    "Oracle instance",
    "auto"
  );
  t.truthy(oracleAddress);
  const { ibcPortId: oraclePort } = await osmoClient.sign.getContract(oracleAddress);
  t.log(`Oracle port: ${oraclePort}`);
  assert(oraclePort);

  const [src, dest] = await setup(wasmd, osmosis);
  const link = await Link.createWithNewConnections(src, dest);
  await link.createChannel("A", proxyPort, oraclePort, Order.ORDER_UNORDERED, NoisProtocolIbcVersion);
});

interface SetupInfo {
  wasmClient: CosmWasmSigner;
  osmoClient: CosmWasmSigner;
  /// Address on app chain (wasmd)
  noisProxyAddress: string;
  /// Address on app chain (wasmd)
  noisDemoAddress: string;
  /// Address on randomness chain (osmosis)
  noisOracleAddress: string;
  link: Link;
  noisChannel: {
    wasmChannelId: string;
    osmoChannelId: string;
  };
  ics20Channel: {
    wasmChannelId: string;
    osmoChannelId: string;
  };
}

async function instantiateAndConnectIbc(): Promise<SetupInfo> {
  const [wasmClient, osmoClient] = await Promise.all([setupWasmClient(), setupOsmosisClient()]);

  // Instantiate proxy on appchain
  const { contractAddress: noisProxyAddress } = await wasmClient.sign.instantiate(
    wasmClient.senderAddress,
    wasmCodeIds.proxy,
    {},
    "Proxy instance",
    "auto"
  );

  // Instantiate Oracle on Osmosis
  const { contractAddress: noisOracleAddress } = await osmoClient.sign.instantiate(
    osmoClient.senderAddress,
    osmosisCodeIds.oracle,
    { test_mode: true },
    "Oracle instance",
    "auto"
  );

  const [noisProxyInfo, noisOracleInfo] = await Promise.all([
    wasmClient.sign.getContract(noisProxyAddress),
    osmoClient.sign.getContract(noisOracleAddress),
  ]);
  const { ibcPortId: proxyPort } = noisProxyInfo;
  assert(proxyPort);
  const { ibcPortId: oraclePort } = noisOracleInfo;
  assert(oraclePort);

  // Create a connection between the chains
  const [src, dest] = await setup(wasmd, osmosis);
  const link = await Link.createWithNewConnections(src, dest);

  // Create a channel for nois-v2
  const info = await link.createChannel("A", proxyPort, oraclePort, Order.ORDER_UNORDERED, NoisProtocolIbcVersion);
  const noisChannel = {
    wasmChannelId: info.src.channelId,
    osmoChannelId: info.dest.channelId,
  };

  // Also create a ics20 channel
  const ics20Info = await link.createChannel("A", wasmd.ics20Port, osmosis.ics20Port, Order.ORDER_UNORDERED, "ics20-1");
  const ics20Channel = {
    wasmChannelId: ics20Info.src.channelId,
    osmoChannelId: ics20Info.dest.channelId,
  };

  // Instantiate demo app
  const { contractAddress: noisDemoAddress } = await wasmClient.sign.instantiate(
    wasmClient.senderAddress,
    wasmCodeIds.demo,
    { nois_proxy: noisProxyAddress },
    "A demo contract",
    "auto"
  );

  return {
    wasmClient,
    osmoClient,
    noisProxyAddress,
    noisDemoAddress,
    noisOracleAddress,
    link,
    noisChannel,
    ics20Channel,
  };
}

test.serial("proxy works", async (t) => {
  const { wasmClient, noisProxyAddress, link, noisOracleAddress: noisOracleAddress } = await instantiateAndConnectIbc();
  const bot = await Bot.connect(noisOracleAddress);

  // Query round 1 (existing)
  {
    await bot.submitNext();
    await wasmClient.sign.execute(
      wasmClient.senderAddress,
      noisProxyAddress,
      { get_next_randomness: { job_id: "eins" } },
      "auto"
    );

    const info = await link.relayAll();
    assertPacketsFromA(info, 1, true);
    const stdAck = JSON.parse(fromUtf8(info.acksFromB[0].acknowledgement));
    t.deepEqual(stdAck, { result: toBinary({ processed: { source_id: "test-mode:2183660" } }) });
  }

  // Query round 3 (non-existing)
  {
    await wasmClient.sign.execute(
      wasmClient.senderAddress,
      noisProxyAddress,
      { get_next_randomness: { job_id: "zwei" } },
      "auto"
    );

    const info = await link.relayAll();
    assertPacketsFromA(info, 1, true);
    const stdAck = JSON.parse(fromUtf8(info.acksFromB[0].acknowledgement));
    t.deepEqual(stdAck, { result: toBinary({ queued: { source_id: "test-mode:2183661" } }) });
  }
});

test.serial("demo contract can be used", async (t) => {
  const { wasmClient, noisDemoAddress, link, noisOracleAddress: noisOracleAddress } = await instantiateAndConnectIbc();
  const bot = await Bot.connect(noisOracleAddress);

  // Correct round submitted before request
  {
    await bot.submitNext();

    const jobId = Date.now().toString();
    const getRoundQuery = await wasmClient.sign.execute(
      wasmClient.senderAddress,
      noisDemoAddress,
      { estimate_pi: { job_id: jobId } },
      "auto"
    );
    t.log(getRoundQuery);

    // RequestBeacon packet
    const infoA2B = await link.relayAll();
    assertPacketsFromA(infoA2B, 1, true);
    const stdAck = JSON.parse(fromUtf8(infoA2B.acksFromB[0].acknowledgement));
    t.deepEqual(stdAck, { result: toBinary({ processed: { source_id: "test-mode:2183660" } }) });

    // DeliverBeacon packet
    const infoB2A = await link.relayAll();
    assertPacketsFromB(infoB2A, 1, true);

    const myResult = await wasmClient.sign.queryContractSmart(noisDemoAddress, {
      result: { job_id: jobId },
    });
    t.log(myResult);
    t.regex(myResult, /3\.1[0-9]+/);

    const results = await wasmClient.sign.queryContractSmart(noisDemoAddress, { results: {} });
    t.log(results);
  }

  // Round submitted after request
  {
    const jobId = Date.now().toString();
    const getRoundQuery = await wasmClient.sign.execute(
      wasmClient.senderAddress,
      noisDemoAddress,
      { estimate_pi: { job_id: jobId } },
      "auto"
    );
    t.log(getRoundQuery);

    // RequestBeacon packet
    const infoA2B = await link.relayAll();
    assertPacketsFromA(infoA2B, 1, true);
    const stdAck = JSON.parse(fromUtf8(infoA2B.acksFromB[0].acknowledgement));
    t.deepEqual(stdAck, { result: toBinary({ queued: { source_id: "test-mode:2183661" } }) });

    // DeliverBeacon packet not yet
    const infoB2A = await link.relayAll();
    assertPacketsFromB(infoB2A, 0, true);

    const myResult = await wasmClient.sign.queryContractSmart(noisDemoAddress, {
      result: { job_id: jobId },
    });
    t.is(myResult, null);

    const results = await wasmClient.sign.queryContractSmart(noisDemoAddress, { results: {} });
    t.log(results);

    // Round incoming
    await bot.submitNext();

    // DeliverBeacon packet
    const infoB2A2 = await link.relayAll();
    assertPacketsFromB(infoB2A2, 1, true);

    const myResult2 = await wasmClient.sign.queryContractSmart(noisDemoAddress, {
      result: { job_id: jobId },
    });
    t.log(myResult2);
    t.regex(myResult2, /3\.1[0-9]+/);

    const results2 = await wasmClient.sign.queryContractSmart(noisDemoAddress, { results: {} });
    t.log(results2);
  }
});
