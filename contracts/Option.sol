pragma solidity ^0.4.23;

import "./OptionInterface.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";


contract Option is OptionInterface {

  address public writer; // seller
  address public holder; // buyer
  ERC20 public depositContract; // ERC-20 contract for the deposit currency
  ERC20 public settlementContract; // ERC-20 contract for the settlement currency
  uint256 public depositAmount; // amount of deposit placed by the seller
  uint256 public settlementAmount; // amount of settlement requested by the seller
  uint256 public expiration; // time at which option expires
  bool public funded;

  // error messages
  string constant EXPIRED = "expired";
  string constant SENDER_NOT_AUTHORIZED = "Sender not authorized";

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
      depositInternal();
    }
  }

  function setWriter(address newWriter) external {
    require(writer == msg.sender, "writer only");
    writer = newWriter;
  }

  function setHolder(address newHolder) external {
    require(holder == msg.sender, "holder only");
    holder = newHolder;
  }

  // Called by the writer (or anyone) to fund the option with the
  // deposit currency.
  function deposit() external payable {
    depositInternal();
  }

  // called by the holder to give the settlement and take the deposit
  // requires that the option be fully deposited
  // and that the holder has made an allowance of the settlement currency
  function exercise() external {
    require(funded, "not funded");

    // Note: block timestamps are potentially manipulable
    require(expiration > block.timestamp, EXPIRED); // solium-disable-line security/no-block-members

    // Only holder may call
    require(msg.sender == holder, "SENDER_NOT_AUTHORIZED ");

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
    // may also have been sent in with ERC20 transfer (held in contract balance)
    // (not recommended, but unfortunately not preventable with ERC20)
    uint256 balance = settlementContract.balanceOf(address(this));

    // The amount exercised is the sum of those two, times the "strike price"
    uint256 exerciseAmount = (allowance + balance) * depositAmount / settlementAmount;

    // The holder gets the proportional amount of the deposit
    if (depositContract == ERC20(0)) {
      // send the ETH to the holder
      holder.transfer(exerciseAmount);
    } else {
      // send the tokens to the holder
      depositContract.transfer(holder, exerciseAmount);
    }

    // The writer gets the exercise amount from two possible places
    // ERC20 allowance, transfered from the holder's allowance
    if (allowance > 0) {
      settlementContract.transferFrom(holder, writer, allowance);
    }
    // ERC20 transfer, transferred from the contract balance
    if (balance > 0) {
      settlementContract.transfer(writer, balance);
    }
  }

  // called by the writer to recover deposited funds after expiration
  function recoverDeposit() external {
    require(msg.sender == writer, "SENDER_NOT_AUTHORIZED ");

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

  // Fund the option with the deposit currency.
  // Implemented as an internal function as can also be called within constructor
  function depositInternal() internal {
    require(!funded, "already funded");

    // Note: block timestamps are potentially manipulable
    require(expiration > block.timestamp, EXPIRED); // solium-disable-line security/no-block-members

    uint256 newBalance;

    // When the deposit currency is ETH it should be sent as the value.
    if (depositContract == ERC20(0)) {
      require(address(this).balance <= depositAmount, "depositAmount exceeded");
      newBalance = address(this).balance;
    // When the deposit currency is ERC-20 it should be `approve`d for
    // the contract first.
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
}
