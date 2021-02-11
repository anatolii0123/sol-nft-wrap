
const AcctFactory = artifacts.require("AcctFactory");
const Acct = artifacts.require("Acct");
const OwnerRegistry = artifacts.require("OwnerRegistry");
const ERC20Mock = artifacts.require("mocks/ERC20Mock");

const {expectRevert, expectEvent, BN, constants, time, balance} = require('@openzeppelin/test-helpers');

contract("Acct", async accounts => {
  let owner = accounts[0], notOwner = accounts[1], newOwner = accounts[2], acct, registry, token;

  beforeEach(async () => {
    acct = await Acct.new(owner);
    registry = await OwnerRegistry.new();
    token = await ERC20Mock.new("Test", "TEST", owner, 1000);
  });

  it("can withdraw ETH", async () => {
    await acct.withdrawETH(0);
    await acct.send(10);
    let oldBalance = await balance.current(owner);
    let tx = await acct.withdrawETH(3, {gasPrice: 0});
    let newBalance = await balance.current(owner);
    assert.equal(newBalance, parseInt(oldBalance) + 3);
    await acct.withdrawETH(7, {gasPrice: 0});
    assert.equal(newBalance, parseInt(oldBalance) + 10);
  });

  it("can withdraw-all ETH", async () => {
    await acct.send(10);
    let oldBalance = await balance.current(owner);
    await acct.withdrawETH(-1, {gasPrice: 0});
    let newBalance = await balance.current(owner);
    assert.equal(newBalance, parseInt(oldBalance) + 10);
  });

  it("can withdraw ERC20", async () => {
    await acct.withdrawERC20(token.address, 0);
    await token.transfer(acct.address, 10);
    await acct.withdrawERC20(token.address, 7);
    assert.equal(await token.balanceOf(owner), 997);
    await acct.withdrawERC20(token.address, 3);
    assert.equal(await token.balanceOf(owner), 1000);
  });

  it("can withdraw-all ERC20", async () => {
    await token.transfer(acct.address, 10);
    await acct.withdrawERC20(token.address, -1);
    assert.equal(await token.balanceOf(owner), 1000);
  });

  it("not owner cannot withdraw ETH", async () => {
    await expectRevert(acct.withdrawETH(0, {from: notOwner}), 'Ownable: caller is not the owner');
  });

  it("not owner cannot withdraw ERC20", async () => {
    await expectRevert(acct.withdrawERC20(token.address, 0, {from: notOwner}), 'Ownable: caller is not the owner');
  });

  it("withdraw ETH emits LogWithdraw", async () => {
    await acct.send(10);
    let tx = await acct.withdrawETH(7);
    expectEvent(tx, 'LogWithdraw', {_from: owner, _assetAddress: '0x0000000000000000000000000000000000000000', amount: new BN(7)});
  });

  it("withdraw-all ETH emits LogWithdraw", async () => {
    await acct.send(10);
    let tx = await acct.withdrawETH(-1);
    expectEvent(tx, 'LogWithdraw', {_from: owner, _assetAddress: '0x0000000000000000000000000000000000000000', amount: new BN(10)});
  });

  it("withdraw ERC20 emits LogWithdraw", async () => {
    await token.transfer(acct.address, 10);
    let tx = await acct.withdrawERC20(token.address, 7);
    expectEvent(tx, 'LogWithdraw', {_from: owner, _assetAddress: token.address, amount: new BN(7)});
  });

  it("withdraw-all ERC20 emits LogWithdraw", async () => {
    await token.transfer(acct.address, 10);
    let tx = await acct.withdrawERC20(token.address, -1);
    expectEvent(tx, 'LogWithdraw', {_from: owner, _assetAddress: token.address, amount: new BN(10)});
  });

  it("cannot withdraw ETH above balance", async () => {
    await expectRevert(acct.withdrawETH(1), 'Acct: transfer amount exceeds balance');
  });

  it("cannot withdraw ERC20 above balance", async () => {
    await expectRevert(acct.withdrawERC20(token.address, 1), 'Acct: transfer amount exceeds balance');
  });

  it("set unlock time emits LogTimeLock", async () => {
    let unlockTime = 10000;
    let tx = await acct.setUnlockTime(unlockTime);
    await expectEvent(tx, 'LogTimeLock', {_from: owner, oldTime: new BN(0), newTime: new BN(unlockTime)});
  });

  it("not owner cannot time-lock", async () => {
    await expectRevert(acct.setUnlockTime(10000, {from: notOwner}), 'Ownable: caller is not the owner');
  });

  it("owner can transfer ownership", async () => {
    await acct.transferOwnership(newOwner, {from: owner});
    assert.equal(await acct.owner(), newOwner);
  });

  it("owner can transfer ownership to registry", async () => {
    await acct.transferOwnershipToNFT(registry.address, {from: owner});
    assert.equal(await acct.owner(), registry.address);
    assert.equal(await registry.ownerOf(acct.address), owner);
  });

  it("not owner cannot transfer ownership", async () => {
    await expectRevert(acct.transferOwnership(newOwner, {from: notOwner}), 'Ownable: caller is not the owner');
  });

  it("not owner cannot transfer ownership to registry", async () => {
    await expectRevert(acct.transferOwnershipToNFT(registry.address, {from: notOwner}), 'Ownable: caller is not the owner');
  });

  context("when time-locked", async () => {
    let unlockTime;

    beforeEach(async () => {
      await acct.send(10);
      await token.transfer(acct.address, 10);
      unlockTime = (await time.latest()).add(time.duration.weeks(2));
      await acct.setUnlockTime(unlockTime);
    });

    it("cannot time-lock it again", async () => {
      await expectRevert(acct.setUnlockTime(unlockTime+1), 'Acct: time-locked');
      await expectRevert(acct.setUnlockTime(unlockTime-1), 'Acct: time-locked');
      await expectRevert(acct.setUnlockTime(0), 'Acct: time-locked');
    });

    it("cannot withdraw ETH", async () => {
      await expectRevert(acct.withdrawETH(0), 'Acct: time-locked');
    });

    it("cannot withdraw ERC20", async () => {
      await expectRevert(acct.withdrawERC20(token.address, 0), 'Acct: time-locked');
    });

    it("owner can still transfer ownership", async () => {
      await acct.transferOwnership(newOwner, {from: owner});
      assert.equal(await acct.owner(), newOwner);
    });

    it("owner can still transfer ownership to registry", async () => {
      await acct.transferOwnershipToNFT(registry.address, {from: owner});
      assert.equal(await acct.owner(), registry.address);
      assert.equal(await registry.ownerOf(acct.address), owner);
    });

    context("when unlock time is reached", async () => {
      beforeEach(async () => {
        await time.increaseTo(unlockTime);
      });

      it("can withdraw ETH", async () => {
        await acct.withdrawETH(0);
        await acct.withdrawETH(7);
        await acct.withdrawETH(3);
      });

      it("can withdraw ERC20", async () => {
        await acct.withdrawERC20(token.address, 0);
        await acct.withdrawERC20(token.address, 7);
        await acct.withdrawERC20(token.address, 3);
      });

      it("can time-lock it again", async () => {
        let newUnlockTime = unlockTime+10000;
        let tx = await acct.setUnlockTime(newUnlockTime);
        await expectEvent(tx, 'LogTimeLock', {_from: owner, oldTime: new BN(unlockTime), newTime: new BN(newUnlockTime)});
      });
    });
  });

});
