/* eslint-env node, mocha */
/* eslint no-unused-expressions: 0 */
/* eslint prefer-const: 0 */
const HolderProxy = artifacts.require('../contracts/HolderProxy.sol');
const Option = artifacts.require('../contracts/Option.sol');
const MockERC20 = artifacts.require('../contracts/mocks/MockERC20.sol');
const expectThrow = require('./helpers/expectThrow.js');
const BigNumber = require('bignumber.js');
const latestTime = require('./helpers/latest-time');
const { increaseTimeTo, duration } = require('./helpers/increase-time'); // eslint-disable-line no-unused-vars
const should = require('chai') // eslint-disable-line no-unused-vars
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('Holder', (accounts) => {
  const writer = accounts[0];
  const holder = accounts[1];
  const buyer = accounts[2];
  const rando = accounts[3];
  const tenETH = new web3.BigNumber(web3.toWei(10, 'ether'));
  const oneETH = new web3.BigNumber(web3.toWei(1, 'ether'));
  let expiration;

  before(async () => {
    expiration = (await latestTime()) + duration.days(30);
  });

  context('sell transfer with ETH', () => {
    let holderProxy;
    let option;
    let settlementToken;

    it('should create option', async () => {
      settlementToken = await MockERC20.new(holder, 1000);
      option = await Option.new(holder, 0, settlementToken.address, tenETH, 1000, expiration, { from: writer, value: tenETH });
    });

    it('should create holder proxy', async () => {
      holderProxy = await HolderProxy.new({ from: holder });
    });

    it('should not allow non-holder to set a price', async () => {
      await expectThrow(holderProxy.setTransferPrice( 0, tenETH, { from: rando }));
    });

    it('should allow holder to set a price', async () => {
      await holderProxy.setTransferPrice( 0, tenETH.plus(oneETH), { from: holder });
    });

    it('should not allow non-holder to set the option', async () => {
      await expectThrow(holderProxy.setOption( option.address, { from: rando }));
    });

    it('should allow holder to set the option', async () => {
      await holderProxy.setOption( option.address, { from: holder });
    });

    it('should allow holder to set the option holder', async () => {
      await option.setHolder(holderProxy.address, { from: holder });
      (await option.holder()).should.be.eq(holderProxy.address);
    });

    it('should allow anyone to query currency, price, and option', async () => {
      web3.toBigNumber(await holderProxy.settlementContract()).isZero().should.be.true;
      (await holderProxy.settlementAmount()).should.be.bignumber.equal(tenETH.plus(oneETH));
    });

    it('should not allow buyer to take posession with insufficient funds', async () => {
      await expectThrow(holderProxy.buy({ value: tenETH, from: buyer }));
      (await option.holder()).should.be.eq(holderProxy.address);
    });

    it('should allow buyer to take posession', async () => {
      await holderProxy.buy({ value: tenETH.plus(oneETH), from: buyer });
      (await option.holder()).should.be.eq(buyer);
    });
  });

  context('sell transfer with ERC20', () => {
    let holderProxy;
    let option;
    let saleToken;
    let settlementToken;

    it('should create option', async () => {
      settlementToken = await MockERC20.new(holder, 10);
      saleToken = await MockERC20.new(buyer, 1100);
      option = await Option.new(holder, 0, settlementToken.address, tenETH, 1000, expiration, { from: writer, value: tenETH });
    });

    it('should create holder proxy', async () => {
      holderProxy = await HolderProxy.new({ from: holder });
    });

    it('should allow holder to set a price', async () => {
      holderProxy.setTransferPrice(saleToken.address, 1000, { from: holder });
    });

    it('should allow holder to set the option', async () => {
      await holderProxy.setOption( option.address, { from: holder });
    });

    it('should allow holder to set the option holder', async () => {
      await option.setHolder(holderProxy.address, { from: holder });
      (await option.holder()).should.be.eq(holderProxy.address);
    });

    it('should not allow buyer to send ETH instead of ERC20', async () => {
      await expectThrow(holderProxy.buy({ from: buyer, value: tenETH }));
      (await option.holder()).should.be.eq(holderProxy.address);
    });

    it('should not allow buyer to take posession with insufficient funds', async () => {
      await saleToken.approve(holderProxy.address, 900, { from: buyer });
      await expectThrow(holderProxy.buy({ from: buyer }));
      (await option.holder()).should.be.eq(holderProxy.address);
    });

    it('should allow buyer to take posession with ERC20 allowance', async () => {
      await saleToken.approve(holderProxy.address, 1000, { from: buyer });
      await holderProxy.buy({ from: buyer });
      (await option.holder()).should.be.eq(buyer);
    });

    it('should allow recycling!', async () => {
      // But really, the holder should be able to re-use a HolderProxy
      // for different options contracts.
      // Here, buyer gives everything back manually.
      await option.setHolder(holderProxy.address, { from: buyer });
      (await option.holder()).should.be.eq(holderProxy.address);
      await saleToken.transfer(buyer, 1000, { from: holder });
    });

    it('should allow buyer to take posession with ERC20 transfer', async () => {
      await saleToken.transfer(holderProxy.address, 1000, { from: buyer });
      await holderProxy.buy({ from: buyer });
      (await option.holder()).should.be.eq(buyer);
    });

    it('should not take more of ERC20 allowance than price', async () => {
      // reset again
      await option.setHolder(holderProxy.address, { from: buyer });
      await saleToken.transfer(buyer, 1000, { from: holder });
      // approve 1100
      await saleToken.approve(holderProxy.address, 1100, { from: buyer });
      // execute
      await holderProxy.buy({ from: buyer });
      (await option.holder()).should.be.eq(buyer);
      (await saleToken.balanceOf(holder)).toNumber().should.be.eq(1000);
      (await saleToken.balanceOf(buyer)).toNumber().should.be.eq(100);
    });

    it('should not take more of ERC20 transfer balance than price', async () => {
      // reset again
      await option.setHolder(holderProxy.address, { from: buyer });
      await saleToken.transfer(buyer, 1000, { from: holder });
      // transfer 1100
      await saleToken.transfer(holderProxy.address, 1100, { from: buyer });
      // fails because an allowance still exists from the last one.
      // This tests that you can't have a mixture of allowances and transfers.
      await expectThrow(holderProxy.buy({ from: buyer }));
      // clear out pending approval
      await saleToken.approve(holderProxy.address, 0, { from: buyer });
      // succeeds
      await holderProxy.buy({ from: buyer });
      (await option.holder()).should.be.eq(buyer);
      (await saleToken.balanceOf(holder)).toNumber().should.be.eq(1000);
      (await saleToken.balanceOf(holderProxy.address)).toNumber().should.be.eq(100);
    });
  });
});

