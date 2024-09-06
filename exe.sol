//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ILiquidityPool is IERC20 {

    event Sync(address indexed _sender, uint256 _reserveSPC, uint256 _reserveETH);
    event Mint(address indexed _sender, address indexed _to, uint256 _liquidity);
    event Burn(address indexed _sender, address indexed _to, uint256 _spcAmount, uint256 _ethAmount);
    event Swap(address indexed _sender, address indexed _to, uint256 _amountOut);

    function getReserves() external returns (uint256 _reserveSPC, uint256 _reserveETH);
    function mint(address _to) external returns (uint256 _liquidity);
    function burn(address _to) external returns (uint256 _SPCtoBeReturned, uint256 _ETHtoBeReturned);
    //function swap(uint256 _spcAmountOut, uint256 _ethAmountOut, address _to) external;
    function swapSPCtoETH(uint256 _ethAmountOut, address _to) external;
    function swapETHtoSPC(uint256 _spcAmountOut, address _to) external;
    function sync() external;
}
