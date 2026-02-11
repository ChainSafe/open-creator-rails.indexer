import assert from "assert";
import generated from "generated";
import type { AssetContract_AssetCreated } from "generated";

const { TestHelpers } = generated;
const { MockDb, AssetContract, Addresses } = TestHelpers;

describe("AssetContract indexer tests", () => {
  it("AssetCreated event creates an AssetContract_AssetCreated entity", async () => {
    const mockDbInitial = MockDb.createMockDb();

    const assetId =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    const assetAddress = Addresses.defaultAddress;

    const mockEvent = AssetContract.AssetCreated.createMockEvent({
      assetId,
      asset: assetAddress,
    });

    const updatedMockDb = await AssetContract.AssetCreated.processEvent({
      event: mockEvent,
      mockDb: mockDbInitial,
    });

    const id = `${mockEvent.chainId}_${mockEvent.block.number}_${mockEvent.logIndex}`;

    const actualEntity =
      updatedMockDb.entities.AssetContract_AssetCreated.get(id);

    const expectedEntity: AssetContract_AssetCreated = {
      id,
      assetId,
      asset: assetAddress,
    };

    assert.deepEqual(actualEntity, expectedEntity);
  });
});
