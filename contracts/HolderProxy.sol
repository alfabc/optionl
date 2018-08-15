pragma solidity ^0.4.24;

import "./OptionInterface.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";


// A proxy contract for an option holder to set a price for transfer
// of the option contract, and automatically transfer it upon payment
//
// If any ERC-20 transfer balances are stranded in the contract, the holder
// of this contract can simply set the settlementAmount and/or
// settlementContract with an option contract and execute a buy() to liberate
// the amount.
contract HolderProxy {

  address public holder;
  ERC20 public settlementContract;
  uint public settlementAmount;
  OptionInterface public option;

  // Create holder proxy, setting the holder to the creator
  constructor() public {
    holder = msg.sender;
  }

  // Set the contract on which the proxy operates
  function setOption(OptionInterface _option) external {
    require(holder == msg.sender, "holder only");
    option = _option;
  }

  // Set the contract and amount required for transfer of the contract
  // If _settlementContract is zero, means ETH since ETH has no contract
  function setTransferPrice(ERC20 _settlementContract, uint _settlementAmount) external {
    require(holder == msg.sender, "holder only");
    settlementContract = _settlementContract;
    settlementAmount = _settlementAmount;
  }

  // The sender pays to become the new holder of the option contract
  // in a single atomic operation.
  // Send ETH for price (if in ETH)
  // Send ERC-20 tokens for price (if in ERC-20) via
  //   * ERC20.approve allowance (if any)
  //   * ERC20.transfer balance
  // ... but not both.
  function buy() external payable {
    // For ETH, the contract is null
    if (settlementContract == ERC20(0)) {
      require(settlementAmount == msg.value, "incorrect amount");
      holder.transfer(msg.value);
    } else {
      // For ERC-20
      require(msg.value == 0, "ERC20 only");
      uint allowance = settlementContract.allowance(msg.sender, address(this));
      // If *any* allowance is approved, there must be sufficient.
      if (allowance > 0) {
        require(settlementAmount <= allowance, "incorrect amount");
        // transfer only the settlement amount from the buyer to the holder
        settlementContract.transferFrom(msg.sender, holder, settlementAmount);
      } else {
        // If there is no allowance, look for transfer balance
        require(settlementAmount <= settlementContract.balanceOf(address(this)), "incorrect amount");
        // transfer only the settlement amount from the contract balance
        // to the holder
        settlementContract.transfer(holder, settlementAmount);
      }
    }

    // the caller becomes the new holder of the option contract
    option.setHolder(msg.sender);
  }
}
