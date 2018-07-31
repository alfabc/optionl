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

  function deposit() payable public {
    if (depositContract == 0 ) {
      emit Deposit(msg.sender, msg.value);
    } else {
      ERC20 depositCurrency = ERC20(depositContract);
      uint256 allowance = depositCurrency.allowance(msg.sender, address(this));
      depositCurrency.transferFrom(msg.sender, address(this), allowance);
      emit Deposit(msg.sender, allowance);
    }
  }

  function exercise() public {
    ERC20 settlementCurrency = ERC20(settlementContract);
    // Find out how many of the settlement tokens have been allowed by the holder
    uint256 allowance = settlementCurrency.allowance(holder, address(this));

    ERC20 depositCurrency = ERC20(depositContract);
    uint256 depositAmount = 0;
    
    // Find out how much of the deposit remains
    // ETH has no contract
    if (depositContract == 0 ) {
      depositAmount = address(this).balance;
    } else {
      depositAmount = depositCurrency.balanceOf(address(this));
    }

    uint256 exerciseAmount = allowance * depositAmount / settlementAmount;

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
