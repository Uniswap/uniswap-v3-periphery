import { expect } from 'chai'
import { ethers, waffle } from 'hardhat'
import { BigNumber, BigNumberish, constants, ContractFactory } from 'ethers'
import { TestERC20, ChainedOracleTest, MockObservable } from '../typechain'
import poolAtAddress from './shared/poolAtAddress'
import { getAddress } from '@ethersproject/address'
import { formatSqrtRatioX96 } from './shared/formatSqrtRatioX96'
import { format } from 'prettier'
import { encodePriceSqrt } from './shared/encodePriceSqrt'

describe.only('ChainedOracleLibrary', () => {
  let loadFixture: ReturnType<typeof waffle.createFixtureLoader>
  let tokens: TestERC20[]
  let oracle: ChainedOracleTest
  const wallets = waffle.provider.getWallets()

  const chainedOracleTestFixture = async () => {
    const tokenFactory = await ethers.getContractFactory('TestERC20')
    const tokens: [TestERC20, TestERC20, TestERC20] = [
      (await tokenFactory.deploy(constants.MaxUint256.div(2))) as TestERC20, // do not use maxu256 to avoid overflowing
      (await tokenFactory.deploy(constants.MaxUint256.div(2))) as TestERC20,
      (await tokenFactory.deploy(constants.MaxUint256.div(2))) as TestERC20,
    ]

    tokens.sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1))
    // tokens.sort((b, c) => (b.address.toLowerCase() < c.address.toLowerCase() ? -1 : 1))

    const chainedOracleLibraryFactory = await ethers.getContractFactory('ChainedOracleLibrary')
    const chainedOracleLibrary = await chainedOracleLibraryFactory.deploy()
    const oracleFactory = await ethers.getContractFactory('ChainedOracleTest', {
      libraries: {
        ChainedOracleLibrary: chainedOracleLibrary.address,
      },
    })
    const oracle = await oracleFactory.deploy()

    return {
      tokens: tokens as TestERC20[],
      oracle: oracle as ChainedOracleTest,
    }
  }

  before('create fixture loader', async () => {
    loadFixture = waffle.createFixtureLoader(wallets)
  })

  beforeEach('deploy fixture', async () => {
    const fixtures = await loadFixture(chainedOracleTestFixture)
    tokens = fixtures['tokens']
    oracle = fixtures['oracle']
  })

  describe('#getPriceChained', () => {
    let mockObservableFactory: ContractFactory

    before('create mockObservableFactory', async () => {
      mockObservableFactory = await ethers.getContractFactory('MockObservable')
    })

    it('reverts when secondsAgo is 0', async () => {
      const secondsAgo = 0
      const tickCumulatives = [BigNumber.from(-7), BigNumber.from(-12)]
      const mockObservable = await mockObservableFactory.deploy([secondsAgo, 0], tickCumulatives, [0, 0])
      expect(oracle.getPriceChained(secondsAgo, mockObservable.address, mockObservable.address)).to.be.revertedWith(
        'BP'
      )
    })

    it('correct output when tick is 0', async () => {
      const secondsAgo = 15
      const tickCumulatives1 = [BigNumber.from(0), BigNumber.from(0)]
      const tickCumulatives2 = [BigNumber.from(0), BigNumber.from(0)]
      const mockObservable = await mockObservableFactory.deploy([secondsAgo, 0], tickCumulatives1, [0, 0])
      const mockObservable2 = await mockObservableFactory.deploy([secondsAgo, 0], tickCumulatives2, [0, 0])
      const chainedPrice = await oracle.getPriceChained(secondsAgo, mockObservable.address, mockObservable2.address)

      expect(formatSqrtRatioX96(chainedPrice)).to.equal(formatSqrtRatioX96(1))
    })

    it('correct output when tick poolA is 0 and tick pool B is 100_000', async () => {
      const secondsAgo = 15
      const tickCumulatives1 = [BigNumber.from(0), BigNumber.from(0)]
      const tickCumulatives2 = [BigNumber.from(0), BigNumber.from(100000)]
      const mockObservable = await mockObservableFactory.deploy([secondsAgo, 0], tickCumulatives1, [0, 0])
      const mockObservable2 = await mockObservableFactory.deploy([secondsAgo, 0], tickCumulatives2, [0, 0])
      const chainedPrice = await oracle.getPriceChained(secondsAgo, mockObservable.address, mockObservable2.address)

      expect(formatSqrtRatioX96(chainedPrice)).to.equal(formatSqrtRatioX96(22015.5))
    })
  })
})
