import { expect } from 'chai'
import { ethers, waffle } from 'hardhat'
import { BigNumber, constants, ContractFactory, Contract } from 'ethers'
import { OracleTest, TestERC20 } from '../typechain'
import { expandTo18Decimals } from './shared/expandTo18Decimals'
import snapshotGasCost from './shared/snapshotGasCost'

describe('OracleLibrary', () => {
  let loadFixture: ReturnType<typeof waffle.createFixtureLoader>
  let tokens: TestERC20[]
  let oracle: OracleTest

  const oracleTestFixture = async () => {
    const tokenFactory = await ethers.getContractFactory('TestERC20')
    const tokens: [TestERC20, TestERC20] = [
      (await tokenFactory.deploy(constants.MaxUint256.div(2))) as TestERC20, // do not use maxu256 to avoid overflowing
      (await tokenFactory.deploy(constants.MaxUint256.div(2))) as TestERC20,
    ]

    tokens.sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1))

    const oracleFactory = await ethers.getContractFactory('OracleTest')
    const oracle = await oracleFactory.deploy()

    return {
      tokens: tokens as TestERC20[],
      oracle: oracle as OracleTest,
    }
  }

  before('create fixture loader', async () => {
    loadFixture = waffle.createFixtureLoader(await (ethers as any).getSigners())
  })

  beforeEach('deploy fixture', async () => {
    const fixtures = await loadFixture(oracleTestFixture)
    tokens = fixtures['tokens']
    oracle = fixtures['oracle']
  })

  describe('#consult', () => {
    let mockObservableFactory: ContractFactory

    before('create mockObservableFactory', async () => {
      mockObservableFactory = await ethers.getContractFactory('MockObservable')
    })

    it('reverts when period is 0', async () => {
      await expect(oracle.consult(oracle.address, 0)).to.be.revertedWith('BP')
    })

    it('correct output when tick is 0', async () => {
      const period = 3
      const tickCumulatives = [BigNumber.from(12), BigNumber.from(12)]
      const mockObservable = await mockObservableFactory.deploy([period, 0], tickCumulatives, [0, 0])
      const oracleTick = await oracle.consult(mockObservable.address, period)

      expect(oracleTick).to.equal(BigNumber.from(0))
    })

    it('correct output for positive tick', async () => {
      const period = 3
      const tickCumulatives = [BigNumber.from(7), BigNumber.from(12)]
      const mockObservable = await mockObservableFactory.deploy([period, 0], tickCumulatives, [0, 0])
      const oracleTick = await oracle.consult(mockObservable.address, period)

      // Always round to negative infinity
      // In this case, we don't have do anything
      expect(oracleTick).to.equal(BigNumber.from(1))
    })

    it('correct output for negative tick', async () => {
      const period = 3
      const tickCumulatives = [BigNumber.from(-7), BigNumber.from(-12)]
      const mockObservable = await mockObservableFactory.deploy([period, 0], tickCumulatives, [0, 0])
      const oracleTick = await oracle.consult(mockObservable.address, period)

      // Always round to negative infinity
      // In this case, we need to subtract one because integer division rounds to 0
      expect(oracleTick).to.equal(BigNumber.from(-2))
    })

    it('correct rounding for .5 negative tick', async () => {
      const period = 4
      const tickCumulatives = [BigNumber.from(-10), BigNumber.from(-12)]
      const mockObservable = await mockObservableFactory.deploy([period, 0], tickCumulatives, [0, 0])
      const oracleTick = await oracle.consult(mockObservable.address, period)

      // Always round to negative infinity
      // In this case, we need to subtract one because integer division rounds to 0
      expect(oracleTick).to.equal(BigNumber.from(-1))
    })

    it('correct output for tick cumulatives across overflow boundaries', async () => {
      const period = 4
      const tickCumulatives = [BigNumber.from(-100), BigNumber.from('36028797018963967')]
      const mockObservable = await mockObservableFactory.deploy([period, 0], tickCumulatives, [0, 0])
      const oracleTick = await oracle.consult(mockObservable.address, period)

      // Always round to negative infinity
      // In this case, we don't have do anything
      expect(oracleTick).to.equal(BigNumber.from(24))
    })

    it('correct output for tick cumulatives across underflow boundaries', async () => {
      const period = 4
      const tickCumulatives = [BigNumber.from(100), BigNumber.from('-36028797018963967')]
      const mockObservable = await mockObservableFactory.deploy([period, 0], tickCumulatives, [0, 0])
      const oracleTick = await oracle.consult(mockObservable.address, period)

      // Always round to negative infinity
      // In this case, we need to subtract one because integer division rounds to 0
      expect(oracleTick).to.equal(BigNumber.from(-25))
    })

    it('gas test', async () => {
      const period = 3
      const tickCumulatives = [BigNumber.from(7), BigNumber.from(12)]
      const mockObservable = await mockObservableFactory.deploy([period, 0], tickCumulatives, [0, 0])

      await snapshotGasCost(oracle.getGasCostOfConsult(mockObservable.address, period))
    })
  })

  describe('#getQuoteAtTick', () => {
    // sanity check
    it('token0: returns correct value when tick = 0', async () => {
      const quoteAmount = await oracle.getQuoteAtTick(
        BigNumber.from(0),
        expandTo18Decimals(1),
        tokens[0].address,
        tokens[1].address
      )

      expect(quoteAmount).to.equal(expandTo18Decimals(1))
    })

    // sanity check
    it('token1: returns correct value when tick = 0', async () => {
      const quoteAmount = await oracle.getQuoteAtTick(
        BigNumber.from(0),
        expandTo18Decimals(1),
        tokens[1].address,
        tokens[0].address
      )

      expect(quoteAmount).to.equal(expandTo18Decimals(1))
    })

    it('token0: returns correct value when at min tick | 0 < sqrtRatioX96 <= type(uint128).max', async () => {
      const quoteAmount = await oracle.getQuoteAtTick(
        BigNumber.from(-887272),
        BigNumber.from(2).pow(128).sub(1),
        tokens[0].address,
        tokens[1].address
      )
      expect(quoteAmount).to.equal(BigNumber.from('1'))
    })

    it('token1: returns correct value when at min tick | 0 < sqrtRatioX96 <= type(uint128).max', async () => {
      const quoteAmount = await oracle.getQuoteAtTick(
        BigNumber.from(-887272),
        BigNumber.from(2).pow(128).sub(1),
        tokens[1].address,
        tokens[0].address
      )
      expect(quoteAmount).to.equal(
        BigNumber.from('115783384738768196242144082653949453838306988932806144552194799290216044976282')
      )
    })

    it('token0: returns correct value when at max tick | sqrtRatioX96 > type(uint128).max', async () => {
      const quoteAmount = await oracle.getQuoteAtTick(
        BigNumber.from(887272),
        BigNumber.from(2).pow(128).sub(1),
        tokens[0].address,
        tokens[1].address
      )
      expect(quoteAmount).to.equal(
        BigNumber.from('115783384785599357996676985412062652720342362943929506828539444553934033845703')
      )
    })

    it('token1: returns correct value when at max tick | sqrtRatioX96 > type(uint128).max', async () => {
      const quoteAmount = await oracle.getQuoteAtTick(
        BigNumber.from(887272),
        BigNumber.from(2).pow(128).sub(1),
        tokens[1].address,
        tokens[0].address
      )
      expect(quoteAmount).to.equal(BigNumber.from('1'))
    })

    it('gas test', async () => {
      await snapshotGasCost(
        oracle.getGasCostOfGetQuoteAtTick(
          BigNumber.from(10),
          expandTo18Decimals(1),
          tokens[0].address,
          tokens[1].address
        )
      )
    })
  })

  describe('#getOldestObservationSecondsAgo', () => {
    let mockObservationsFactory: ContractFactory

    // some empty tick values as this function does not use them
    const emptyTickCumulatives = [0, 0, 0, 0]
    const emptyTick = 0

    // helper function to run each test case identically
    const runOldestObservationsTest = async (
      blockTimestamps: number[],
      initializeds: boolean[],
      observationCardinality: number,
      observationIndex: number
    ) => {
      const mockObservations = await mockObservationsFactory.deploy(
        blockTimestamps,
        emptyTickCumulatives,
        initializeds,
        emptyTick,
        observationCardinality,
        observationIndex,
        false
      )

      var result = await oracle.getOldestObservationSecondsAgo(mockObservations.address)

      //calculate seconds ago
      var secondsAgo
      if (initializeds[(observationIndex + 1) % observationCardinality]) {
        secondsAgo = result['currentTimestamp'] - blockTimestamps[(observationIndex + 1) % observationCardinality]
      } else {
        secondsAgo = result['currentTimestamp'] - blockTimestamps[0]
      }

      if (secondsAgo < 0) {
        secondsAgo += 2 ** 32
      }

      expect(result['secondsAgo']).to.equal(secondsAgo)
    }

    before('create mockObservationsFactory', async () => {
      mockObservationsFactory = await ethers.getContractFactory('MockObservations')
    })

    it('fetches the oldest timestamp from the slot after observationIndex', async () => {
      // set up test case
      const blockTimestamps = [2, 3, 1, 0]
      const initializeds = [true, true, true, false]
      const observationCardinality = 3
      const observationIndex = 1

      // run test
      await runOldestObservationsTest(blockTimestamps, initializeds, observationCardinality, observationIndex)
    })

    it('loops to fetches the oldest timestamp from index 0', async () => {
      // set up test case
      const blockTimestamps = [1, 2, 3, 0]
      const initializeds = [true, true, true, false]
      const observationCardinality = 3
      const observationIndex = 2

      // run test
      await runOldestObservationsTest(blockTimestamps, initializeds, observationCardinality, observationIndex)
    })

    it('fetches from index 0 if the next index is uninitialized', async () => {
      // set up test case
      const blockTimestamps = [1, 2, 0, 0]
      const initializeds = [true, true, false, false]
      const observationCardinality = 4
      const observationIndex = 1

      // run test
      await runOldestObservationsTest(blockTimestamps, initializeds, observationCardinality, observationIndex)
    })

    it('reverts if the pool is not initialized', async () => {
      const blockTimestamps = [0, 0, 0, 0]
      const initializeds = [false, false, false, false]
      const observationCardinality = 0
      const observationIndex = 0
      const mockObservations = await mockObservationsFactory.deploy(
        blockTimestamps,
        emptyTickCumulatives,
        initializeds,
        emptyTick,
        observationCardinality,
        observationIndex,
        false
      )

      await expect(oracle.getOldestObservationSecondsAgo(mockObservations.address)).to.be.revertedWith('NI')
    })

    it('fetches the correct timestamp when the timestamps overflow', async () => {
      // set up test case
      const maxUint32 = 2 ** 32 - 1
      const blockTimestamps = [maxUint32, 3, maxUint32 - 2, 0]
      const initializeds = [true, true, true, false]
      const observationCardinality = 3
      const observationIndex = 1

      // run test
      await runOldestObservationsTest(blockTimestamps, initializeds, observationCardinality, observationIndex)
    })
  })

  describe('#getBlockStartingTick', () => {
    let mockObservationsFactory: ContractFactory
    let mockObservations: Contract
    let blockTimestamps: number[]
    let observationCardinality: number
    let observationIndex: number
    let initializeds: boolean[]
    let tickCumulatives: number[]
    let slot0Tick: number
    let lastObservationCurrentTimestamp: boolean

    before('create mockObservationsFactory', async () => {
      mockObservationsFactory = await ethers.getContractFactory('MockObservations')
    })

    const deployMockObservationsContract = async () => {
      mockObservations = await mockObservationsFactory.deploy(
        blockTimestamps,
        tickCumulatives,
        initializeds,
        slot0Tick,
        observationCardinality,
        observationIndex,
        lastObservationCurrentTimestamp
      )
    }

    it('reverts if the pool is not initialized', async () => {
      blockTimestamps = [0, 0, 0, 0]
      observationCardinality = 0
      observationIndex = 0
      initializeds = [false, false, false, false]
      tickCumulatives = [0, 0, 0, 0]
      slot0Tick = 0
      lastObservationCurrentTimestamp = false

      await deployMockObservationsContract()

      await expect(oracle.getBlockStartingTick(mockObservations.address)).to.be.revertedWith('NEO')
    })

    it('returns the tick in slot0 if the latest observation was in a previous block', async () => {
      blockTimestamps = [1, 3, 4, 0]
      observationCardinality = 3
      observationIndex = 2
      initializeds = [true, true, true, false]
      // 0
      // 8: 0 + (4*(3-1))
      // 13: 8 + (5*(4-3))
      tickCumulatives = [0, 8, 13, 0]
      slot0Tick = 6
      lastObservationCurrentTimestamp = false

      await deployMockObservationsContract()

      var startingTick = await oracle.getBlockStartingTick(mockObservations.address)
      expect(startingTick).to.equal(slot0Tick)
    })

    it('reverts if it needs 2 observations and doesnt have them', async () => {
      blockTimestamps = [1, 0, 0, 0]
      observationCardinality = 1
      observationIndex = 0
      initializeds = [true, false, false, false]
      tickCumulatives = [8, 0, 0, 0]
      slot0Tick = 4
      lastObservationCurrentTimestamp = true

      await deployMockObservationsContract()

      await expect(oracle.getBlockStartingTick(mockObservations.address)).to.be.revertedWith('NEO')
    })

    it('reverts if the prior observation needed is not initialized', async () => {
      blockTimestamps = [1, 0, 0, 0]
      observationCardinality = 2
      observationIndex = 0
      initializeds = [true, false, false, false]
      tickCumulatives = [8, 0, 0, 0]
      slot0Tick = 4
      lastObservationCurrentTimestamp = true

      await deployMockObservationsContract()

      await expect(oracle.getBlockStartingTick(mockObservations.address)).to.be.revertedWith('ONI')
    })

    it('calculates the prior tick from the prior observations', async () => {
      blockTimestamps = [9, 5, 8, 0]
      observationCardinality = 3
      observationIndex = 0
      initializeds = [true, true, true, false]
      // 99: 95 + (4*1)
      // 80: 72 + (4*2)
      // 95: 80 + (5*3)
      tickCumulatives = [99, 80, 95, 0]
      slot0Tick = 3
      lastObservationCurrentTimestamp = true

      await deployMockObservationsContract()

      var startingTick = await oracle.getBlockStartingTick(mockObservations.address)
      var actualStartingTick = (tickCumulatives[0] - tickCumulatives[2]) / (blockTimestamps[0] - blockTimestamps[2])
      expect(startingTick).to.equal(actualStartingTick)
    })
  })
})
