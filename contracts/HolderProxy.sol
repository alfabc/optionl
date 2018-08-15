pragma solidity ^0.4.24;

import "./OptionInterface.sol";
import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";


contract HolderProxy {

  address public holder;
  ERC20 public settlementContract;
  uint public settlementAmount;
  OptionInterface public option;

  constructor() public {
    holder = msg.sender;
  }

  function setOption(OptionInterface _option) external {
    require(holder == msg.sender, "holder only");
    option = _option;
  }

  function setTransferPrice(ERC20 _settlementContract, uint _settlementAmount) external {
    require(holder == msg.sender, "holder only");
    settlementContract = _settlementContract;
    settlementAmount = _settlementAmount;
  }

  // Send ETH for price (if in ETH)
  // Send ERC20 tokens for price (if in ERC20) via
  //   * ERC20.approve allowance (if any)
  //   * ERC20.transfer balance
  // ... but not both.
  function buy() external payable {
    if (settlementContract == ERC20(0)) {
      require(settlementAmount == msg.value, "incorrect amount");
      holder.transfer(msg.value);
    } else {
      require(msg.value == 0, "ERC20 only");
      uint allowance = settlementContract.allowance(msg.sender, address(this));
      if (allowance > 0) {
        require(settlementAmount <= allowance, "incorrect amount");
        settlementContract.transferFrom(msg.sender, holder, settlementAmount);
      } else {
        require(settlementAmount <= settlementContract.balanceOf(address(this)), "incorrect amount");
        settlementContract.transfer(holder, settlementAmount);
      }
    }
    option.setHolder(msg.sender);
  }
}
