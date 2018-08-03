pragma solidity ^0.4.23;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";


contract Option {

  address writer; // seller
  address holder; // buyer
  ERC20 depositContract; // ERC-20 contract for the deposit currency
  ERC20 settlementContract; // ERC-20 contract for the settlement currency
  uint256 depositAmount; // amount of deposit placed by the seller
  uint256 settlementAmount; // amount of settlement requested by the seller
  uint256 expiration; // time at which option expires
  bool funded;

  // create a new option, sending in the parameters
  // The caller is the writer, by definition
  constructor(
    address _holder,
    ERC20 _depositContract,
    ERC20 _settlementContract,
    uint256 _depositAmount,
    uint256 _settlementAmount,
    uint256 _expiration) public payable {

    writer = msg.sender;
    holder = _holder;
    depositContract = _depositContract;
    settlementContract = _settlementContract;
    depositAmount = _depositAmount;
    settlementAmount = _settlementAmount;
    expiration = _expiration;
    funded = false;

    if (msg.value > 0) {
      deposit();
    }
  }

  // Called by the writer (or anyone) to fund the option with the
  // deposit currency.
  // When the deposit currency is ETH it should be sent as the value.
  // When the deposit currency is ERC-20 it should be `approve`d for
  // the contract first.
  function deposit() public payable {
    require(!funded, "already funded");

    // Note: block timestamps are potentially manipulable
    require(expiration > block.timestamp, "expired"); // solium-disable-line security/no-block-members

    uint256 newBalance;

    if (depositContract == ERC20(0)) {
      require(address(this).balance <= depositAmount, "depositAmount exceeded");
      newBalance = address(this).balance;
    } else {
      require(msg.value == 0, "ERC20 only depositContract");
      uint256 allowance = depositContract.allowance(msg.sender, address(this));
      // Get the current deposit, which may include ERC20.transfer amounts
      // (not recommended, but not preventable)
      newBalance = depositContract.balanceOf(address(this));
      // Transfer whatever remains to be deposited from the allowance
      uint256 transferAmount = (allowance < (depositAmount - newBalance)) ? allowance : (depositAmount - newBalance); // `MIN`
      depositContract.transferFrom(msg.sender, address(this), transferAmount);
      // new balance after transfer
      newBalance = depositContract.balanceOf(address(this));
    }

    if (newBalance == depositAmount) {
      funded = true;
    }
  }

  // called by the holder to give the settlement and take the deposit
  // requires that the option be fully deposited
  // and that the holder has made an allowance of the settlement currency
  function exercise() public {
    require(funded, "not funded");

    // Note: block timestamps are potentially manipulable
    require(expiration > block.timestamp, "expired"); // solium-disable-line security/no-block-members

    // Only holder may call
    require(msg.sender == holder, "Sender not authorized");

    uint256 remainingDepositAmount = 0;
    
    // Find out how much of the deposit remains
    // ETH has no contract
    if (depositContract == ERC20(0)) {
      remainingDepositAmount = address(this).balance;
    } else {
      remainingDepositAmount = depositContract.balanceOf(address(this));
    }

    require(remainingDepositAmount > 0, "already exercised");

    // Find out how many of the settlement tokens have been allowed by the holder
    uint256 allowance = settlementContract.allowance(holder, address(this));
    uint256 balance = settlementContract.balanceOf(address(this));
    uint256 exerciseAmount = (allowance + balance) * remainingDepositAmount / settlementAmount;

    if (depositContract == ERC20(0)) {
      // send the ETH to the holder
      holder.transfer(exerciseAmount);
    } else {
      // send the tokens to the holder
      depositContract.transfer(holder, exerciseAmount);
    }

    // send the tokens to the writer
    if (allowance > 0) {
      settlementContract.transferFrom(holder, writer, allowance);
    }
    if (balance > 0) {
      settlementContract.transfer(writer, balance);
    }
  }

  // called by the writer to recover deposited funds after expiration
  function recoverDeposit() public {
    require(msg.sender == writer, "Sender not authorized");

    // Note: block timestamps are potentially manipulable
    require(expiration <= block.timestamp, "not expired"); // solium-disable-line security/no-block-members

    // Return the remaining deposit
    // ETH has no contract
    if (depositContract == ERC20(0)) {
      writer.transfer(address(this).balance);
    } else {
      depositContract.transfer(writer, depositContract.balanceOf(address(this)));
    }
  }
}
