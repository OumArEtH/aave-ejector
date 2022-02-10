import { expect } from 'chai'
import { ethers, network } from 'hardhat'
import { Contract, Signer } from 'ethers'
import {
  wethContract,
  daiContract,
  usdcContract,
  linkContract,
  aLINKContract,
  yfiContract,
  aYFIContract,
  ADDRESS_USDC,
  ADDRESS_DAI,
  ADDRESS_YFI,
  ADDRESS_LINK,
  ADDRESS_WETH,
  ADDRESS_PROTOCOL_DATA_PROVIDER,
  ADDRESS_LENDING_POOL,
  AAVE_LENDING_POOL_ADDRESSESS_PROVIDER,
  lendingPoolContract,
  dataProviderContract,
  stableDebtDAIContract,
  stableDebtUSDCContract
} from './contracts'

describe("AaveEjector", () => {
  let deployer: Signer
  let user: Signer
  let aaveEjector: Contract
  let assetSwapper: Contract

  beforeEach(async () => {
    const [owner] = await ethers.getSigners()
    deployer = owner

    // deploy AssetSwapper
    const routerAddress = "0xE592427A0AEce92De3Edee1F18E0157C05861564"

    const AssetSwapper = await ethers.getContractFactory("AssetSwapper")
    assetSwapper = await AssetSwapper.deploy(routerAddress)
    await assetSwapper.deployed()

    // deploy AaveEjector
    const AaveEjector = await ethers.getContractFactory("AaveEjector")
    const ejectjorInputParams = {
      weth: ADDRESS_WETH,
      protocolDataProvider: ADDRESS_PROTOCOL_DATA_PROVIDER,
      lendingPoolAddressesProvider: AAVE_LENDING_POOL_ADDRESSESS_PROVIDER,
      assetSwapper: assetSwapper.address,
    }
    aaveEjector = await AaveEjector.deploy(ejectjorInputParams)
    aaveEjector.deployed()

    // impersonate an account to be used for testing
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: ["0xcA8Fa8f0b631EcdB18Cda619C4Fc9d197c8aFfCa"],
    })

    user = await ethers.getSigner("0xcA8Fa8f0b631EcdB18Cda619C4Fc9d197c8aFfCa")
  })

  describe("Deployment", () => {
    it("Should successfully deploy contract", async () => {
      expect(await aaveEjector.addressesProvider()).to.equal(AAVE_LENDING_POOL_ADDRESSESS_PROVIDER)
      expect(await aaveEjector.lendingPool()).to.equal(ADDRESS_LENDING_POOL)
      expect(await aaveEjector.priceOracle()).to.equal("0xA50ba011c48153De246E5192C8f9258A2ba79Ca9")
    })
  })

  describe("Ejector functions", async () => {
    let userAddress: string
    const weth = wethContract()
    const link = linkContract()
    const yfi = yfiContract()
    const dai = daiContract()
    const usdc = usdcContract()
    let aLink: Contract
    let aYfi: Contract
    let stableDebtUsdc: Contract
    let stableDebtDai: Contract

    describe("Close positions", () => {
      it("Should successfully liquidate and close user positions", async () => {
        userAddress = await user.getAddress()
        aLink = aLINKContract(await getATokenAddress(user, ADDRESS_LINK))
        aYfi = aYFIContract(await getATokenAddress(user, ADDRESS_YFI))
        stableDebtUsdc = stableDebtUSDCContract(await getStableTokenAddress(user, ADDRESS_USDC))
        stableDebtDai = stableDebtDAIContract(await getStableTokenAddress(user, ADDRESS_DAI))

        // prepare contract with tokens
        await prepareContract(user, assetSwapper, aaveEjector, link, yfi, weth)

        // nothing to borrow before deposit
        let availableBorrowsETH = await getAvailableBorrowsETH(user, userAddress)
        expect(availableBorrowsETH).to.equal(0)

        // check total collateral
        let totalCollateralETH = await getTotalCollateralETH(user, userAddress)
        expect(totalCollateralETH).to.equal(0)

        // deposit tokens into AAVE lendingpool
        await aaveEjector.connect(user).depositOnBehalfOf(userAddress, ADDRESS_LINK, ethers.utils.parseUnits("1000"))
        await aaveEjector.connect(user).depositOnBehalfOf(userAddress, ADDRESS_YFI, ethers.utils.parseUnits("1"))

        const aLINKBalance = await aLink.connect(user).balanceOf(userAddress)
        const aYFIBalance = await aYfi.connect(user).balanceOf(userAddress)

        expect(aLINKBalance).to.gte(ethers.utils.parseUnits("1000"))
        expect(aYFIBalance).to.gte(ethers.utils.parseUnits("1"))

        // check total collateral
        totalCollateralETH = await getTotalCollateralETH(user, userAddress)
        expect(totalCollateralETH).to.gt(0)

        // can borrow
        availableBorrowsETH = await getAvailableBorrowsETH(user, userAddress)
        expect(availableBorrowsETH).to.gt(0)

        // start borrowing
        let totalDebtETH = await getTotalDebtETH(user, userAddress)
        expect(totalDebtETH).to.equal(0)

        // give allowance to the contract to borrow on behalf of the user
        await stableDebtDai.connect(user).approveDelegation(aaveEjector.address, ethers.utils.parseUnits("9000"))
        await stableDebtUsdc.connect(user).approveDelegation(aaveEjector.address, ethers.utils.parseUnits("10000", 6))

        // borrow USDC and DAI
        await aaveEjector.connect(user).borrowOnBehalfOf(userAddress, ADDRESS_DAI, ethers.utils.parseUnits("9000"))
        await aaveEjector.connect(user).borrowOnBehalfOf(userAddress, ADDRESS_USDC, ethers.utils.parseUnits("10000", 6))

        totalDebtETH = await getTotalDebtETH(user, userAddress)
        expect(totalDebtETH).to.gt(0)

        // check debt token balances
        const userStableDebtDAIBalance = await stableDebtDai.connect(user).balanceOf(userAddress)
        const userStableDebtUSDCBalance = await stableDebtUsdc.connect(user).balanceOf(userAddress)
        expect(userStableDebtDAIBalance).to.gte(ethers.utils.parseUnits("9000"))
        expect(userStableDebtUSDCBalance).to.gte(ethers.utils.parseUnits("10000", 6))

        // check token balances in contract
        let contractDAIBalance = await dai.connect(user).balanceOf(aaveEjector.address)
        let contractUSDCBalance = await usdc.connect(user).balanceOf(aaveEjector.address)
        expect(contractDAIBalance).to.equal(ethers.utils.parseUnits("9000"))
        expect(contractUSDCBalance).to.equal(ethers.utils.parseUnits("10000", 6))

        await aaveEjector.connect(user).withdrawFundsToUser(ADDRESS_DAI, ethers.utils.parseUnits("9000"))
        await aaveEjector.connect(user).withdrawFundsToUser(ADDRESS_USDC, ethers.utils.parseUnits("10000", 6))

        contractDAIBalance = await dai.connect(user).balanceOf(aaveEjector.address)
        contractUSDCBalance = await usdc.connect(user).balanceOf(aaveEjector.address)
        expect(contractDAIBalance).to.equal(0)
        expect(contractUSDCBalance).to.equal(0)

        // approve the contract to pull aTokens. Otherwise withdrawal of collateral won't work
        await aLink.connect(user).approve(aaveEjector.address, ethers.constants.MaxUint256)
        await aYfi.connect(user).approve(aaveEjector.address, ethers.constants.MaxUint256)

        let wethBalance = await weth.connect(user).balanceOf(aaveEjector.address)
        expect(wethBalance).to.equal(0)

        // Gas estimation
        /*const gas: BigNumber = await aaveEjector.connect(user).estimateGas.takeLoanAndSelfLiquidate(userAddress)
        const gasPrice = await ethers.getDefaultProvider().getGasPrice()
        const gasCost = gas.mul(gasPrice)
        console.log("Gas estimation: ", gas.toString())
        console.log("Gas price: ", ethers.utils.formatUnits(gasPrice, "gwei"))
        console.log("Gas cost: ", ethers.utils.formatEther(gasCost))*/

        // close position, leaving some WETH in contract
        await aaveEjector.connect(user).takeLoanAndSelfLiquidate(userAddress)

        wethBalance = await weth.connect(user).balanceOf(aaveEjector.address)
        expect(wethBalance).to.gt(0)
      }).timeout(500000)

      it("Can't call 'executeOperation' flash loan function directly", async () => {
        const initiator = '0xcA8Fa8f0b631EcdB18Cda619C4Fc9d197c8aFfCa'
        await expect(aaveEjector.executeOperation(['0xcA8Fa8f0b631EcdB18Cda619C4Fc9d197c8aFfCa'], ["1"], ["0"], initiator, [0]))
          .to.be.revertedWith('Not callable directly')
      })
    })
  })
})

const getTotalCollateralETH = async (signer: Signer, account: string) => {
  const {
    0: totalCollateralETH,
    1: totalDebtETH,
    2: availableBorrowsETH,
    3: currentLiquidationThreshold,
    4: ltv,
    5: healthFactor
  } = await lendingPoolContract().connect(signer).getUserAccountData(ethers.utils.getAddress(account))

  return totalCollateralETH
}

const getTotalDebtETH = async (signer: Signer, account: string) => {
  const {
    0: totalCollateralETH,
    1: totalDebtETH,
    2: availableBorrowsETH,
    3: currentLiquidationThreshold,
    4: ltv,
    5: healthFactor
  } = await lendingPoolContract().connect(signer).getUserAccountData(ethers.utils.getAddress(account))

  return totalDebtETH
}

const getAvailableBorrowsETH = async (signer: Signer, account: string) => {
  const {
    0: totalCollateralETH,
    1: totalDebtETH,
    2: availableBorrowsETH,
    3: currentLiquidationThreshold,
    4: ltv,
    5: healthFactor
  } = await lendingPoolContract().connect(signer).getUserAccountData(ethers.utils.getAddress(account))

  return availableBorrowsETH
}

const getStableTokenAddress = async (signer: Signer, asset: string) => {
  const {
    0: aTokenAddress,
    1: stableDebtTokenAddress,
    2: variableDebtTokenAddress
  } = await dataProviderContract().connect(signer).getReserveTokensAddresses(ethers.utils.getAddress(asset))

  return stableDebtTokenAddress
}

const getATokenAddress = async (signer: Signer, asset: string) => {
  const {
    0: aTokenAddress,
    1: stableDebtTokenAddress,
    2: variableDebtTokenAddress
  } = await dataProviderContract().connect(signer).getReserveTokensAddresses(ethers.utils.getAddress(asset))

  return aTokenAddress
}

const prepareContract = async function (
  user: Signer,
  assetSwapper: Contract,
  aaveEjector: Contract,
  link: Contract,
  yfi: Contract,
  weth: Contract
) {
  const userAddress = await user.getAddress()

  // prepare some test tokens
  // First deposit some ETH to get WETH
  await weth.connect(user).deposit({ value: ethers.utils.parseEther("20") })

  // approve assetSwapper to spend WETH
  await weth.connect(user).approve(assetSwapper.address, ethers.utils.parseEther("20"))

  // get some link
  await assetSwapper.connect(user).swapExactOutput(
    ADDRESS_WETH,
    ethers.utils.parseEther("10"),
    ADDRESS_LINK,
    ethers.utils.parseUnits("1000"))

  // get some YFI
  await assetSwapper.connect(user).swapExactOutput(
    ADDRESS_WETH,
    ethers.utils.parseEther("10"),
    ADDRESS_YFI,
    ethers.utils.parseUnits("1"))

  // check LINK and YFI user balance after swap
  const userLINKBalance = await link.connect(user).balanceOf(userAddress)
  expect(userLINKBalance).to.equal(ethers.utils.parseUnits("1000"))

  const userYFIBalance = await yfi.connect(user).balanceOf(userAddress)
  expect(userYFIBalance).to.equal(ethers.utils.parseUnits("1"))

  // transfer some LINK to contract
  await link.connect(user).transfer(aaveEjector.address, ethers.utils.parseUnits("1000"))

  // transfer some YFI to contract
  await yfi.connect(user).transfer(aaveEjector.address, ethers.utils.parseUnits("1"))

  // check LINK and YFI balances
  const contractLINKBalance = await link.connect(user).balanceOf(aaveEjector.address)
  const contractYFIBalance = await yfi.connect(user).balanceOf(aaveEjector.address)
  expect(contractLINKBalance).to.equal(ethers.utils.parseUnits("1000"))
  expect(contractYFIBalance).to.equal(ethers.utils.parseUnits("1"))

  // check initial contract WETH balance
  const wethBalance = await weth.connect(user).balanceOf(aaveEjector.address)
  expect(wethBalance).to.equal(ethers.utils.parseUnits("0"))
}
