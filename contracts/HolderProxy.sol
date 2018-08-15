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
    require(holder == msg.sender);
    option = _option;
  }

  function setTransferPrice(ERC20 _settlementContract, uint _settlementAmount) external {
    require(holder == msg.sender);
    settlementContract = _settlementContract;
    settlementAmount = _settlementAmount;
  }

  function buy() external payable {
    if (settlementContract == ERC20(0)) {
      require(settlementAmount == msg.value);
      holder.transfer(msg.value);
    } else {
      uint allowance = settlementContract.allowance(msg.sender, address(this));
      require(settlementAmount == allowance);
      settlementContract.transferFrom(msg.sender, holder, allowance);
    }
    option.setHolder(msg.sender);
  }
}
