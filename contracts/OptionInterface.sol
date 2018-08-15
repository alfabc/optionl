pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";


// Provides a common external interface to Option contracts
interface OptionInterface {
  // Set new writer/holder
  function setWriter(address newWriter) external;
  function setHolder(address newHolder) external;

  // Called by the writer (or anyone) to fund the option with the
  // deposit currency.
  // When the deposit currency is ETH it should be sent as the value.
  // When the deposit currency is ERC-20 it should be `approve`d for
  // the contract first.
  function deposit() external payable;

  // called by the holder to give the settlement and take the deposit
  // requires that the option be fully deposited
  // and that the holder has made an allowance of the settlement currency
  function exercise() external;

  // called by the writer to recover deposited funds after expiration
  function recoverDeposit() external;
}
