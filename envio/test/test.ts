import assert from "assert";
import generated from "generated";
import type {
  AssetContract_AssetCreated,
  AssetContract_OwnershipTransferred,
  AssetContract_CreatorFeeShareUpdated,
  AssetContract_RegistryFeeShareUpdated,
  Asset_SubscriptionPriceUpdated,
  AssetEntity,
  Subscription,
} from "generated";

const { TestHelpers } = generated;
const { MockDb, AssetRegistry, Addresses, Asset } = TestHelpers;

describe("Asset indexer tests", () => {
  it("AssetCreated event creates an AssetContract_AssetCreated entity", async () => {
    const mockDbInitial = MockDb.createMockDb();

    const assetId =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    const assetAddress = Addresses.defaultAddress;
    const subscriptionPrice = 1000n;
    const tokenAddress = Addresses.mockAddresses[2];
    const owner = Addresses.mockAddresses[3];

    const mockEvent = AssetRegistry.AssetCreated.createMockEvent({
      assetId,
      asset: assetAddress,
      subscriptionPrice,
      tokenAddress,
      owner,
    });

    const updatedMockDb = await AssetRegistry.AssetCreated.processEvent({
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
      subscriptionPrice,
      tokenAddress,
      owner,
    };

    assert.deepEqual(actualEntity, expectedEntity);
  });

  it("AssetCreated populates AssetEntity and mapping", async () => {
    const mockDb = MockDb.createMockDb();
  
    const assetId =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    const assetAddress = Addresses.defaultAddress;
    const subscriptionPrice = 1000n;
    const tokenAddress = Addresses.mockAddresses[2];
    const owner = Addresses.mockAddresses[3];
  
    const event = AssetRegistry.AssetCreated.createMockEvent({
      assetId,
      asset: assetAddress,
      subscriptionPrice,
      tokenAddress,
      owner,
    });
  
    const db1 = await AssetRegistry.AssetCreated.processEvent({
      event,
      mockDb,
    });
  
    const assetEntity: AssetEntity | undefined =
      db1.entities.AssetEntity.get(assetAddress.toLowerCase());
    const mapping = db1.entities.AssetIdToAddress.get(assetId);
  
    assert.ok(assetEntity);
    assert.equal(assetEntity?.assetId, assetId);
    assert.equal(assetEntity?.registryAddress, event.srcAddress.toLowerCase());
    assert.equal(assetEntity?.owner, owner.toLowerCase());
    assert.equal(mapping?.assetAddress, assetAddress.toLowerCase());
  });
  
  it("SubscriptionAdded/Revoked maintain Subscription", async () => {
    const mockDb = MockDb.createMockDb();
  
    const assetAddress = Addresses.defaultAddress;
    const user = Addresses.mockAddresses[1]; // or defaultAddress again
    const expiresAt = 1234n;
  
    const addEvent = Asset.SubscriptionAdded.createMockEvent({
      user,
      expiresAt,
    });
    const db1 = await Asset.SubscriptionAdded.processEvent({ event: addEvent, mockDb });
  
    const subId = `${assetAddress.toLowerCase()}_${user.toLowerCase()}`;
    const sub1: Subscription | undefined = db1.entities.Subscription.get(subId);
    assert.ok(sub1);
    assert.equal(sub1?.isActive, true);
  
    const revokeEvent = Asset.SubscriptionRevoked.createMockEvent({ user });
    const db2 = await Asset.SubscriptionRevoked.processEvent({
      event: revokeEvent,
      mockDb: db1,
    });
  
    const sub2 = db2.entities.Subscription.get(subId);
    assert.ok(sub2);
    assert.equal(sub2?.isActive, false);
  });

  it("AssetRegistry OwnershipTransferred creates an AssetContract_OwnershipTransferred entity", async () => {
    const mockDb = MockDb.createMockDb();

    const previousOwner = Addresses.mockAddresses[0];
    const newOwner = Addresses.mockAddresses[1];

    const event = AssetRegistry.OwnershipTransferred.createMockEvent({
      previousOwner,
      newOwner,
    });

    const db1 = await AssetRegistry.OwnershipTransferred.processEvent({
      event,
      mockDb,
    });

    const id = `${event.chainId}_${event.block.number}_${event.logIndex}`;
    const entity =
      db1.entities.AssetContract_OwnershipTransferred.get(id);

    const expected: AssetContract_OwnershipTransferred = {
      id,
      previousOwner,
      newOwner,
    };

    assert.deepEqual(entity, expected);
  });

  it("AssetRegistry CreatorFeeShareUpdated creates an AssetContract_CreatorFeeShareUpdated entity", async () => {
    const mockDb = MockDb.createMockDb();

    const newCreatorFeeShare = 123n;

    const event = AssetRegistry.CreatorFeeShareUpdated.createMockEvent({
      newCreatorFeeShare,
    });

    const db1 = await AssetRegistry.CreatorFeeShareUpdated.processEvent({
      event,
      mockDb,
    });

    const id = `${event.chainId}_${event.block.number}_${event.logIndex}`;
    const entity =
      db1.entities.AssetContract_CreatorFeeShareUpdated.get(id);

    const expected: AssetContract_CreatorFeeShareUpdated = {
      id,
      newCreatorFeeShare,
    };

    assert.deepEqual(entity, expected);
  });

  it("AssetRegistry RegistryFeeShareUpdated creates an AssetContract_RegistryFeeShareUpdated entity", async () => {
    const mockDb = MockDb.createMockDb();

    const newRegistryFeeShare = 456n;

    const event = AssetRegistry.RegistryFeeShareUpdated.createMockEvent({
      newRegistryFeeShare,
    });

    const db1 = await AssetRegistry.RegistryFeeShareUpdated.processEvent({
      event,
      mockDb,
    });

    const id = `${event.chainId}_${event.block.number}_${event.logIndex}`;
    const entity =
      db1.entities.AssetContract_RegistryFeeShareUpdated.get(id);

    const expected: AssetContract_RegistryFeeShareUpdated = {
      id,
      newRegistryFeeShare,
    };

    assert.deepEqual(entity, expected);
  });

  it("SubscriptionPriceUpdated creates an Asset_SubscriptionPriceUpdated entity", async () => {
    const mockDb = MockDb.createMockDb();

    const newSubscriptionPrice = 999n;

    const event = Asset.SubscriptionPriceUpdated.createMockEvent({
      newSubscriptionPrice,
    });

    const db1 = await Asset.SubscriptionPriceUpdated.processEvent({
      event,
      mockDb,
    });

    const id = `${event.chainId}_${event.block.number}_${event.logIndex}`;
    const entity =
      db1.entities.Asset_SubscriptionPriceUpdated.get(id);

    const expected: Asset_SubscriptionPriceUpdated = {
      id,
      newSubscriptionPrice,
    };

    assert.deepEqual(entity, expected);
  });

  it("Asset OwnershipTransferred creates Asset_OwnershipTransferred entity and updates existing AssetEntity owner", async () => {
    const mockDb = MockDb.createMockDb();

    const assetId =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    const assetAddress = Addresses.defaultAddress;
    const subscriptionPrice = 1000n;
    const tokenAddress = Addresses.mockAddresses[2];
    const originalOwner = Addresses.mockAddresses[3];
    const newOwner = Addresses.mockAddresses[4];

    // Seed AssetEntity via AssetRegistry.AssetCreated
    const createdEvent = AssetRegistry.AssetCreated.createMockEvent({
      assetId,
      asset: assetAddress,
      subscriptionPrice,
      tokenAddress,
      owner: originalOwner,
    });

    const db1 = await AssetRegistry.AssetCreated.processEvent({
      event: createdEvent,
      mockDb,
    });

    // OwnershipTransferred event from Asset
    const ownershipEvent = Asset.OwnershipTransferred.createMockEvent({
      previousOwner: originalOwner,
      newOwner,
    });

    const db2 = await Asset.OwnershipTransferred.processEvent({
      event: ownershipEvent,
      mockDb: db1,
    });

    const id = `${ownershipEvent.chainId}_${ownershipEvent.block.number}_${ownershipEvent.logIndex}`;
    const ownershipEntity =
      db2.entities.Asset_OwnershipTransferred.get(id);

    assert.ok(ownershipEntity);
    assert.equal(ownershipEntity?.previousOwner, originalOwner);
    assert.equal(ownershipEntity?.newOwner, newOwner);

    const storedAsset = db2.entities.AssetEntity.get(
      assetAddress.toLowerCase(),
    );

    assert.ok(storedAsset);
    assert.equal(storedAsset?.owner, newOwner.toLowerCase());
  });

  it("Asset OwnershipTransferred is a no-op for AssetEntity when asset does not exist", async () => {
    const mockDb = MockDb.createMockDb();

    const assetAddress = Addresses.defaultAddress;
    const previousOwner = Addresses.mockAddresses[0];
    const newOwner = Addresses.mockAddresses[1];

    const ownershipEvent = Asset.OwnershipTransferred.createMockEvent({
      previousOwner,
      newOwner,
    });

    const db1 = await Asset.OwnershipTransferred.processEvent({
      event: ownershipEvent,
      mockDb,
    });

    const storedAsset = db1.entities.AssetEntity.get(
      assetAddress.toLowerCase(),
    );

    assert.equal(storedAsset, undefined);
  });

  it("SubscriptionAdded updates existing Subscription when already present", async () => {
    const mockDb = MockDb.createMockDb();

    const assetAddress = Addresses.defaultAddress;
    const user = Addresses.mockAddresses[1];
    const expiresAt1 = 1234n;
    const expiresAt2 = 9999n;

    const addEvent1 = Asset.SubscriptionAdded.createMockEvent({
      user,
      expiresAt: expiresAt1,
    });
    const db1 = await Asset.SubscriptionAdded.processEvent({
      event: addEvent1,
      mockDb,
    });

    const addEvent2 = Asset.SubscriptionAdded.createMockEvent({
      user,
      expiresAt: expiresAt2,
    });
    const db2 = await Asset.SubscriptionAdded.processEvent({
      event: addEvent2,
      mockDb: db1,
    });

    const subId = `${assetAddress.toLowerCase()}_${user.toLowerCase()}`;
    const sub = db2.entities.Subscription.get(subId);

    assert.ok(sub);
    assert.equal(sub?.expiresAt, expiresAt2);
    assert.equal(sub?.isActive, true);
  });

  it("SubscriptionRevoked is a no-op when Subscription does not exist", async () => {
    const mockDb = MockDb.createMockDb();

    const assetAddress = Addresses.defaultAddress;
    const user = Addresses.mockAddresses[1];

    const revokeEvent = Asset.SubscriptionRevoked.createMockEvent({
      user,
    });

    const db1 = await Asset.SubscriptionRevoked.processEvent({
      event: revokeEvent,
      mockDb,
    });

    const subId = `${assetAddress.toLowerCase()}_${user.toLowerCase()}`;
    const sub = db1.entities.Subscription.get(subId);

    assert.equal(sub, undefined);
  });
});
