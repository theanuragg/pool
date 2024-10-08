// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LiquidityPool is ERC20 {
    uint256 public constant MINIMUM_LIQUIDITY = 10**3;

    bool private unlocked = true;
    uint256 private reserveSPC;
    uint256 private reserveETH;
    uint256 private currentK;
    address private immutable SPC_ADDRESS;

    constructor(address _spcAddress) ERC20("LP Token for Ether-SPC", "ETH_SPC_LP") {
        SPC_ADDRESS = _spcAddress;
    }

    modifier lock() {
        require(unlocked, "LOCKED_FOR_EXECUTION");
        unlocked = false;
        _;
        unlocked = true;
    }

    modifier isValidAddress(address _to) {
        require(_to != SPC_ADDRESS && _to != address(this), "INVALID_TO_ADDRESS");
        _;
    }

    function _sendEther(address payable _to, uint256 _value) private {
        if(_value > 0) {
            (bool _success, ) = _to.call{value: _value}("");
            require(_success, "ETH_TRANSFER_FAILED");
        }
    }

    function _getCurrentBalance() private view returns (uint256 _currentSPCBalance, uint256 _currentETHBalance) {
        _currentSPCBalance = ERC20(SPC_ADDRESS).balanceOf(address(this));
        _currentETHBalance = address(this).balance;
    }

    function _update(uint256 _balanceSPC, uint256 _balanceETH) private {
        reserveSPC = _balanceSPC;
        reserveETH = _balanceETH;
        currentK = reserveSPC * reserveETH;
    }

    function getReserves() public view returns (uint256 _reserveSPC, uint256 _reserveETH) {
        _reserveSPC = reserveSPC;
        _reserveETH = reserveETH;
    }

    function mint(address _to) external lock isValidAddress(_to) returns (uint256 _liquidity) {
        (uint256 _reserveSPC, uint256 _reserveETH) = getReserves();
        (uint256 _currentSPCBalance, uint256 _currentETHBalance) = _getCurrentBalance();

        uint256 _amountSPCIn = _currentSPCBalance - _reserveSPC;
        uint256 _amountETHIn = _currentETHBalance - _reserveETH;
        uint256 _totalSupply = totalSupply();

        require(_amountSPCIn > 0 && _amountETHIn > 0, "NO_LIQUIDITY");

        if (_totalSupply == 0) {
            _liquidity = _sqrt(_amountSPCIn * _amountETHIn) - MINIMUM_LIQUIDITY;
        } else {
            uint256 _liquiditySPC = (_amountSPCIn * _totalSupply) / _reserveSPC;
            uint256 _liquidityETH = (_amountETHIn * _totalSupply) / _reserveETH;
            _liquidity = _liquiditySPC < _liquidityETH ? _liquiditySPC : _liquidityETH;
        }

        require(_liquidity > 0, "NO_LIQUIDITY");

        _mint(_to, _liquidity);
        _update(_currentSPCBalance, _currentETHBalance);

        emit Mint(msg.sender, _to, _liquidity);
    }

    function burn(address _to) external lock isValidAddress(_to)
    returns (uint256 _SPCtoBeReturned, uint256 _ETHtoBeReturned) {

        (uint256 _currentSPCBalance, uint256 _currentETHBalance) = _getCurrentBalance();
        uint256 _totalSupply = totalSupply();

        require(_totalSupply > 0, "INSUFFICIENT_SUPPLY");

        uint256 _liquidity = balanceOf(address(this));
        _SPCtoBeReturned = (_liquidity * _currentSPCBalance) / _totalSupply;
        _ETHtoBeReturned = (_liquidity * _currentETHBalance) / _totalSupply;

        require(_SPCtoBeReturned > 0 && _ETHtoBeReturned > 0, "INSUFFICIENT_LIQUIDITY_BURNED");

        uint256 _updatedSPCBalance = _currentSPCBalance - _SPCtoBeReturned;
        uint256 _updatedETHBalance = _currentETHBalance - _ETHtoBeReturned;

        _burn(address(this), _liquidity);
        ERC20(SPC_ADDRESS).transfer(_to, _SPCtoBeReturned);
        _sendEther(payable(_to), _ETHtoBeReturned);
        _update(_updatedSPCBalance, _updatedETHBalance);

        emit Burn(msg.sender, _to, _SPCtoBeReturned, _ETHtoBeReturned);
    }

    function swapSPCtoETH(uint256 _ethAmountOut, address _to) external lock isValidAddress(_to) {
        require(_ethAmountOut > 0, "INSUFFICIENT_OUTPUT_AMOUNT");

        (uint256 _currentSPCBalance, uint256 _currentETHBalance) = _getCurrentBalance();

        require(_ethAmountOut < reserveETH, "INSUFFICIENT_LIQUIDITY");

        uint256 _updatedETHBalance = _currentETHBalance - _ethAmountOut;
        uint256 _kAfterSwap = _currentSPCBalance * _updatedETHBalance;

        require(_kAfterSwap >= currentK, "INVALID_K");

        _sendEther(payable(_to), _ethAmountOut);
        _update(_currentSPCBalance, _updatedETHBalance);

        emit Swap(msg.sender, _to, _ethAmountOut);
    }

    function swapETHtoSPC(uint256 _spcAmountOut, address _to) external lock isValidAddress(_to) {
        require(_spcAmountOut > 0, "INSUFFICIENT_OUTPUT_AMOUNT");

        (uint256 _currentSPCBalance, uint256 _currentETHBalance) = _getCurrentBalance();

        require(_spcAmountOut < reserveSPC, "INSUFFICIENT_LIQUIDITY");

        uint256 _updatedSPCBalance = _currentSPCBalance - _spcAmountOut;
        uint256 _kAfterSwap = _updatedSPCBalance * _currentETHBalance;

        require(_kAfterSwap >= currentK, "INVALID_K");

        ERC20(SPC_ADDRESS).transfer(_to, _spcAmountOut);

        _update(_updatedSPCBalance, _currentETHBalance);

        emit Swap(msg.sender, _to, _spcAmountOut);
    }

    function sync() external lock {
        _update(ERC20(SPC_ADDRESS).balanceOf(address(this)), address(this).balance);
        emit Sync(msg.sender, reserveSPC, reserveETH);
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    receive() external payable {}

    event Mint(address indexed sender, address indexed to, uint256 liquidity);
    event Burn(address indexed sender, address indexed to, uint256 spcAmount, uint256 ethAmount);
    event Swap(address indexed sender, address indexed to, uint256 amount);
    event Sync(address indexed sender, uint256 reserveSPC, uint256 reserveETH);
}
