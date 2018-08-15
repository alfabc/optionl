pragma solidity ^0.4.24;

import "./OptionInterface.sol";

contract HolderProxy {

  address public holder;
  address public settlementContract;
  OptionInterface public option;
  uint public settlementAmount;

  constructor() public {
    holder = msg.sender;
  }

  function setOption(OptionInterface _option) external {
    require(holder == msg.sender);
    option = _option;
  }

  function setTransferPrice(address _settlementContract, uint _settlementAmount) external {
    require(holder == msg.sender);
    settlementContract = _settlementContract;
    settlementAmount = _settlementAmount;
  }

  function buy() external payable {
    require(settlementContract == address(0));
    require(settlementAmount == msg.value);
    holder.transfer(msg.value);
    option.setHolder(msg.sender);
  }
}
