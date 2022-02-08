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
  ADDRESS_LENDING_POOL,
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
    aaveEjector = await AaveEjector.deploy(assetSwapper.address)
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
      expect(await aaveEjector.addressesProvider()).to.equal("0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5")
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

    beforeEach(async function () {
      this.timeout(200000)
      userAddress = await user.getAddress()
      aLink = aLINKContract(await getATokenAddress(user, ADDRESS_LINK))
      aYfi = aYFIContract(await getATokenAddress(user, ADDRESS_YFI))
      stableDebtUsdc = stableDebtUSDCContract(await getStableTokenAddress(user, ADDRESS_USDC))
      stableDebtDai = stableDebtDAIContract(await getStableTokenAddress(user, ADDRESS_DAI))

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
    })

    describe("Deposit", () => {
      it("Should successfully deposit funds into lending pool", async () => {
        // nothing to borrow before deposit
        let availableBorrowsETH = await getAvailableBorrowsETH(user, userAddress)
        expect(availableBorrowsETH).to.equal(0)

        // deposit tokens into AAVE lendingpool
        await aaveEjector.connect(user).depositOnBehalfOf(userAddress, ADDRESS_LINK, ethers.utils.parseUnits("1000"))
        await aaveEjector.connect(user).depositOnBehalfOf(userAddress, ADDRESS_YFI, ethers.utils.parseUnits("1"))

        const aLINKBalance = await aLink.connect(user).balanceOf(userAddress)
        const aYFIBalance = await aYfi.connect(user).balanceOf(userAddress)

        expect(aLINKBalance).to.gte(ethers.utils.parseUnits("1000"))
        expect(aYFIBalance).to.gte(ethers.utils.parseUnits("1"))

        // can borrow
        availableBorrowsETH = await getAvailableBorrowsETH(user, userAddress)
        expect(availableBorrowsETH).to.gt(0)
      })
    }).timeout(200000)

    /*
    describe("Borrow", () => {
      it("Should successfully borrow funds", async () => {
        // deposit tokens into AAVE lendingpool
        await aaveEjector.connect(user).depositOnBehalfOf(userAddress, ADDRESS_LINK, ethers.utils.parseUnits("1000"))
        await aaveEjector.connect(user).depositOnBehalfOf(userAddress, ADDRESS_YFI, ethers.utils.parseUnits("1"))

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
        const constractDAIBalance = await dai.connect(user).balanceOf(aaveEjector.address)
        const contractUSDCBalance = await usdc.connect(user).balanceOf(aaveEjector.address)
        expect(constractDAIBalance).to.equal(ethers.utils.parseUnits("9000"))
        expect(contractUSDCBalance).to.equal(ethers.utils.parseUnits("10000", 6))
      })

      it("can't borrow funds without depositing into lending pool", async () => {
        // start borrowing
        let totalDebtETH = await getTotalDebtETH(user, userAddress)
        expect(totalDebtETH).to.equal(0)

        // give allowance to the contract to borrow on behalf of the user
        await stableDebtDai.connect(user).approveDelegation(aaveEjector.address, ethers.utils.parseUnits("9000"))
        await stableDebtUsdc.connect(user).approveDelegation(aaveEjector.address, ethers.utils.parseUnits("10000", 6))

        // borrow USDC and DAI
        await expect(aaveEjector
          .connect(user)
          .borrowOnBehalfOf(userAddress, ADDRESS_DAI, ethers.utils.parseUnits("9000"))
        ).to.be.revertedWith('')
        await expect(aaveEjector
          .connect(user)
          .borrowOnBehalfOf(userAddress, ADDRESS_USDC, ethers.utils.parseUnits("10000", 6))
        ).to.be.revertedWith('')
      })

      it("can't borrow funds without approving delegation to contract to borrow on behalf of caller", async () => {
        // deposit tokens into AAVE lendingpool
        await aaveEjector.connect(user).depositOnBehalfOf(userAddress, ADDRESS_LINK, ethers.utils.parseUnits("1000"))
        await aaveEjector.connect(user).depositOnBehalfOf(userAddress, ADDRESS_YFI, ethers.utils.parseUnits("1"))

        // borrow USDC and DAI
        await expect(aaveEjector
          .connect(user)
          .borrowOnBehalfOf(userAddress, ADDRESS_DAI, ethers.utils.parseUnits("9000"))
        ).to.be.revertedWith('')
        await expect(aaveEjector
          .connect(user)
          .borrowOnBehalfOf(userAddress, ADDRESS_USDC, ethers.utils.parseUnits("10000", 6))
        ).to.be.revertedWith('')
      })
    })

    
    describe("Repay debt", () => {
      it("Should successfully repay debt", async () => {
        // deposit tokens into AAVE lendingpool
        await aaveEjector.connect(user).depositOnBehalfOf(userAddress, ADDRESS_LINK, ethers.utils.parseUnits("1000"))
        await aaveEjector.connect(user).depositOnBehalfOf(userAddress, ADDRESS_YFI, ethers.utils.parseUnits("1"))

        // give allowance to the contract to borrow on behalf of the user
        await stableDebtDai.connect(user).approveDelegation(aaveEjector.address, ethers.utils.parseUnits("9000"))
        await stableDebtUsdc.connect(user).approveDelegation(aaveEjector.address, ethers.utils.parseUnits("10000", 6))

        // borrow USDC and DAI
        await aaveEjector.connect(user).borrowOnBehalfOf(userAddress, ADDRESS_DAI, ethers.utils.parseUnits("9000"))
        await aaveEjector.connect(user).borrowOnBehalfOf(userAddress, ADDRESS_USDC, ethers.utils.parseUnits("10000", 6))

        let totalDebtETH = await getTotalDebtETH(user, userAddress)
        expect(totalDebtETH).to.gt(0)

        // repay debt
        await aaveEjector.connect(user).repayDebt(ADDRESS_DAI, ethers.utils.parseUnits("9010"))
        await aaveEjector.connect(user).repayDebt(ADDRESS_USDC, ethers.utils.parseUnits("10010", 6))

        // no debt after repayment
        totalDebtETH = await getTotalDebtETH(user, userAddress)
        expect(totalDebtETH).to.equal(0)

      })
    })

    
    describe("Withdraw", () => {
      it("Should successfully withdraw funds from lending pool", async () => {
        // deposit tokens into AAVE lendingpool
        await aaveEjector.connect(user).depositOnBehalfOf(userAddress, ADDRESS_LINK, ethers.utils.parseUnits("1000"))
        await aaveEjector.connect(user).depositOnBehalfOf(userAddress, ADDRESS_YFI, ethers.utils.parseUnits("1"))

        // give allowance to the contract to borrow on behalf of the user
        await stableDebtDai.connect(user).approveDelegation(aaveEjector.address, ethers.utils.parseUnits("9000"))
        await stableDebtUsdc.connect(user).approveDelegation(aaveEjector.address, ethers.utils.parseUnits("10000", 6))

        // borrow USDC and DAI
        await aaveEjector.connect(user).borrowOnBehalfOf(userAddress, ADDRESS_DAI, ethers.utils.parseUnits("9000"))
        await aaveEjector.connect(user).borrowOnBehalfOf(userAddress, ADDRESS_USDC, ethers.utils.parseUnits("10000", 6))

        // repay debt
        await aaveEjector.connect(user).repayDebt(ADDRESS_DAI, ethers.utils.parseUnits("9010"))
        await aaveEjector.connect(user).repayDebt(ADDRESS_USDC, ethers.utils.parseUnits("10010", 6))

        // approve the contract to pull aTokens
        await aLink.connect(user).approve(aaveEjector.address, ethers.constants.MaxUint256)
        await aYfi.connect(user).approve(aaveEjector.address, ethers.constants.MaxUint256)

        // withdraw funds
        await aaveEjector.connect(user).withdrawOnBehalfOf(userAddress, ADDRESS_YFI, ethers.constants.MaxUint256)
        await aaveEjector.connect(user).withdrawOnBehalfOf(userAddress, ADDRESS_LINK, ethers.constants.MaxUint256)

        const LINKBalance = await link.connect(user).balanceOf(aaveEjector.address)
        const YFIBalance = await yfi.connect(user).balanceOf(aaveEjector.address)
        expect(LINKBalance).to.gt(ethers.utils.parseUnits("0"))
        expect(YFIBalance).to.gt(ethers.utils.parseUnits("0"))
      })

      it("Only user who has deposited funds should be able to withdraw funds from lending pool", async () => {

      })

      it("Should successfully withdraw funds from contract to user address", async () => {
        // withdraw funds
        await aaveEjector.connect(user).withdrawFundsToUser(ADDRESS_DAI, ethers.utils.parseUnits("9000"))
        await aaveEjector.connect(user).withdrawFundsToUser(ADDRESS_USDC, ethers.utils.parseUnits("10000", 6))

        const contractDAIBalance = await dai.connect(user).balanceOf(aaveEjector.address)
        const contractUSDCBalance = await usdc.connect(user).balanceOf(aaveEjector.address)
        expect(contractDAIBalance).to.equal(0)
        expect(contractUSDCBalance).to.equal(0)
  })
    

    
  describe("Self liquidate", () => {
    // close position, leaving some WETH in contract
    await aaveEjector.connect(user).takeLoanAndSelfLiquidate(userAddress)

    wethBalance = await weth.connect(user).balanceOf(aaveEjector.address)
    console.log("Remaining WETH Balance: ", ethers.utils.formatEther(wethBalance))
  })*/
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
