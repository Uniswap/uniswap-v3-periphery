// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.7.6;

import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol';
import '@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol';
import '@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3MintCallback.sol';
import '@uniswap/v3-core/contracts/interfaces/callback/IUniswapV3SwapCallback.sol';

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/proxy/Clones.sol';

/// @dev Allows creation of a controlled pool, using two virtual ERC20 tokens in a V3 pool for pricing only
/// @dev The integrator of this contract must decide how to mint and burn liquidity. All this contract does is create a pool
/// @dev that can only be used for its pricing capability. Swap, mint and burn must be implemented as methods on this contract.
abstract contract ControlledPool is IERC20, IUniswapV3MintCallback, IUniswapV3SwapCallback {
    /// @notice The address of the clone contract representing token0
    IERC20 public immutable token0;
    /// @notice The address of the clone contract representing token1
    IERC20 public immutable token1;

    /// @notice The underlying V3 pool used for pricing
    IUniswapV3Pool public immutable pool;

    uint128 private totalSupply0;
    uint128 private totalSupply1;

    mapping(address => uint128) private balance0;
    mapping(address => uint128) private balance1;

    /// @notice Creates the two tokens
    constructor(IUniswapV3Factory factory, uint24 fee) {
        address tokenA = Clones.clone(address(this));
        address tokenB = Clones.clone(address(this));
        (token0, token1) = tokenA < tokenB ? (IERC20(tokenA), IERC20(tokenB)) : (IERC20(tokenB), IERC20(tokenA));
        pool = IUniswapV3Pool(factory.createPool(tokenA, tokenB, fee));
    }

    function totalSupply() external view override returns (uint256) {
        if (address(this) == address(token0)) {
            return totalSupply0;
        } else if (address(this) == address(token1)) {
            return totalSupply1;
        } else {
            revert();
        }
    }

    function balanceOf(address account) external view override returns (uint256) {
        if (address(this) == address(token0)) {
            return balance0[account];
        } else if (address(this) == address(token1)) {
            return balance1[account];
        } else {
            revert();
        }
    }

    /// @dev Only allow transfers between this contract and the pool, meaning all swaps have to go through this contract
    function transfer(address recipient, uint256 amount) external override returns (bool) {
        require(
            (msg.sender == address(pool) && recipient == address(this)) ||
                (recipient == address(pool) && msg.sender == address(this))
        );

        if (address(this) == address(token0)) {
            require(balance0[msg.sender] >= amount);
            balance0[msg.sender] -= uint128(amount);
            balance0[recipient] += uint128(amount);
        } else if (address(this) == address(token1)) {
            require(balance1[msg.sender] >= amount);
            balance1[msg.sender] -= uint128(amount);
            balance1[recipient] += uint128(amount);
        } else {
            revert();
        }

        emit Transfer(msg.sender, recipient, amount);

        return true;
    }

    /// @dev These functions are expected to be called in mint and swap callbacks
    function _mint0(address account, uint128 amount) internal {
        require(uint256(totalSupply0) + uint256(amount) <= type(uint128).max);
        totalSupply0 += amount;
        balance0[account] += amount;
    }

    /// @dev These functions are expected to be called in mint and swap callbacks
    function _mint1(address account, uint128 amount) internal {
        require(uint256(totalSupply1) + uint256(amount) <= type(uint128).max);
        totalSupply1 += amount;
        balance1[account] += amount;
    }

    /// @dev Not supported because the ERC20 is only a virtual ERC20 transferred between the pool and this contract
    function allowance(address, address) external pure override returns (uint256) {
        return 0;
    }

    function approve(address, uint256) external pure override returns (bool) {
        revert();
    }

    /// @dev By default always pays
    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata data
    ) external override {
        require(msg.sender == address(pool));
        if (amount0Owed > 0) _mint0(msg.sender, amount0Owed);
        if (amount1Owed > 0) _mint1(msg.sender, amount1Owed);
    }

    function transferFrom(
        address,
        address,
        uint256
    ) external pure override returns (bool) {
        revert();
    }
}
