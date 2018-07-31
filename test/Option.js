/* eslint-env node, mocha */
/* eslint no-unused-expressions: 0 */
/* eslint prefer-const: 0 */
const Option = artifacts.require('../contracts/Option.sol');
const MockERC20 = artifacts.require('../contracts/mocks/MockERC20.sol');
const expectThrow = require('./helpers/expectThrow.js');
const BigNumber = require('bignumber.js');
const latestTime = require('./helpers/latest-time');
const { increaseTimeTo, duration } = require('./helpers/increase-time');
const should = require('chai') // eslint-disable-line no-unused-vars
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('Option', (accounts) => {
  const writer = accounts[0];
  const holder = accounts[1];
  const rando = accounts[2];

  before(async () => {
  });

  context('offer ETH for ERC20 token', () => {
    let option;
    let settlementCurrency;
    const deposit = new web3.BigNumber(web3.toWei(10, 'ether'));

    it('should set up ERC20 token', async () => {
      // allocate 10k tokens to the holder
      settlementCurrency = await MockERC20.new(holder, 10000);
      (await settlementCurrency.balanceOf(holder)).toNumber().should.be.equal(10000);
    });

    it('should allow writer to create option', async () => {
      // expires in 90 days
      const expiration = (await latestTime()) + duration.days(90);
      // writer deposits 10 ETH, expects 10000 tokens
      option = await Option.new(holder, 0, settlementCurrency.address, 10, 10000, expiration, { from: writer });
    });

    xit('should not allow exercise before deposit', async () => {
    });

    xit('should not accept a deposit of ETH greater than the depositAmount', async () => {
    });

    it('should allow writer to make deposit', async () => {
      // deposit 10 ETH
      await option.deposit({ value: deposit, from: writer });
      web3.eth.getBalance(option.address).should.be.bignumber.equal(deposit);
    });

    it('should allow holder to exercise option', async () => {
      await settlementCurrency.approve(option.address, 10000, { from: holder });
      const holderBalanceBefore = web3.eth.getBalance(holder);
      let result = await option.exercise({ from: holder });
      const tx = await web3.eth.getTransaction(result.tx);
      const gasCost = tx.gasPrice.mul(result.receipt.gasUsed);
      // ETH balance for the holder should have increased (minus gas costs)
      web3.eth.getBalance(holder).should.be.bignumber.equal(holderBalanceBefore.plus(deposit.minus(gasCost)));
      // token balances should have shifted
      (await settlementCurrency.balanceOf(holder)).toNumber().should.be.equal(0);
      (await settlementCurrency.balanceOf(writer)).toNumber().should.be.equal(10000);
    });

    xit('should not be able to exceed the option', async () => {
    });
  });

  context('offer ERC20 tokens for ERC20 tokens', () => {
    let depositCurrency;
    let settlementCurrency;
    let option;

    it('should set up ERC20 tokens', async () => {
      // allocate 5k tokens to the writer
      depositCurrency = await MockERC20.new(writer, 5000);
      (await depositCurrency.balanceOf(writer)).toNumber().should.be.equal(5000);
      // allocate 8k tokens to the holder
      settlementCurrency = await MockERC20.new(holder, 8000);
      (await settlementCurrency.balanceOf(holder)).toNumber().should.be.equal(8000);
    });

    it('should allow writer to create option', async () => {
      // expires in 30 days
      const expiration = (await latestTime()) + duration.days(30);
      // writer deposits 5k token A, expects 8k token B
      option = await Option.new(holder, depositCurrency.address, settlementCurrency.address, 5000, 8000, expiration, { from: writer });
    });

    it('should allow writer to make deposit', async () => {
      // deposit 5000 token A
      await depositCurrency.approve(option.address, 5000, { from: writer });
      await option.deposit({ from: writer });
      (await depositCurrency.balanceOf(option.address)).toNumber().should.be.equal(5000);
    });

    // holder approves ERC20
    it('should let holder approve ERC20', async () => {
      // just a test case for convenience -- needs to be before next two cases
      await settlementCurrency.approve(option.address, 8000, { from: holder });
    });

    it('should not let anyone but holder to exercise', async () => {
      await expectThrow(option.exercise({ from: writer }));
      await expectThrow(option.exercise({ from: rando }));
    });

    it('should allow the holder to exercise the option', async () => {
      await option.exercise({ from: holder });
      // token balances should have shifted
      (await depositCurrency.balanceOf(option.address)).toNumber().should.be.equal(0);
      (await depositCurrency.balanceOf(writer)).toNumber().should.be.equal(0);
      (await depositCurrency.balanceOf(holder)).toNumber().should.be.equal(5000);
      (await settlementCurrency.balanceOf(writer)).toNumber().should.be.equal(8000);
      (await settlementCurrency.balanceOf(holder)).toNumber().should.be.equal(0);
    });

    xit('should not be able to get the money back again', async () => {
    });
  });

  context('multi-part ETH deposit', () => {
    xit('should allow non-writer to make ETH deposit', async () => {
    });

    xit('should allow writer to make ETH deposit', async () => {
    });

    xit('should reject ETH in excess of depositAmount', async () => {
    });
  });

  context('multi-part ERC20 deposit', () => {
    xit('should allow non-writer to make ERC20 deposit', async () => {
    });

    xit('should allow writer to make ERC20 deposit', async () => {
    });

    xit('should not take a deposit allowance larger than the depositAmount', async () => {
    });

    xit('should not allow writer to send ETH with ERC20 deposit', async () => {
    });
  });

  context('do not allow ETH deposit for uninitialized contract', () => {
    // specifically necessary for the first deployed contract
    // which will have all 0 parameters
    xit('should reject ETH value when not contract not initialized properly', async () => {
    });

    xit('should reject deposit call for uninitialized contract', async () => {
    });
  });

  context('send ETH deposit with constructor', () => {
    xit('it should allow ETH sent in constructor', async () => {
    });

    xit('it should not allow ETH for ERC20 deposits', async () => {
    });

    xit('it should update state accordingly', async () => {
    });
  });

  context('send ERC20 deposit with transfer', () => {
    xit('it should allow deposit through transfer', async () => {
    });
  });

  context('send ERC20 before exercise with transfer', () => {
    xit('it should allow deposit through transfer', async () => {
    });
  });

  context('deposit should not take more than the settlementAmount when the ETH sent exceeds it', () => {
    // should check existing balance in mult-part deposit scenario
  });

  context('deposit should not take more than the settlementAmount when the ERC20 allowance exceeds it', () => {
    // should check existing balance in mult-part deposit scenario
  });

  context('exercise should not take more than the settlementAmount when the ERC20 allowance exceeds it', () => {
    // should check existing balance in mult-part deposit scenario

    // allow for existing ERC20 balance through transfer instead of allowance
  });

  context('option expires before deposit complete', () => {
    xit('should allow writer to recover funds', async () => {
    });
  });

  context('totally expired option', () => {
    xit('should allow writer to recover unexercised funds', async () => {
    });
  });

  context('partially exercised option which expires', () => {
    xit('should allow writer to recover unexercised funds', async () => {
    });
  });

  context('partially funded option', () => {
    xit('should allow writer to cancel', async () => {
    });
  });

  context('check for numerical and rounding difficulties', () => {
    xit('should handle zero settlement amount', async () => {
      // settlementAmount = 3
    });

    xit('should handle remainders', async () => {
      // allowance = 1, depositAmount = 2, settlementAmount = 3
    });
  });
});
