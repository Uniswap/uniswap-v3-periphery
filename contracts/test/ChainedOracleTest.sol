// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.7.6;
pragma abicoder v2;

import '../libraries/ChainedOracleLibrary.sol';

contract ChainedOracleTest {
    function getPriceChained(
        uint32 secondsAgo,
        address quotePool,
        address basePool
    ) public view returns (uint160 chainedSqrtPriceX96) {
        chainedSqrtPriceX96 = ChainedOracleLibrary.getPriceChained(secondsAgo, quotePool, basePool);
    }
}
