pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";


contract Option {

  address writer; // seller
  address holder; // buyer
  address depositContract; // ERC-20 contract for the deposit currency
  address settlementContract; // ERC-20 contract for the settlement currency
  uint256 depositAmount; // amount of deposit placed by the seller
  uint256 settlementAmount; // amount of settlement requested by the seller
  uint256 expiration; // time at which option expires

  // create a new option, sending in the parameters
  // The caller is the writer, by definition
  constructor(
    address _holder,
    address _depositContract,
    address _settlementContract,
    uint256 _depositAmount,
    uint256 _settlementAmount,
    uint256 _expiration) public {

    writer = msg.sender;
    holder = _holder;
    depositContract = _depositContract;
    settlementContract = _settlementContract;
    depositAmount = _depositAmount;
    settlementAmount = _settlementAmount;
    expiration = _expiration;
  }

  event Deposit(address sender, uint256 value);

  // Called by the writer (or other) to fund the option with the
  // deposit currency.
  // When the deposit currency is ETH it should be sent as the value.
  // When the deposit currency is ERC-20 it should be `approve`d for
  // the contract first.
  function deposit() public payable {
    if (depositContract == 0 ) {
      emit Deposit(msg.sender, msg.value);
    } else {
      ERC20 depositCurrency = ERC20(depositContract);
      uint256 allowance = depositCurrency.allowance(msg.sender, address(this));
      depositCurrency.transferFrom(msg.sender, address(this), allowance);
      emit Deposit(msg.sender, allowance);
    }
  }

  // called by the holder to give the settlement and take the deposit
  // requires that the option be fully deposited
  // and that the holder has made an allowance of the settlement currency
  function exercise() public {
    ERC20 settlementCurrency = ERC20(settlementContract);
    // Find out how many of the settlement tokens have been allowed by the holder
    uint256 allowance = settlementCurrency.allowance(holder, address(this));

    ERC20 depositCurrency = ERC20(depositContract);
    uint256 remainingDepositAmount = 0;
    
    // Find out how much of the deposit remains
    // ETH has no contract
    if (depositContract == 0 ) {
      remainingDepositAmount = address(this).balance;
    } else {
      remainingDepositAmount = depositCurrency.balanceOf(address(this));
    }

    uint256 exerciseAmount = allowance * remainingDepositAmount / settlementAmount;

    if (depositContract == 0 ) {
      // send the ETH to the holder
      holder.transfer(exerciseAmount);
    } else {
      // send the tokens to the holder
      depositCurrency.transfer(holder, exerciseAmount);
    }

    // send the tokens to the writer
    settlementCurrency.transferFrom(holder, writer, allowance);
  }
}
