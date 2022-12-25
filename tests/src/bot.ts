import { ExecuteResult, SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { logs } from "@cosmjs/stargate";
import { assert } from "@cosmjs/utils";

import { DrandExecuteMsg, GatewayExecuteMsg } from "./contracts";
import { setupOsmosisClient } from "./utils";

interface Beacon {
  readonly round: number;
  readonly randomness: string;
  readonly signature: string;
  readonly previous_signature: string;
}

/**
 * This data source is a mock for the Drand network node.
 * It includes 21 rounds starting with 2183660.
 * Those rounds are also hardcoded in the `test_mode` of nois-proxy.
 */
const localDataSource: Map<number, Beacon> = new Map(
  // Generate items with shell:
  //   for r in {2183660..2183680}; do echo "    [$r, $(curl -sS https://api3.drand.sh/public/$r)],"; done

  // prettier-ignore
  [
    [2183660, {"round":2183660,"randomness":"cbc851305a9b82e38863a77e5bc61b8707554adb3920418a6903489b284f88c2","signature":"b7cc14cb609b83ab5a9b95a095d3482a3b101450c7dbf9eff544c69db9d12ccd50751b2a0ff936885d254f3ddb0b143312aef9a9487dd2b7d766e35b5ccf0e34677070d3c612142b2c0d1d47633fd365a1a4b9bf58d8c745fb65d33c0d7323c0","previous_signature":"82af59ce7dfdfab98af6553c0f6a5bad22d2e246eb128740e45378dba3caf17572cf52b3d2c4d2fd68ba85357b1ab8b2052db62300a6007c6d82de0a1231a6ad75acc41f4174a1428873ed83db3bebe8e58e7bc0b13ec1cc4498a5a2a391baf0"}],
    [2183661, {"round":2183661,"randomness":"298403ad854a067cc64c9518a1bf1406425ad109269a49778b42d65c88919b1f","signature":"b6129952af337fed2e0a46fec8eb99167bd7a4d0ef1872ac4903f736f4628ae61b7d3d605a88ace5b03b4c52746c55f6056c8cd34058ef15282fd2ac054e1236b57921e8a0d4e824934cae04807b255d885c416be45f33014835023cb36f94f5","previous_signature":"b7cc14cb609b83ab5a9b95a095d3482a3b101450c7dbf9eff544c69db9d12ccd50751b2a0ff936885d254f3ddb0b143312aef9a9487dd2b7d766e35b5ccf0e34677070d3c612142b2c0d1d47633fd365a1a4b9bf58d8c745fb65d33c0d7323c0"}],
    [2183662, {"round":2183662,"randomness":"5059bd56c8f1a6bb541636c27346b660fea3a2b8fa2565da6f44601da93606da","signature":"a9ddbfc829c7fcbc2149419463017d13978851b4e5fa06b27b07a4bf94217d20f0645715abb847c4e2db30ef270325160c848419d3b227ccb4248c6c6c05d3551742d396b69e46b91e11e77c1b7c5eb6482db5c205f0fff844a03c60c8841c8b","previous_signature":"b6129952af337fed2e0a46fec8eb99167bd7a4d0ef1872ac4903f736f4628ae61b7d3d605a88ace5b03b4c52746c55f6056c8cd34058ef15282fd2ac054e1236b57921e8a0d4e824934cae04807b255d885c416be45f33014835023cb36f94f5"}],
    [2183663, {"round":2183663,"randomness":"519e33609b0f4eb617b58ae7cac13b80f47a3035804e553d1765400d04fc85cb","signature":"a6ceb9cbe5135e749641ce48377ee2a8c93bb1aa754de156a134d3fd83b0937d8426f05ae74627a37a7d7aea39b5f3ac094207e62adcd46546d539ca5a3b16cb8c973992b5d948dfc3110da6cad61103300f8bd463187d146c5c2671b79fec16","previous_signature":"a9ddbfc829c7fcbc2149419463017d13978851b4e5fa06b27b07a4bf94217d20f0645715abb847c4e2db30ef270325160c848419d3b227ccb4248c6c6c05d3551742d396b69e46b91e11e77c1b7c5eb6482db5c205f0fff844a03c60c8841c8b"}],
    [2183664, {"round":2183664,"randomness":"5b55519446ece9bb310bc5634ab0ffc8f76b1497566c97515f06920e19909746","signature":"b36d0d8ffba466f5671d202c8292986a680df788231d9debcebe1648f73c09ec3734508a0e9988a96c407aa91ca4c0e0025d15e53a271a334a026cc3556850dffeab8f6350bcdf722845bc2373c742d3fe8b3da9c423c3d55aa7c7c52d3077ac","previous_signature":"a6ceb9cbe5135e749641ce48377ee2a8c93bb1aa754de156a134d3fd83b0937d8426f05ae74627a37a7d7aea39b5f3ac094207e62adcd46546d539ca5a3b16cb8c973992b5d948dfc3110da6cad61103300f8bd463187d146c5c2671b79fec16"}],
    [2183665, {"round":2183665,"randomness":"c2a8f26d59ec6693e41216c25d9d4f1f8479171d3d702e74b59aca3482e0d662","signature":"ad245ed733a081751bf92191c44fa4d2752d225d49c8ca1ceeccb09fc78a4c1cf6dd1d71d2cd606453207e54c90dcefb02a4de1f613c0091c69cc27815d6d1fba414b737ea5433e946f258f4f78accbed0ed979919c74077395c1383ac362cf9","previous_signature":"b36d0d8ffba466f5671d202c8292986a680df788231d9debcebe1648f73c09ec3734508a0e9988a96c407aa91ca4c0e0025d15e53a271a334a026cc3556850dffeab8f6350bcdf722845bc2373c742d3fe8b3da9c423c3d55aa7c7c52d3077ac"}],
    [2183666, {"round":2183666,"randomness":"768bd188a948f1f2959d15c657f159dd34bdf741b7d4b17a29b877eb36c04dcf","signature":"93e948877a14c62abb1b611580b86c3c08ed1a732390f976e028475077e22312ada06e7f60e42a69ff8e256727a39ae60476738c74dd0485782664d4a882a6e75fef73feb3647e2261ba7a0358dfa15ecd9d67060e00adf201fbbbc86c7dd90d","previous_signature":"ad245ed733a081751bf92191c44fa4d2752d225d49c8ca1ceeccb09fc78a4c1cf6dd1d71d2cd606453207e54c90dcefb02a4de1f613c0091c69cc27815d6d1fba414b737ea5433e946f258f4f78accbed0ed979919c74077395c1383ac362cf9"}],
    [2183667, {"round":2183667,"randomness":"3fde1bdae10b7c8c826bccee66f534b82d374f88c1f8d1836063b00d2817e327","signature":"b0272269d87be8f146a0dc4f882b03add1e0f98ee7c55ee674107c231cfa7d2e40d9c88dd6e72f2f52d1abe14766b2c40dd392eec82d678a4c925c6937717246e8ae96d54d8ea70f85f8282cf14c56e5b547b7ee82df4ff61f3523a0eefcdf41","previous_signature":"93e948877a14c62abb1b611580b86c3c08ed1a732390f976e028475077e22312ada06e7f60e42a69ff8e256727a39ae60476738c74dd0485782664d4a882a6e75fef73feb3647e2261ba7a0358dfa15ecd9d67060e00adf201fbbbc86c7dd90d"}],
    [2183668, {"round":2183668,"randomness":"3436462283a07e695c41854bb953e5964d8737e7e29745afe54a9f4897b6c319","signature":"b06969214b8a7c8d705c4c5e00262626d95e30f8583dc21670508d6d4751ae95ddf675e76feabe1ee5f4000dd21f09d009bb2b57da6eedd10418e83c303c2d5845914175ffe13601574d039a7593c3521eaa98e43be927b4a00d423388501f05","previous_signature":"b0272269d87be8f146a0dc4f882b03add1e0f98ee7c55ee674107c231cfa7d2e40d9c88dd6e72f2f52d1abe14766b2c40dd392eec82d678a4c925c6937717246e8ae96d54d8ea70f85f8282cf14c56e5b547b7ee82df4ff61f3523a0eefcdf41"}],
    [2183669, {"round":2183669,"randomness":"408de94b8c7e1972b06a4ab7636eb1ba2a176022a30d018c3b55e89289d41149","signature":"990538b0f0ca3b934f53eb41d7a4ba24f3b3800abfc06275eb843df75a53257c2dbfb8f6618bb72874a79303429db13e038e6619c08726e8bbb3ae58ebb31e08d2aed921e4246fdef984285eb679c6b443f24bd04f78659bd4230e654db4200d","previous_signature":"b06969214b8a7c8d705c4c5e00262626d95e30f8583dc21670508d6d4751ae95ddf675e76feabe1ee5f4000dd21f09d009bb2b57da6eedd10418e83c303c2d5845914175ffe13601574d039a7593c3521eaa98e43be927b4a00d423388501f05"}],
    [2183670, {"round":2183670,"randomness":"e5f7ba655389eee248575dde70cb9f3293c9774c8538136a135601907158d957","signature":"a63dcbd669534b049a86198ee98f1b68c24aac50de411d11f2a8a98414f9312cd04027810417d0fa60461c0533d604630ada568ef83af93ce05c1620c8bee1491092c11e5c7d9bb679b5b8de61bbb48e092164366ae6f799c082ddab691d1d78","previous_signature":"990538b0f0ca3b934f53eb41d7a4ba24f3b3800abfc06275eb843df75a53257c2dbfb8f6618bb72874a79303429db13e038e6619c08726e8bbb3ae58ebb31e08d2aed921e4246fdef984285eb679c6b443f24bd04f78659bd4230e654db4200d"}],
    [2183671, {"round":2183671,"randomness":"324e2a196293b42806c12c7bbd1aeba8d5617942f152a16588223f905f60801a","signature":"b449f94098616029baea233fa8b64851cf9de2b230a7c5a2181c3abdc9e92806ae9020a5d9dcdbb707b6f1754480954b00a80b594cb35b51944167d2b20cc3b3cac6da7023c6a6bf867c6c3844768794edcaae292394316603797d669f62691a","previous_signature":"a63dcbd669534b049a86198ee98f1b68c24aac50de411d11f2a8a98414f9312cd04027810417d0fa60461c0533d604630ada568ef83af93ce05c1620c8bee1491092c11e5c7d9bb679b5b8de61bbb48e092164366ae6f799c082ddab691d1d78"}],
    [2183672, {"round":2183672,"randomness":"e0f717062cb3b31c9f92e9417dd77549d1d2ec37e1eeac3135db94253a1d6ba7","signature":"aa207a74e1d45943ca48837abec678752a0cc1456e780a0a7379a3fa7215cd2ec4262d253c2f2c73dfc0ed8052b07afe08551e509d20274754af6401ce0368f28e4a196ce75f4696798483750ef9f8d3f348b8e9e2d6bcd300c2f5877e069b25","previous_signature":"b449f94098616029baea233fa8b64851cf9de2b230a7c5a2181c3abdc9e92806ae9020a5d9dcdbb707b6f1754480954b00a80b594cb35b51944167d2b20cc3b3cac6da7023c6a6bf867c6c3844768794edcaae292394316603797d669f62691a"}],
    [2183673, {"round":2183673,"randomness":"acaaa0342f1511d73e1ed918b32d450d5f7501f5232522e4d97badabea224a6f","signature":"964ff46b75c4a105a90bb61596c95ad57ec77f94f045ef692006c01211cf94a13331adb0a823f09b1d772ab33e0af5bd005f345684a794187b6ad90d47aef78cff5a7a8db1c840e4a2d832f6796301da70b4788666d2034fe1c9e6134e607441","previous_signature":"aa207a74e1d45943ca48837abec678752a0cc1456e780a0a7379a3fa7215cd2ec4262d253c2f2c73dfc0ed8052b07afe08551e509d20274754af6401ce0368f28e4a196ce75f4696798483750ef9f8d3f348b8e9e2d6bcd300c2f5877e069b25"}],
    [2183674, {"round":2183674,"randomness":"d58e0072e6a57fa978a7321f55a182334cbfcb510f0ac2e2e3bceb28f21bcd3e","signature":"819be8979aa6ddf9143891b52706483ccba468df5ca19c8facd4f09890d54bd77abc0d6ce7e2280d920292e1c645136a1914d6c0f6f352c76067798cb868b9b69c59da2315efe5ead65d6fbdeae3681d85e8f699c4e4eaad8bfc22da2252c3ae","previous_signature":"964ff46b75c4a105a90bb61596c95ad57ec77f94f045ef692006c01211cf94a13331adb0a823f09b1d772ab33e0af5bd005f345684a794187b6ad90d47aef78cff5a7a8db1c840e4a2d832f6796301da70b4788666d2034fe1c9e6134e607441"}],
    [2183675, {"round":2183675,"randomness":"ee87e760c23fd8c4b6ac98623c8134f1c930f7f6163d2508a980ca4e639be4e4","signature":"931523c5fc820b8e31dcf7793a83b0a0c23cda7eaea45a7f6bf4728472df77961cb45076c54c725d491fe1a42f3b8f740a71eef62dbdbad886caff534b9734a864104b3a6c146bf7dfcf72f3b8fed5c6ec13cce60c02fdad97b07cfdc7a9f084","previous_signature":"819be8979aa6ddf9143891b52706483ccba468df5ca19c8facd4f09890d54bd77abc0d6ce7e2280d920292e1c645136a1914d6c0f6f352c76067798cb868b9b69c59da2315efe5ead65d6fbdeae3681d85e8f699c4e4eaad8bfc22da2252c3ae"}],
    [2183676, {"round":2183676,"randomness":"545d24cb6af73e36921875eb0007365caccccbdf1be41904643e42896c2e1cc2","signature":"b2d7804b050cfaf332beb173d26c5ec01621caeea345927ac161d8f47f3f09ef14a5d2fd07fb9c5f6e5a0677bc44121505cc0230b0ec153bf195f343e52aafa317597f2ca617309eae61a67714b64afa36865542e069d407248e443e44996afc","previous_signature":"931523c5fc820b8e31dcf7793a83b0a0c23cda7eaea45a7f6bf4728472df77961cb45076c54c725d491fe1a42f3b8f740a71eef62dbdbad886caff534b9734a864104b3a6c146bf7dfcf72f3b8fed5c6ec13cce60c02fdad97b07cfdc7a9f084"}],
    [2183677, {"round":2183677,"randomness":"73667223a0bcc2139c18d31df839df07dfeac359e0478954a397bb67185571e6","signature":"880d76f59dfb53fc48677936c95bddadfbf4c4954cf999c6cf13e462cc3b2294bd57a7af5d2128654b9ac2779e806ecc05994e74a650b15194dedbbfea7a7d10fcdaedb8a853540f98c8c8e0466a3dc971a6f9eca76266fe8993982cfde88533","previous_signature":"b2d7804b050cfaf332beb173d26c5ec01621caeea345927ac161d8f47f3f09ef14a5d2fd07fb9c5f6e5a0677bc44121505cc0230b0ec153bf195f343e52aafa317597f2ca617309eae61a67714b64afa36865542e069d407248e443e44996afc"}],
    [2183678, {"round":2183678,"randomness":"e792784917a123cc1b54ef55756184e25f93a5d716de9079edf6f836b3318215","signature":"95892ef24716984539c6a0e9b732e110b7615b4753bcd0b44c43ae6a5c4c13d18c673c2dfb9853b0628114c5aea800bb0e166cfc4a600c30d2514040a49035eb2c5214d886b9b86369a1fbc5fd00c3e3d65a6053bb92cdcf96569068a515ba81","previous_signature":"880d76f59dfb53fc48677936c95bddadfbf4c4954cf999c6cf13e462cc3b2294bd57a7af5d2128654b9ac2779e806ecc05994e74a650b15194dedbbfea7a7d10fcdaedb8a853540f98c8c8e0466a3dc971a6f9eca76266fe8993982cfde88533"}],
    [2183679, {"round":2183679,"randomness":"9a88a53e1c48634c22c14843e616cef9afdf02467501158d9f9f7b5378c1c2bb","signature":"a4e9a0199b85405ac4f51e843d07640c397c2e0ccd83f45c93c5a3a61d3d552be4c85c57c6965545286f181b7913374a193be7f37abc526975d67cddc50236142c93da4cca1953224d48f9f328fe644ba40c87debb829b4a9e2248919a8aa1cb","previous_signature":"95892ef24716984539c6a0e9b732e110b7615b4753bcd0b44c43ae6a5c4c13d18c673c2dfb9853b0628114c5aea800bb0e166cfc4a600c30d2514040a49035eb2c5214d886b9b86369a1fbc5fd00c3e3d65a6053bb92cdcf96569068a515ba81"}],
    [2183680, {"round":2183680,"randomness":"ae37720e365186e1facbeab03dbcd2fcebdc95755b0f3717ed41fd5ede5d85b6","signature":"aad6368b84acc75146444104917250ed22c4caf95118526ea9615e4d866417d6c9cb585afb8a8b24c10429642b7fa6d0037856c861b97f9507c78875e33b07c8afcbc71e8323854519f47f66ed313736efb3753acedcf83970c94665d957a8e3","previous_signature":"a4e9a0199b85405ac4f51e843d07640c397c2e0ccd83f45c93c5a3a61d3d552be4c85c57c6965545286f181b7913374a193be7f37abc526975d67cddc50236142c93da4cca1953224d48f9f328fe644ba40c87debb829b4a9e2248919a8aa1cb"}],
  ]

  // Publish times (https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&gist=65eea6af54e85243595743ba41f96f18)
  // Publish time of #2183660: 1660940820000000000
  // Publish time of #2183661: 1660940850000000000
  // Publish time of #2183662: 1660940880000000000
  // Publish time of #2183663: 1660940910000000000
  // Publish time of #2183664: 1660940940000000000
  // Publish time of #2183665: 1660940970000000000
  // Publish time of #2183666: 1660941000000000000
  // Publish time of #2183667: 1660941030000000000
  // Publish time of #2183668: 1660941060000000000
  // Publish time of #2183669: 1660941090000000000
  // Publish time of #2183670: 1660941120000000000
  // Publish time of #2183671: 1660941150000000000
  // Publish time of #2183672: 1660941180000000000
  // Publish time of #2183673: 1660941210000000000
  // Publish time of #2183674: 1660941240000000000
  // Publish time of #2183675: 1660941270000000000
  // Publish time of #2183676: 1660941300000000000
  // Publish time of #2183677: 1660941330000000000
  // Publish time of #2183678: 1660941360000000000
  // Publish time of #2183679: 1660941390000000000
  // Publish time of #2183680: 1660941420000000000
);

export class Bot {
  public static async connect(drandAddress: string): Promise<Bot> {
    const signer = await setupOsmosisClient();
    return new Bot(signer.senderAddress, signer.sign, drandAddress);
  }

  private readonly address: string;
  private readonly client: SigningCosmWasmClient;
  private readonly drandAddress: string;
  private nextRound = 2183660;

  private constructor(address: string, client: SigningCosmWasmClient, drandAddress: string) {
    this.address = address;
    this.client = client;
    this.drandAddress = drandAddress;
  }

  public async submitNext(): Promise<ExecuteResult> {
    const round = this.nextRound;
    this.nextRound += 1;
    return this.submitRound(round);
  }

  public async submitRound(round: number): Promise<ExecuteResult> {
    const beacon = localDataSource.get(round);
    assert(beacon, `No data source for round ${round} available`);

    const msg: DrandExecuteMsg = {
      add_round: {
        round: beacon.round,
        signature: beacon.signature,
        previous_signature: beacon.previous_signature,
      },
    };
    const res = await this.client.execute(this.address, this.drandAddress, msg, "auto");
    return res;
  }

  public async register(moniker: string): Promise<ExecuteResult> {
    const msg: DrandExecuteMsg = {
      register_bot: {
        moniker,
      },
    };
    return this.client.execute(this.address, this.drandAddress, msg, "auto");
  }
}

// Like Bot but submits pre-verified beacons
export class MockBot {
  public static async connect(gatewayAddress: string): Promise<MockBot> {
    const signer = await setupOsmosisClient();
    return new MockBot(signer.senderAddress, signer.sign, gatewayAddress);
  }

  private readonly address: string;
  private readonly client: SigningCosmWasmClient;
  private readonly gatewayAddress: string;
  private nextRound = 2183660;

  private constructor(address: string, client: SigningCosmWasmClient, gatewayAddress: string) {
    this.address = address;
    this.client = client;
    this.gatewayAddress = gatewayAddress;
  }

  public async submitNext(): Promise<ExecuteResult> {
    const round = this.nextRound;
    this.nextRound += 1;
    return this.submitRound(round);
  }

  public async submitRound(round: number): Promise<ExecuteResult> {
    const beacon = localDataSource.get(round);
    assert(beacon, `No data source for round ${round} available`);

    const msg: GatewayExecuteMsg = {
      add_verified_round: {
        round: beacon.round,
        randomness: beacon.randomness,
      },
    };
    const res = await this.client.execute(this.address, this.gatewayAddress, msg, "auto");
    return res;
  }
}

export function ibcPacketsSent(resultLogs: readonly logs.Log[]): number {
  const allEvents = resultLogs.flatMap((log) => log.events);
  const packetsEvents = allEvents.filter((e) => e.type === "send_packet");
  const attributes = packetsEvents.flatMap((e) => e.attributes);
  const packetsSentCount = attributes.filter((a) => a.key === "packet_sequence").length;
  return packetsSentCount;
}
