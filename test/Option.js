/* eslint-env node, mocha */
/* eslint no-unused-expressions: 0 */
/* eslint prefer-const: 0 */
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

contract('Option', (accounts) => {
  const writer = accounts[0];
  const holder = accounts[1];
  const rando = accounts[2];
  const tenETH = new web3.BigNumber(web3.toWei(10, 'ether'));

  context('offer ETH for ERC20 token', () => {
    let option;
    let settlementToken;
    const deposit = tenETH;

    it('should set up ERC20 token', async () => {
      // allocate 11k tokens to the holder; 10k for the settlement,
      // another 1k for test
      settlementToken = await MockERC20.new(holder, 11000);
      (await settlementToken.balanceOf(holder)).toNumber().should.be.equal(11000);
    });

    it('should allow writer to create option', async () => {
      // expires in 90 days
      const expiration = (await latestTime()) + duration.days(90);
      // writer deposits 10 ETH, expects 10000 tokens
      option = await Option.new(holder, 0, settlementToken.address, deposit, 10000, expiration, { from: writer });
      (await option.writer()).should.be.eq(writer);
      (await option.holder()).should.be.eq(holder);
      web3.toBigNumber(await option.depositContract()).isZero().should.be.true;
      (await option.settlementContract()).should.be.eq(settlementToken.address);
      (await option.depositAmount()).should.be.bignumber.equal(deposit);
      (await option.settlementAmount()).toNumber().should.be.eq(10000);
      (await option.expiration()).toNumber().should.be.eq(expiration);
      (await option.funded()).should.be.false;
    });

    it('should not allow exercise before deposit', async () => {
      await expectThrow(option.exercise({ from: holder }));
    });

    it('should not accept a deposit of ETH greater than the depositAmount', async () => {
      await expectThrow(option.deposit({ value: deposit.mul(2), from: writer }));
    });

    it('should allow writer to make deposit', async () => {
      // deposit 5 ETH
      await option.deposit({ value: deposit.div(2), from: writer });
      web3.eth.getBalance(option.address).should.be.bignumber.equal(deposit.div(2));
    });

    it('should reject ETH in excess of depositAmount', async () => {
      // attempt to deposit 10 eth
      await expectThrow(option.deposit({ value: deposit, from: rando }));
    });

    it('should allow non-writer to make ETH deposit', async () => {
      // deposit another 5 ETH to complete deposit
      await option.deposit({ value: deposit.div(2), from: rando });
      web3.eth.getBalance(option.address).should.be.bignumber.equal(deposit);
    });

    it('should not allow overdeposit', async () => {
      await expectThrow(option.deposit({ value: deposit, from: writer }));
      web3.eth.getBalance(option.address).should.be.bignumber.equal(deposit);
    });

    it('should allow holder to exercise option', async () => {
      await settlementToken.approve(option.address, 10000, { from: holder });
      const holderBalanceBefore = web3.eth.getBalance(holder);
      let result = await option.exercise({ from: holder });
      const tx = await web3.eth.getTransaction(result.tx);
      const gasCost = tx.gasPrice.mul(result.receipt.gasUsed);
      // ETH balance for the holder should have increased (minus gas costs)
      web3.eth.getBalance(holder).should.be.bignumber.equal(holderBalanceBefore.plus(deposit.minus(gasCost)));
      // token balances should have shifted
      (await settlementToken.balanceOf(holder)).toNumber().should.be.equal(1000);
      (await settlementToken.balanceOf(writer)).toNumber().should.be.equal(10000);
    });

    it('should not be able to exceed the option', async () => {
      await settlementToken.approve(option.address, 1000, { from: holder });
      await expectThrow(option.exercise({ from: holder }));
    });
  });

  context('simple test of ERC20 tokens for ERC20 tokens', () => {
    let depositToken, settlementToken, expiration, option; // eslint-disable-line one-var, one-var-declaration-per-line

    beforeEach(async () => {
      depositToken = await MockERC20.new(writer, 1000);
      settlementToken = await MockERC20.new(holder, 2000);
      expiration = (await latestTime()) + duration.days(30);
      option = await Option.new(holder, depositToken.address, settlementToken.address, 1000, 2000, expiration, { from: writer });
      (await option.writer()).should.be.eq(writer);
      (await option.holder()).should.be.eq(holder);
      (await option.depositContract()).should.be.eq(depositToken.address);
      (await option.settlementContract()).should.be.eq(settlementToken.address);
      (await option.depositAmount()).toNumber().should.be.eq(1000);
      (await option.settlementAmount()).toNumber().should.be.eq(2000);
      (await option.expiration()).toNumber().should.be.eq(expiration);
      (await option.funded()).should.be.false;
    });

    it('should work with only ERC20.approve', async () => {
      await depositToken.approve(option.address, 1000, { from: writer });
      await option.deposit({ from: writer });
      await settlementToken.approve(option.address, 2000, { from: holder });
      await option.exercise({ from: holder });
    });

    it('should work with only ERC20.transfer', async () => {
      await depositToken.transfer(option.address, 1000, { from: writer });
      await option.deposit({ from: writer });
      await settlementToken.transfer(option.address, 2000, { from: holder });
      await option.exercise({ from: holder });
    });

    afterEach(async () => {
      (await depositToken.balanceOf(writer)).toNumber().should.be.equal(0);
      (await depositToken.balanceOf(holder)).toNumber().should.be.equal(1000);
      (await settlementToken.balanceOf(writer)).toNumber().should.be.equal(2000);
      (await settlementToken.balanceOf(holder)).toNumber().should.be.equal(0);
    });
  });

  context('complex test of ERC20 tokens for ERC20 tokens', () => {
    let depositToken;
    let settlementToken;
    let option;

    it('should set up ERC20 tokens', async () => {
      // allocate 6k tokens to the writer
      depositToken = await MockERC20.new(writer, 6000);
      (await depositToken.balanceOf(writer)).toNumber().should.be.equal(6000);
      // writer gives 2k tokens to rando
      await depositToken.transfer(rando, 2000, { from: writer });
      // allocate 8k tokens to the holder
      settlementToken = await MockERC20.new(holder, 8000);
      (await settlementToken.balanceOf(holder)).toNumber().should.be.equal(8000);
    });

    it('should allow writer to create option', async () => {
      // expires in 30 days
      const expiration = (await latestTime()) + duration.days(30);
      // writer deposits 5k token A, expects 8k token B
      option = await Option.new(holder, depositToken.address, settlementToken.address, 5000, 8000, expiration, { from: writer });
      (await option.funded()).should.be.false;
    });

    it('should not allow writer to send ETH with ERC20 deposit', async () => {
      await expectThrow(option.deposit({ value: 10000, from: writer }));
      (await option.funded()).should.be.false;
    });

    it('should allow writer to deposit with ERC20.approve', async () => {
      // deposit 1000 token A
      await depositToken.approve(option.address, 1000, { from: writer });
      await option.deposit({ from: writer });
      (await option.funded()).should.be.false;
      (await depositToken.balanceOf(option.address)).toNumber().should.be.equal(1000);
    });

    it('should allow for deposit of funds sent via ERC20.transfer', async () => {
      // deposit 1000 token A
      await depositToken.transfer(option.address, 1000, { from: rando });
      (await depositToken.balanceOf(option.address)).toNumber().should.be.equal(2000);
    });

    it('should allow non-writer to deposit with ERC20.approve', async () => {
      // deposit 1000 token A
      await depositToken.approve(option.address, 1000, { from: rando });
      await option.deposit({ from: rando });
      (await option.funded()).should.be.false;
      (await depositToken.balanceOf(option.address)).toNumber().should.be.equal(3000);
    });

    it('should only take remaining depositAmount from allowance', async () => {
      // deposit 3000 token A, of which only 2000 should be taken
      await depositToken.approve(option.address, 3000, { from: writer });
      (await option.funded()).should.be.false;
      await option.deposit({ from: writer });
      (await option.funded()).should.be.true;
      (await depositToken.balanceOf(option.address)).toNumber().should.be.equal(5000);
      // writer should have an outstanding balance of 1000 token A
      (await depositToken.balanceOf(writer)).toNumber().should.be.equal(1000);
      // writer should have an outstanding allowance of 1000 token A
      (await depositToken.allowance(writer, option.address)).toNumber().should.be.equal(1000);
    });

    it('should not allow excess deposit via ERC20.approve', async () => {
      // deposit 1000 token A
      await depositToken.approve(option.address, 1000, { from: writer });
      await expectThrow(option.deposit({ from: writer }));
      (await depositToken.balanceOf(option.address)).toNumber().should.be.equal(5000);
    });

    it('should let holder send via ERC20.transfer', async () => {
      await settlementToken.transfer(option.address, 3000, { from: holder });
    });

    it('should let holder send via ERC20.approve', async () => {
      await settlementToken.approve(option.address, 5000, { from: holder });
    });

    it('should not let anyone but holder to exercise', async () => {
      await expectThrow(option.exercise({ from: writer }));
      await expectThrow(option.exercise({ from: rando }));
    });

    it('should allow the holder to exercise the option', async () => {
      await option.exercise({ from: holder });
      // token balances should have shifted
      (await depositToken.balanceOf(option.address)).toNumber().should.be.equal(0);
      (await depositToken.balanceOf(writer)).toNumber().should.be.equal(1000);
      (await depositToken.balanceOf(holder)).toNumber().should.be.equal(5000);
      (await settlementToken.balanceOf(writer)).toNumber().should.be.equal(8000);
      (await settlementToken.balanceOf(holder)).toNumber().should.be.equal(0);
    });
  });

  context('do not allow ETH deposit for uninitialized contract', () => {
    // specifically necessary for the first deployed contract
    // which will have all 0 parameters
    it('should reject ETH value when contract not initialized properly', async () => {
      // send ETH with constructor
      await expectThrow(Option.new(0, 0, 0, 0, 0, 0, { from: writer, value: tenETH }));
    });

    it('should reject deposit call for uninitialized contract', async () => {
      // send ETH with deposit
      let option = await Option.new(0, 0, 0, 0, 0, 0, { from: writer });
      await expectThrow(option.deposit({ from: writer, value: tenETH }));
      (await option.writer()).should.be.eq(writer);
      web3.toBigNumber(await option.holder()).isZero().should.be.true;
      web3.toBigNumber(await option.depositContract()).isZero().should.be.true;
      web3.toBigNumber(await option.settlementContract()).isZero().should.be.true;
      (await option.depositAmount()).isZero().should.be.true;
      (await option.settlementAmount()).isZero().should.be.true;
      (await option.expiration()).isZero().should.be.true;
      (await option.funded()).should.be.false;
    });
  });

  context('send ETH deposit with constructor', () => {
    let settlementToken;
    let expiration;

    it('it should allow ETH sent in constructor', async () => {
      settlementToken = await MockERC20.new(holder, 1000);
      expiration = (await latestTime()) + duration.days(30);
      let option = await Option.new(holder, 0, settlementToken.address, tenETH, 100, expiration, { from: writer, value: tenETH });
      await settlementToken.approve(option.address, 100, { from: holder });
      await option.exercise({ from: holder });
    });

    it('but it should allow *excess* ETH sent in constructor', async () => {
      await expectThrow(Option.new(holder, 0, settlementToken.address, tenETH, 100, expiration, { from: writer, value: tenETH.mul(2) }));
    });

    it('nor should it allow ETH sent in constructor when deposit currency is ERC20', async () => {
      let depositToken = await MockERC20.new(writer, 1000);
      await expectThrow(Option.new(holder, depositToken.address, settlementToken.address, 100, 100, expiration, { from: writer, value: tenETH }));
    });
  });

  context('expired ERC20/ERC20 option', () => {
    let depositToken, settlementToken, theNow, expiration, option; // eslint-disable-line one-var, one-var-declaration-per-line
    beforeEach(async () => {
      depositToken = await MockERC20.new(writer, 1000);
      settlementToken = await MockERC20.new(holder, 2000);
      theNow = (await latestTime());
      expiration = theNow + duration.days(30);
      option = await Option.new(holder, depositToken.address, settlementToken.address, 1000, 2000, expiration, { from: writer });
      await depositToken.transfer(option.address, 1000, { from: writer });
    });

    it('should not allow deposit after expiration', async () => {
      await increaseTimeTo(theNow + duration.days(31));
      await expectThrow(option.deposit({ from: writer }));
    });

    it('should not allow exercise after expiration', async () => {
      await option.deposit({ from: writer });
      await settlementToken.transfer(option.address, 2000, { from: holder });
      await increaseTimeTo(theNow + duration.days(31));
      await expectThrow(option.exercise({ from: holder }));
    });

    it('should allow writer to recover all funds when no exercise', async () => {
      await option.deposit({ from: writer });
      // must be expired
      await expectThrow(option.recoverDeposit({ from: writer }));
      (await depositToken.balanceOf(writer)).toNumber().should.be.equal(0);
      await increaseTimeTo(expiration + 1);
      // must be sent by writer
      await expectThrow(option.recoverDeposit({ from: holder }));
      await option.recoverDeposit({ from: writer });
      (await depositToken.balanceOf(writer)).toNumber().should.be.equal(1000);
    });

    it('should allow writer to recover only the unexercised funds when partial exercise', async () => {
      await option.deposit({ from: writer });
      await settlementToken.transfer(option.address, 1000, { from: holder });
      await option.exercise({ from: holder });
      await increaseTimeTo(expiration + 1);
      await option.recoverDeposit({ from: writer });
      (await depositToken.balanceOf(writer)).toNumber().should.be.equal(500);
    });
  });

  context('expired ETH/ERC20 option', () => {
    let settlementToken, theNow, expiration, option; // eslint-disable-line one-var, one-var-declaration-per-line
    beforeEach(async () => {
      settlementToken = await MockERC20.new(holder, 2000);
      theNow = (await latestTime());
      expiration = theNow + duration.days(30);
      option = await Option.new(holder, 0, settlementToken.address, tenETH, 2000, expiration, { from: writer, value: tenETH });
    });

    it('should allow writer to recover all funds when no exercise', async () => {
      // must be expired
      await expectThrow(option.recoverDeposit({ from: writer }));
      await increaseTimeTo(expiration + 1);
      const writerBalanceBefore = web3.eth.getBalance(writer);
      const result = await option.recoverDeposit({ from: writer });
      const tx = await web3.eth.getTransaction(result.tx);
      const gasCost = tx.gasPrice.mul(result.receipt.gasUsed);
      // ETH balance for the writer should have increased (minus gas costs)
      web3.eth.getBalance(writer).should.be.bignumber.equal(writerBalanceBefore.plus(tenETH.minus(gasCost)));
    });

    it('should allow writer to recover only the unexercised funds when partial exercise', async () => {
      await settlementToken.transfer(option.address, 1000, { from: holder });
      await option.exercise({ from: holder });
      await expectThrow(option.recoverDeposit({ from: writer }));
      await increaseTimeTo(expiration + 1);
      await option.recoverDeposit({ from: writer });
    });
  });

  context('transfer ownership', () => {
    let depositToken, settlementToken, expiration, option; // eslint-disable-line one-var, one-var-declaration-per-line
    beforeEach(async () => {
      depositToken = await MockERC20.new(writer, 1000);
      settlementToken = await MockERC20.new(holder, 2000);
      expiration = (await latestTime()) + duration.days(30);
      option = await Option.new(holder, depositToken.address, settlementToken.address, 1000, 2000, expiration, { from: writer });
      await depositToken.transfer(option.address, 1000, { from: writer });
      await option.deposit({ from: writer });
      (await option.funded()).should.be.true;
    });

    it('should allow writer to set a new writer, who gets deposit on expiration', async () => {
      // writer assigns new writer
      await option.setWriter(rando, { from: writer });
      // expire the option
      await increaseTimeTo(expiration + 1);
      // original writer no longer gets deposit as is no longer the writer
      await expectThrow(option.recoverDeposit({ from: writer }));
      // new writer recovers the deposit
      await option.recoverDeposit({ from: rando });
      // new (not old) writer should have the deposit
      (await depositToken.balanceOf(writer)).toNumber().should.be.equal(0);
      (await depositToken.balanceOf(rando)).toNumber().should.be.equal(1000);
    });

    it('should not allow non-writer to set a new writer', async () => {
      await expectThrow(option.setWriter(rando, { from: rando }));
    });

    // Holder exercises 25%, transfers to other, who exercises 50%;
    // holder tries again, fails, then other exercises remaining 25%.
    it('should allow holder, after exercise, to set a new holder, who can exercise', async () => {
      // partially exercise
      await settlementToken.approve(option.address, 500, { from: holder });
      await option.exercise({ from: holder });
      (await depositToken.balanceOf(holder)).toNumber().should.be.equal(250);
      (await depositToken.balanceOf(option.address)).toNumber().should.be.equal(750);
      await option.setHolder(rando, { from: holder });
      // (send rando some of the token they need for settlement)
      await settlementToken.transfer(rando, 1000, { from: holder });
      // rando exercises some
      await settlementToken.approve(option.address, 1000, { from: rando });
      await option.exercise({ from: rando });
      (await depositToken.balanceOf(option.address)).toNumber().should.be.equal(250);
      (await depositToken.balanceOf(rando)).toNumber().should.be.equal(500);
      // now the original holder tries to execute again, but fails
      await settlementToken.approve(option.address, 500, { from: holder });
      await expectThrow(option.exercise({ from: holder }));
      // (send the rando the rest of the tokens needed)
      await settlementToken.transfer(rando, 500, { from: holder });
      // rando does final exercise
      await settlementToken.approve(option.address, 500, { from: rando });
      await option.exercise({ from: rando });
      (await depositToken.balanceOf(option.address)).toNumber().should.be.equal(0);
      (await depositToken.balanceOf(rando)).toNumber().should.be.equal(750);
      (await depositToken.balanceOf(holder)).toNumber().should.be.equal(250);
      (await depositToken.balanceOf(writer)).toNumber().should.be.equal(0);
      (await settlementToken.balanceOf(writer)).toNumber().should.be.equal(2000);
    });

    it('should not allow non-holder to set a new holder', async () => {
      await expectThrow(option.setHolder(rando, { from: rando }));
    });
  });

  context('cancellation of option by writer', () => {
    xit('should allow writer to recover funds when holder not set', async () => {
    });

    xit('should allow writer to cancel option when writer is also holder', async () => {
    });

    xit('should not allow writer to recover funds from incomplete deposit unless expired', async () => {
    });

    xit('should allow writer to recover funds when option expires before deposit complete', async () => {
    });
  });

  context('numerical and rounding considerations', () => {
    xit('should handle zero settlement amount', async () => {
      // settlementAmount = 3
    });

    // TBD would a strike price instead of a settlementAmount avoid this?
    xit('should handle remainders', async () => {
      // allowance = 1, depositAmount = 2, settlementAmount = 3
    });
  });
});
