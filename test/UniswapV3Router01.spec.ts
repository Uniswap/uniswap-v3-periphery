import { constants, Contract, Wallet, utils } from 'ethers'
const { getAddress } = utils
import { waffle, ethers } from 'hardhat'

import { Fixture } from 'ethereum-waffle'
import { UniswapV3Router01, WETH9, TestERC20 } from '../typechain'
import { expect } from './shared/expect'
import { v3CoreFactoryFixture } from './shared/fixtures'
import snapshotGasCost from './shared/snapshotGasCost'
import {
  encodePriceSqrt,
  FeeAmount,
  getMaxTick,
  getMinTick,
  TICK_SPACINGS,
  encodePath,
  expandTo18Decimals,
} from './shared/utilities'

import { abi as POOL_ABI } from '@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json'

describe('UniswapV3Router01', () => {
  const wallets = waffle.provider.getWallets()
  const [wallet, other] = wallets

  const routerFixture: Fixture<{
    router: UniswapV3Router01
    weth: WETH9
    v3CoreFactory: Contract
    tokens: [TestERC20, TestERC20, TestERC20]
  }> = async (wallets, provider) => {
    const { factory: v3CoreFactory } = await v3CoreFactoryFixture(wallets, provider)

    const wethFactory = await ethers.getContractFactory('WETH9')
    const weth = (await wethFactory.deploy()) as WETH9

    const routerFactory = await ethers.getContractFactory('MockTimeUniswapV3Router01')
    const router = (await routerFactory.deploy(v3CoreFactory.address, weth.address)) as UniswapV3Router01

    const tokenFactory = await ethers.getContractFactory('TestERC20')
    const tokens = (await Promise.all([
      tokenFactory.deploy(constants.MaxUint256.div(2)), // do not use maxu256 to avoid overflowing
      tokenFactory.deploy(constants.MaxUint256.div(2)),
      tokenFactory.deploy(constants.MaxUint256.div(2)),
    ])) as [TestERC20, TestERC20, TestERC20]

    // approve & fund wallets
    for (const token of tokens) {
      await token.approve(router.address, constants.MaxUint256)
      await token.connect(other).approve(router.address, constants.MaxUint256)
      await token.transfer(other.address, expandTo18Decimals(1_000_000))
    }

    tokens.sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1))

    return {
      weth,
      router,
      v3CoreFactory,
      tokens,
    }
  }

  // helper for getting the token0-2 balances
  const balances = async ([token0, token1, token2]: TestERC20[], who: string) => {
    return {
      token0: await token0.balanceOf(who),
      token1: await token1.balanceOf(who),
      token2: await token2.balanceOf(who),
    }
  }

  let v3CoreFactory: Contract
  let weth: WETH9
  let router: UniswapV3Router01
  let tokens: [TestERC20, TestERC20, TestERC20]

  let loadFixture: ReturnType<typeof waffle.createFixtureLoader>

  before('create fixture loader', async () => {
    loadFixture = waffle.createFixtureLoader(wallets)
  })

  beforeEach('load fixture', async () => {
    ;({ router, weth, v3CoreFactory, tokens } = await loadFixture(routerFixture))
  })

  describe('#WETH', () => {
    it('points to WETH', async () => {
      expect(await router.WETH()).to.eq(weth.address)
    })
  })

  describe('#factory', () => {
    it('points to v3 core factory', async () => {
      expect(await router.factory()).to.eq(v3CoreFactory.address)
    })
  })

  describe('#createPoolAndAddLiquidity', () => {
    it('creates a pool', async () => {
      await router.createPoolAndAddLiquidity({
        tokenA: tokens[0].address,
        tokenB: tokens[1].address,
        sqrtPriceX96: encodePriceSqrt(1, 1),
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        recipient: wallet.address,
        amount: 10,
        deadline: 1,
        fee: FeeAmount.MEDIUM,
      })
    })

    it('fails if pool already exists', async () => {
      await router.createPoolAndAddLiquidity({
        tokenA: tokens[0].address,
        tokenB: tokens[1].address,
        sqrtPriceX96: encodePriceSqrt(1, 1),
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        recipient: wallet.address,
        amount: 10,
        deadline: 1,
        fee: FeeAmount.MEDIUM,
      })

      await expect(
        router.createPoolAndAddLiquidity({
          tokenA: tokens[0].address,
          tokenB: tokens[1].address,
          sqrtPriceX96: encodePriceSqrt(1, 1),
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          recipient: wallet.address,
          amount: 10,
          deadline: 1,
          fee: FeeAmount.MEDIUM,
        })
      ).to.be.reverted
    })

    it('can take tokens in opposite order', async () => {
      await router.createPoolAndAddLiquidity({
        tokenA: tokens[1].address,
        tokenB: tokens[0].address,
        sqrtPriceX96: encodePriceSqrt(1, 1),
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        recipient: wallet.address,
        amount: 10,
        deadline: 1,
        fee: FeeAmount.MEDIUM,
      })
    })

    it('deploys pool with expected parameters', async () => {
      await router.createPoolAndAddLiquidity({
        tokenA: tokens[1].address,
        tokenB: tokens[0].address,
        sqrtPriceX96: encodePriceSqrt(1, 1),
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        recipient: wallet.address,
        amount: 10,
        deadline: 1,
        fee: FeeAmount.MEDIUM,
      })
      const poolAddress = await v3CoreFactory.getPool(tokens[0].address, tokens[1].address, FeeAmount.MEDIUM)
      expect(poolAddress).to.not.eq(constants.AddressZero)
      const pool = new Contract(poolAddress, POOL_ABI, wallet)
      const { sqrtPriceX96, tick } = await pool.slot0()
      expect(sqrtPriceX96).to.eq(encodePriceSqrt(1, 1))
      expect(tick).to.eq(0)
    })

    it('fails if deadline is in past')

    it('gas cost', async () => {
      await snapshotGasCost(
        router.createPoolAndAddLiquidity({
          tokenA: tokens[0].address,
          tokenB: tokens[1].address,
          sqrtPriceX96: encodePriceSqrt(1, 1),
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          recipient: wallet.address,
          amount: 10,
          deadline: 1,
          fee: FeeAmount.MEDIUM,
        })
      )
    })
  })

  describe('#addLiquidity', () => {
    it('reverts if pool does not exist', async () => {
      await expect(
        router.addLiquidity({
          tokenA: tokens[0].address,
          tokenB: tokens[1].address,
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          recipient: wallet.address,
          amount: 10,
          deadline: 1,
          fee: FeeAmount.MEDIUM,
          amountAMax: constants.MaxUint256,
          amountBMax: constants.MaxUint256,
        })
      ).to.be.reverted
    })

    describe('pool exists', () => {
      const startingPrice = encodePriceSqrt(1, 1)
      beforeEach('create the pool directly', async () => {
        await v3CoreFactory.createPool(tokens[0].address, tokens[1].address, FeeAmount.MEDIUM)
        const pool = await v3CoreFactory.getPool(tokens[0].address, tokens[1].address, FeeAmount.MEDIUM)
        await new Contract(pool, POOL_ABI, wallet).initialize(startingPrice)
      })

      it('allows adding liquidity', async () => {
        await router.addLiquidity({
          tokenA: tokens[0].address,
          tokenB: tokens[1].address,
          tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
          recipient: wallet.address,
          amount: 10,
          deadline: 1,
          fee: FeeAmount.MEDIUM,
          amountAMax: constants.MaxUint256,
          amountBMax: constants.MaxUint256,
        })
      })

      it('fails if deadline is in past')

      it('gas cost', async () => {
        await snapshotGasCost(
          router.addLiquidity({
            tokenA: tokens[0].address,
            tokenB: tokens[1].address,
            tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
            tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
            recipient: wallet.address,
            amount: 10,
            deadline: 1,
            fee: FeeAmount.MEDIUM,
            amountAMax: constants.MaxUint256,
            amountBMax: constants.MaxUint256,
          })
        )
      })
    })
  })

  describe('#swapTokensForExactTokens', () => {
    const trader = other

    beforeEach(async () => {
      let liquidityParams = {
        tokenA: tokens[1].address,
        tokenB: tokens[0].address,
        sqrtPriceX96: encodePriceSqrt(100, 100),
        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
        recipient: wallet.address,
        amount: 1000000,
        deadline: 1,
        fee: FeeAmount.MEDIUM,
      }

      await router.connect(wallet).createPoolAndAddLiquidity(liquidityParams)
      liquidityParams.tokenA = tokens[1].address
      liquidityParams.tokenB = tokens[2].address
      await router.connect(wallet).createPoolAndAddLiquidity(liquidityParams)
    })

    describe('single-hop', async () => {
      // helper for executing a single hop exact output trade
      const singleHop = async (zeroForOne: boolean) => {
        const tokenAddrs = tokens.slice(0, 2).map((t) => t.address)
        const fees = [FeeAmount.MEDIUM]
        const path = encodePath(zeroForOne ? tokenAddrs.reverse() : tokenAddrs, fees)

        let params = {
          path,
          maxAmountIn: 3,
          amountOut: 1,
          recipient: trader.address,
          deadline: 1,
        }

        // ensure that it fails if the limit is any tighter
        params.maxAmountIn = 2
        await expect(router.connect(trader).swapTokensForExactTokens(params)).to.be.revertedWith('too much requested')
        params.maxAmountIn = 3

        await router.connect(trader).swapTokensForExactTokens(params)
      }

      it('zero for one', async () => {
        // get balances before
        const pool1 = await v3CoreFactory.getPool(tokens[0].address, tokens[1].address, FeeAmount.MEDIUM)
        const poolBefore = await balances(tokens, pool1)
        const traderBefore = await balances(tokens, trader.address)

        await singleHop(true)

        // get balances after
        const poolAfter = await balances(tokens, pool1)
        const traderAfter = await balances(tokens, trader.address)

        // the pool received (trader sent) 3  token0
        expect(poolAfter.token0).to.be.eq(poolBefore.token0.add(3))
        expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(3))
        // the pool sent out (trader received) 1 token1
        expect(poolAfter.token1).to.be.eq(poolBefore.token1.sub(1))
        expect(traderAfter.token1).to.be.eq(traderBefore.token1.add(1))
      })

      it('one for zero', async () => {
        // get balances before
        const pool1 = await v3CoreFactory.getPool(tokens[0].address, tokens[1].address, FeeAmount.MEDIUM)
        const poolBefore = await balances(tokens, pool1)
        const traderBefore = await balances(tokens, trader.address)

        await singleHop(false)

        // get balances after
        const poolAfter = await balances(tokens, pool1)
        const traderAfter = await balances(tokens, trader.address)

        // the pool received (trader sent) 3  token0
        expect(poolAfter.token1).to.be.eq(poolBefore.token0.add(3))
        expect(traderAfter.token1).to.be.eq(traderBefore.token0.sub(3))
        // the pool sent out (trader received) 1 token1
        expect(poolAfter.token0).to.be.eq(poolBefore.token1.sub(1))
        expect(traderAfter.token0).to.be.eq(traderBefore.token1.add(1))
      })
    })

    describe('multi-hop', async () => {
      const multihop = async (startFromBeginning: boolean) => {
        const tokenAddrs = tokens.map((t) => t.address)
        const fees = [FeeAmount.MEDIUM, FeeAmount.MEDIUM]
        const path = encodePath(startFromBeginning ? tokenAddrs.reverse() : tokenAddrs, fees)

        // OK
        let params = {
          path,
          maxAmountIn: 5,
          amountOut: 1,
          recipient: trader.address,
          deadline: 1,
        }

        // ensure that it fails if the limit is any tighter
        params.maxAmountIn = 4
        await expect(router.connect(trader).swapTokensForExactTokens(params)).to.be.revertedWith('too much requested')
        params.maxAmountIn = 5

        await router.connect(trader).swapTokensForExactTokens(params)
      }

      it('start at beginning', async () => {
        const traderBefore = await balances(tokens, trader.address)
        await multihop(true)
        const traderAfter = await balances(tokens, trader.address)

        expect(traderAfter.token0).to.be.eq(traderBefore.token0.sub(5))
        expect(traderAfter.token1).to.be.eq(traderBefore.token1)
        expect(traderAfter.token2).to.be.eq(traderBefore.token2.add(1))
      })

      it('start at end', async () => {
        const traderBefore = await balances(tokens, trader.address)
        await multihop(false)
        const traderAfter = await balances(tokens, trader.address)

        expect(traderAfter.token0).to.be.eq(traderBefore.token0.add(1))
        expect(traderAfter.token1).to.be.eq(traderBefore.token1)
        expect(traderAfter.token2).to.be.eq(traderBefore.token2.sub(5))
      })
    })
  })
})
